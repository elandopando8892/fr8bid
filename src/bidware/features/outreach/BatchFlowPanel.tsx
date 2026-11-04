import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useLang, locale } from '@/i18n/language';
import { flowText as t } from '@/i18n/batch-flow';
import { FLOW_REASONS, FLOW_TTL_MS, flowIsCurrent, flowScopeKey, type FlowChannel, type FlowReason, type FlowScope } from './batch-flow';
import { FlowReadError, readFlow, type FlowResult } from './batch-flow.service';
import { TRACKING_LABEL, type TrackingState } from './outreach.service';
import './batch-flow.css';

export function BatchFlowPanel({ eventId, templateId, refreshKey = 0, enabled = true }: { eventId: string; templateId?: string; refreshKey?: number; enabled?: boolean }) {
  useLang();
  const { user, role, roleLoaded } = useAuth();
  const organizationId = user?.app_metadata?.rateware_organization_id ?? user?.app_metadata?.organization_id;
  if (!user || !roleLoaded || typeof organizationId !== 'string' || !organizationId) {
    return <section className="card flow-panel" aria-label={t('title')}><h2>{t('title')}</h2><p>{t('session')}</p></section>;
  }
  const scope = { userId: user.id, organizationId, role, eventId };
  return <ScopedFlow key={JSON.stringify([flowScopeKey(scope), templateId])} scope={scope} templateId={templateId} refreshKey={refreshKey} enabled={enabled} />;
}

function ScopedFlow({ scope, templateId, refreshKey, enabled }: { scope: FlowScope; templateId?: string; refreshKey: number; enabled: boolean }) {
  const [channel, setChannel] = useState<FlowChannel>('email');
  return <section className="card flow-panel" aria-label={t('title')}>
    <header><div><h2>{t('title')}</h2><p>{t('intro')}</p></div>
      <label>{t('channel')}<select aria-label={t('channel')} disabled={!enabled} value={channel} onChange={event => setChannel(event.target.value as FlowChannel)}>
        <option value="email">{t('email')}</option><option value="whatsapp">WhatsApp</option>
      </select></label></header>
    <FlowReader key={channel} scope={scope} channel={channel} templateId={templateId} refreshKey={refreshKey} enabled={enabled} />
  </section>;
}

function FlowReader({ scope, channel, templateId, refreshKey, enabled }: { scope: FlowScope; channel: FlowChannel; templateId?: string; refreshKey: number; enabled: boolean }) {
  const [result, setResult] = useState<FlowResult | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'error' | 'incomplete' | 'scope' | 'selection' | null>(null);
  const [now, setNow] = useState(Date.now);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const { userId, organizationId, role, eventId } = scope;
  const snapshot = result?.kind === 'ready' ? result.snapshot : null;
  useEffect(() => {
    if (!snapshot) return;
    const update = () => setNow(Date.now());
    const timeout = window.setTimeout(update, Math.max(0, snapshot.checkedAt + FLOW_TTL_MS - Date.now()));
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearTimeout(timeout); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [snapshot]);
  const clear = useCallback(() => { generation.current++; inFlight.current = false; setResult(null); setError(null); setLoading(false); }, []);
  const refresh = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    const attempt = ++generation.current;
    inFlight.current = true;
    setResult(null); setError(null); setLoading(true);
    try {
      const next = await readFlow({ userId, organizationId, role, eventId }, channel, { templateId, campaignId: campaignId || undefined }, () => generation.current === attempt);
      if (generation.current !== attempt) return;
      setResult(next); setNow(Date.now());
      if (next.kind === 'choose') setCampaigns(next.campaigns);
    } catch (failure) {
      if (generation.current === attempt) {
        setError(failure instanceof FlowReadError && failure.code !== 'changed' ? failure.code : 'error');
      }
    } finally { if (generation.current === attempt) { inFlight.current = false; setLoading(false); } }
  }, [enabled, userId, organizationId, role, eventId, channel, templateId, campaignId]);
  useEffect(() => {
    if (enabled) void refresh(); else clear();
    // A cancelled/obsolete read cannot continue its pages or publish a result.
    // No polling, focus fetches or automatic retries on failures.
    return () => { generation.current++; inFlight.current = false; };
  }, [enabled, refresh, refreshKey, clear]);
  const current = enabled && snapshot && flowIsCurrent(snapshot, scope, now);
  return <>
    <p className="flow-hint">{enabled ? t('automatic') : t('paused')}</p>
    {campaigns.length > 0 && <label className="flow-campaign">{t('campaign')}<select aria-label={t('campaign')} disabled={!enabled} value={campaignId} onChange={event => { clear(); setCampaignId(event.target.value); }}>
      <option value="">{t('chooseOption')}</option>{campaigns.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>}
    <div className="flow-actions">
      <button type="button" disabled={loading || !enabled} onClick={() => void refresh()}>{loading ? t('loading') : t('read')}</button>
      {loading && <button type="button" onClick={clear}>{t('cancel')}</button>}
      <Link to={`/rfx/${scope.eventId}/review`}>{t('reviewLink')}</Link>
      <Link to={`/carrier-fit?event=${scope.eventId}`}>{t('fitLink')}</Link>
      <Link to={`/rfx/${scope.eventId}/delivery`}>{t('queueLink')}</Link>
    </div>
    <div role="status" aria-live="polite">
      {error ? <p className="flow-warning">{t(error)}</p> : loading ? <p>{t('loading')}</p> : result?.kind === 'choose' ? <p>{t('choose')}</p>
        : snapshot && !current ? <p className="flow-warning">{t('expired')}</p> : !snapshot ? <p>{t('idle')}</p> : null}
    </div>
    {current && snapshot && <FlowSummary key={snapshot.checkedAt} snapshot={snapshot} />}
  </>;
}

