import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useLang, locale } from '@/i18n/language';
import { followupText as t } from '@/i18n/response-followup';
import { readResponseFollowup } from './response-followup.service';
import { FOLLOWUP_REASONS, FOLLOWUP_TTL, followupCurrent, followupKey, reconcileResponses, responseSourcePath,
  type FollowupEvidence, type FollowupScope, type FollowupReason, type FollowupRow } from './response-followup';
import type { LaneWithInvitations } from './stages';
import './response-followup.css';

type Props = { eventId: string; lanes: LaneWithInvitations[]; enabled: boolean; anonymous: boolean;
  nameOf: (id: string) => string; onDetail: (lane: LaneWithInvitations, invitation: Record<string, unknown>) => void; onCompare: (laneId: string) => void };

export function ResponseFollowupPanel(props: Props) {
  useLang();
  const { user, role, roleLoaded } = useAuth();
  const organizationId = user?.app_metadata?.rateware_organization_id ?? user?.app_metadata?.organization_id;
  if (!user || !roleLoaded || typeof organizationId !== 'string' || !organizationId || !['admin', 'operator', 'viewer'].includes(role)) {
    return <section className="card response-followup" aria-label={t('title')}><h2>{t('title')}</h2><p>{t('session')}</p></section>;
  }
  const scope = { userId: user.id, organizationId, role, eventId: props.eventId };
  return <ScopedFollowup key={followupKey(scope)} {...props} scope={scope} />;
}

function ScopedFollowup(props: Props & { scope: FollowupScope }) {
  const [open, setOpen] = useState(false);
  return <details className="card response-followup" open={open}>
    <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}><strong>{t('title')}</strong></summary>
    {open && <FollowupReader {...props} />}
  </details>;
}

function FollowupReader({ scope, lanes, enabled, anonymous, nameOf, onDetail, onCompare }: Props & { scope: FollowupScope }) {
  const { userId, organizationId, role, eventId } = scope;
  const [result, setResult] = useState<{ evidence: FollowupEvidence; source: LaneWithInvitations[] } | null>(null);
  const [error, setError] = useState(false), [loading, setLoading] = useState(false), [now, setNow] = useState(Date.now);
  const generation = useRef(0), inFlight = useRef(false);
  const clear = useCallback(() => { generation.current++; inFlight.current = false; setResult(null); setError(false); setLoading(false); }, []);
  const refresh = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    const attempt = ++generation.current;
    inFlight.current = true; setResult(null); setError(false); setLoading(true);
    try {
      const evidence = await readResponseFollowup(scope);
      // Validate every relation before showing even the summary counts.
      reconcileResponses(lanes, evidence);
      if (generation.current === attempt) { setResult({ evidence, source: lanes }); setNow(Date.now()); }
    } catch {
      if (generation.current === attempt) setError(true);
    } finally {
      if (generation.current === attempt) { inFlight.current = false; setLoading(false); }
    }
  }, [enabled, userId, organizationId, role, eventId, lanes]);
  useEffect(() => {
    if (enabled) void refresh(); else clear();
    return () => { generation.current++; inFlight.current = false; };
  }, [refresh, enabled, clear]);
  useEffect(() => {
    if (!result) return;
    const update = () => setNow(Date.now());
    const timer = window.setTimeout(update, Math.max(0, result.evidence.checkedAt + FOLLOWUP_TTL - Date.now()));
    window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [result]);
  const current = enabled && result && result.source === lanes && followupCurrent(result.evidence, scope, now);
  return <>
    <p>{t('intro')}</p>
    <div className="response-followup-actions"><button type="button" disabled={!enabled || loading} onClick={() => void refresh()}>{t('read')}</button>
      {loading && <button type="button" onClick={clear}>{t('cancel')}</button>}</div>
    <div role="status" aria-live="polite">{!enabled ? <p>{t('paused')}</p> : loading ? <p>{t('loading')}</p> : error ? <p>{t('error')}</p>
      : result && !current ? <p>{t('expired')}</p> : !result ? <p>{t('idle')}</p> : null}</div>
    {current && result && <FollowupSummary key={JSON.stringify([result.evidence.checkedAt, anonymous])} evidence={result.evidence}
      rows={reconcileResponses(lanes, result.evidence, anonymous ? (id) => nameOf(id) : undefined)} onDetail={onDetail} onCompare={onCompare} />}
  </>;
}

