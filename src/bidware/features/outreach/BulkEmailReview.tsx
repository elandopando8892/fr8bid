import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ui';
import { useLang } from '@/i18n/language';
import { bulkText as t } from '@/i18n/outreach-bulk';
import type { RfxDetail } from '@/features/rfx-admin/rfx.service';
import type { CarrierReview } from './review.service';
import { listQueuePage, type OutreachMessage } from './outreach.service';
import { bulkReviewKey, readBulkDrafts, reviewBulk, type BulkReport } from './bulk-review';

export function BulkEmailReview({ eventId, scope, drafts, detail, reviews, refreshVersion, disabled, onReview }: {
  eventId: string; scope: string; drafts: OutreachMessage[]; detail?: RfxDetail;
  reviews?: CarrierReview[]; refreshVersion: number; disabled: boolean; onReview: (id: string) => void;
}) {
  useLang();
  const [open, setOpen] = useState(false);
  const [required, setRequired] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [cached, setCached] = useState<{ key: string; report: BulkReport } | null>(null);
  const criteria = required.split('\n').map(s => s.trim()).filter(Boolean);
  const emails = drafts.filter(row => row.channel === 'email');
  const sourceScope = `${scope}:${refreshVersion}:${JSON.stringify(detail?.event)}`;
  const key = bulkReviewKey(sourceScope, emails, detail?.lanes || [], reviews || [], criteria);
  const generation = useRef(0);
  const close = () => { generation.current++; setOpen(false); };
  const live = useRef({ key, mounted: true, open });
  live.current.key = key; live.current.open = open;
  useEffect(() => { live.current.mounted = true; return () => { live.current.mounted = false; }; }, []);
  useEffect(() => { generation.current++; }, [key]);
  const report = cached?.key === key ? cached.report : null;
  const run = async () => {
    const captured = key;
    const request = ++generation.current;
    const current = () => live.current.mounted && live.current.key === captured && live.current.open && generation.current === request;
    setBusy(true); setError(false);
    try {
      const rows = await readBulkDrafts(eventId, offset => listQueuePage({ eventId, channel: 'email', state: 'drafted', search: '', offset, limit: 250, includeContent: true }), current);
      if (!current()) return;
      // A version or membership change between the queue read and full read needs a fresh snapshot.
      if (bulkReviewKey(sourceScope, rows, detail?.lanes || [], reviews || [], criteria) !== captured) throw new Error('snapshot');
      setCached({ key: captured, report: reviewBulk({ rows, lanes: detail?.lanes || [], reviews: reviews || [], requiredTexts: criteria, eventReference: typeof detail?.event?.rfx_id === 'string' ? detail.event.rfx_id : undefined }) });
    } catch { if (current()) setError(true); }
    finally { if (live.current.mounted) setBusy(false); }
  };
  return <>
    <button type="button" disabled={disabled || !detail || !reviews} onClick={() => setOpen(true)}>{t('open')}</button>
    {open && <Dialog title={t('open')} ariaLabel={t('open')} onClose={close} width={1000}>
      <p>{t('limits')}</p>
      {detail?.event?.due_date && <p>{t('deadline', detail.event.due_date)}</p>}
      <label>{t('required')}<textarea style={{ display: 'block', width: '100%', minHeight: 90 }} value={required} disabled={busy} onChange={event => { setRequired(event.target.value); setError(false); }} /></label>
      <p className="muted">{t('criteria')}</p>
      {!criteria.length && <p role="status">{t('partial')}</p>}
      <button type="button" disabled={busy || disabled || !!report} onClick={() => void run()}>{busy ? t('running') : t('run')}</button>
      {error && <p role="alert">{t('error')}</p>}
      {report && <section aria-live="polite">
        <p><b>{t('summary', report.checked, report.expected, report.clean, report.findings.length)}</b></p>
        <p className="muted">{t('asof', report.checkedAt)}</p>
        {!report.findings.length && <p>{t('clean')}</p>}
        {report.findings.length > 0 && <table><tbody>{report.findings.map(row => <tr key={row.id || `missing:${row.vendorId}`}>
          <th scope="row">{row.name}</th>
          <td>{row.issues.map(issue => t(issue === 'required' ? 'requiredMissing' : issue)).join(' · ')}</td>
          <td>{row.id && <button type="button" disabled={disabled || busy} onClick={() => { close(); onReview(row.id); }}>{t('review')}</button>}</td>
        </tr>)}</tbody></table>}
      </section>}
    </Dialog>}
  </>;
}