function FlowSummary({ snapshot }: { snapshot: NonNullable<Extract<FlowResult, { kind: 'ready' }>['snapshot']> }) {
  const [filter, setFilter] = useState<FlowReason | ''>('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(40);
  const counts = snapshot.counts;
  const rows = snapshot.rows.filter(row => (!filter || row.reason === filter) && row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const stats = [['selected', counts.selected], ['reviewed', counts.reviewed], ['toPrepare', counts.prepare], ['existingCount', counts.existing], ['pending', counts.pending]] as const;
  return <div className="flow-result">
    <p>{t('checked', new Date(snapshot.checkedAt).toLocaleTimeString(locale()))}</p>
    <p>{snapshot.campaign ? `${t('campaign')}: ${snapshot.campaign.name}` : t('noCampaign')}</p>
    <dl className="flow-stats">{stats.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>
    <p>{t('equation', counts.selected, counts.prepare, counts.existing, counts.pending)}</p>
    {counts.existingAttention > 0 && <p className="flow-warning">{t('existingAttention', counts.existingAttention)}</p>}
    <p>{t('messageCount', counts.messages, counts.outsideMessages)}</p>
    <p className="flow-warning">{t('limits')}</p>
    <p className="flow-hint">{t('readingOnly')}</p>
    <details><summary>{t('details')}</summary>
      <div className="flow-filters"><label>{t('filter')}<select aria-label={t('filter')} value={filter} onChange={event => { setFilter(event.target.value as FlowReason | ''); setLimit(40); }}>
        <option value="">{t('all')} ({counts.total})</option>{FLOW_REASONS.map(reason => <option key={reason} value={reason}>{t(reason)} ({snapshot.rows.filter(row => row.reason === reason).length})</option>)}
      </select></label><label>{t('search')}<input value={search} onChange={event => { setSearch(event.target.value); setLimit(40); }} /></label></div>
      <p role="status">{t('visible', Math.min(limit, rows.length), rows.length)}</p>
      <div className="flow-table" tabIndex={0} role="region" aria-label={t('details')}><table><thead><tr><th>{t('carrier')}</th><th>{t('state')}</th><th>{t('routes')}</th><th>{t('records')}</th></tr></thead>
        <tbody>{rows.slice(0, limit).map(row => <tr key={row.id}><td><b>{row.name}</b><small>{t(row.selected ? 'selectedRow' : 'excludedRow')} · {t(row.reviewed ? 'reviewedRow' : 'pendingRow')}</small></td>
          <td>{t(row.reason)}</td><td>{row.routes.map((route, index) => <div key={index}>{route}</div>)}<small>{t('routesCount', row.routeCount)}</small></td>
          <td>{row.messages.length ? <><span>{t('recordCount', row.messages.length)}</span><ul>{row.messages.slice(0, 5).map((message, index) => <li key={message.id}><Link to={`/rfx/${snapshot.scope.eventId}/delivery?message=${encodeURIComponent(message.id)}`}>{t('recordLink', TRACKING_LABEL[message.status as TrackingState] || t('unknown'), index + 1)}</Link></li>)}</ul></> : '—'}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>{t('noRows')}</p>}
      {rows.length > limit && <button type="button" onClick={() => setLimit(value => value + 40)}>{t('more')}</button>}
    </details>
  </div>;
}