function FollowupSummary({ evidence, rows, onDetail, onCompare }: { evidence: FollowupEvidence; rows: FollowupRow[]; onDetail: Props['onDetail']; onCompare: Props['onCompare'] }) {
  const [filter, setFilter] = useState<FollowupReason | ''>(''), [search, setSearch] = useState(''), [limit, setLimit] = useState(40);
  const visible = rows.filter(row => (!filter || row.reason === filter) && `${row.name} ${row.route}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const vendorIds = new Set(rows.map(row => row.vendorId));
  const partial = evidence.partial || evidence.activity.some(id => !vendorIds.has(id)) || evidence.signals.some(signal => !vendorIds.has(signal.vendorId));
  const stats = [ ['carriers', new Set(rows.map(row => row.vendorId)).size],
    ['replies', new Set(rows.filter(row => row.sources.length).map(row => row.vendorId)).size],
    ['offers', rows.filter(row => row.hasOffer).length], ['attention', rows.filter(row => row.reason === 'offer_attention').length] ] as const;
  return <div className="response-followup-result">
    {partial && <p className="response-followup-warning" role="note">{t('partial')}</p>}
    <p>{t('checked', new Date(evidence.checkedAt).toLocaleTimeString(locale()))}</p>
    <dl className="response-followup-stats">{stats.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>
    <p className="cell-sub">{t('limits')}</p>
    <div className="response-followup-actions"><label>{t('filter')}<select aria-label={t('filter')} value={filter} onChange={event => { setFilter(event.target.value as FollowupReason | ''); setLimit(40); }}>
      <option value="">{t('all')}</option>{FOLLOWUP_REASONS.map(reason => <option key={reason} value={reason}>{t(reason)}</option>)}</select></label>
      <label>{t('search')}<input aria-label={t('search')} value={search} onChange={event => { setSearch(event.target.value); setLimit(40); }} /></label></div>
    <p>{t('count', Math.min(limit, visible.length), visible.length)}</p>
    <div className="response-followup-scroll" tabIndex={0} aria-label={t('title')}><table><thead><tr>
      <th>{t('carrier')}</th><th>{t('response')}</th><th>{t('offerColumn')}</th><th>{t('sources')}</th>
    </tr></thead><tbody>{visible.slice(0, limit).map(row => <tr key={row.id} data-followup-row={row.id}>
      <td><strong>{row.name}</strong><div>{row.route}</div><small>{t(row.reason)}</small></td>
      <td>{t(row.response)}</td>
      <td>{row.hasOffer ? <><strong>{t(row.issues.length ? 'offer_attention' : 'offer')}</strong>{row.issues.map(issue => <div key={issue}>{t(issue === 'expired' ? 'expiredDate' : issue)}</div>)}</> : t('noOffer')}</td>
      <td><div className="response-followup-links">{row.sources.slice(0, 3).map(source => <Link key={`${source.kind}:${source.id}`} to={responseSourcePath(evidence.scope.eventId, source)}>{t(source.kind)}</Link>)}
        {row.hasOffer && <><button type="button" onClick={() => onDetail(row.lane, row.invitation)}>{t('detail')}</button><button type="button" onClick={() => onCompare(String(row.lane.id))}>{t('compare')}</button></>}</div>
        {row.sources.length > 3 && <small>{t('sourceLimit', row.sources.length)}</small>}</td>
    </tr>)}</tbody></table></div>
    {!visible.length && <p>{t('empty')}</p>}
    {visible.length > limit && <button type="button" onClick={() => setLimit(count => count + 40)}>{t('more')}</button>}
    <p className="cell-sub">{t('advisory')}</p>
  </div>;
}
