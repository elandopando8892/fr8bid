import type { OutreachMessage, QueuePage } from './outreach.service';
import type { CarrierReview } from './review.service';
import type { RfxLane } from '@/types/domain';

export type ReadPage = (offset: number) => Promise<QueuePage>;
/** Full-content read only. Fail closed when a changing queue cannot form a complete snapshot. */
export async function readBulkDrafts(eventId: string, read: ReadPage, current = () => true) {
  const rows: OutreachMessage[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    if (!current()) throw new Error('scope');
    const page = await read(rows.length);
    if (!current()) throw new Error('scope');
    if (!Number.isSafeInteger(page.total) || page.total < 0 || page.offset !== rows.length
      || page.rows.length > 250 || (total !== undefined && page.total !== total)) throw new Error('snapshot');
    total = page.total;
    for (const row of page.rows) {
      if (!row.id || ids.has(row.id) || row.rfx_event_id !== eventId || row.channel !== 'email' || row.status !== 'drafted') throw new Error('snapshot');
      ids.add(row.id); rows.push(row);
    }
    if (rows.length > total || page.has_more !== (rows.length < total)) throw new Error('snapshot');
    if (!page.has_more) return rows;
    if (!page.rows.length) throw new Error('snapshot');
  }
  throw new Error('snapshot');
}

export type Issue = 'contact' | 'audience' | 'content' | 'version' | 'variables' | 'routes' | 'links' | 'sharedLink' | 'required' | 'duplicate' | 'missingDraft' | 'event';
export interface Finding { id: string; vendorId: string; name: string; issues: Issue[]; }
export interface BulkReport { checked: number; expected: number; clean: number; findings: Finding[]; checkedAt: string; }
export const normalizeText = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Never attach this inert template to the live document; no images, scripts or links are activated. */
export function inspectContent(message: OutreachMessage) {
  const template = document.createElement('template');
  template.innerHTML = message.html_body || '';
  template.content.querySelectorAll('script,style,noscript,iframe,object').forEach(node => node.remove());
  const text = normalizeText([message.subject, message.text_body, [...template.content.childNodes].map(node => node.textContent || '').join(' ')].filter(Boolean).join(' '));
  const routeRows = [...template.content.querySelectorAll('tr')].map(row => normalizeText(row.textContent || ''));
  const links: string[] = [];
  let invalidLink = false;
  const rawLinks = [...template.content.querySelectorAll('a[href]')].map(a => a.getAttribute('href') || '');
  rawLinks.push(...(message.text_body?.match(/https?:\/\/[^\s<>"']+/g) || []));
  const kinds = new Set<string>();
  for (const raw of rawLinks) {
    try {
      const url = new URL(raw);
      if (!/\/(rfx-bid|carrier-profile)(?:\.html)?\/?$/.test(url.pathname)) continue;
      if (url.protocol !== 'https:' || url.username || url.password || !url.searchParams.get('token')) { invalidLink = true; continue; }
      kinds.add(url.pathname.includes('rfx-bid') ? 'bid' : 'profile');
      // Token equality also catches the same credential reused under a different URL.
      links.push(url.searchParams.get('token')!);
    } catch { if (/rfx-bid|carrier-profile/.test(raw)) invalidLink = true; }
  }
  return { text, routeRows, links: [...new Set(links)], validLinks: !invalidLink && kinds.size === 2 };
}

export function reviewBulk(input: { rows: OutreachMessage[]; lanes: RfxLane[]; reviews: CarrierReview[]; requiredTexts: string[]; eventReference?: string }): BulkReport {
  const expected = new Map<string, { name: string; lanes: RfxLane[] }>();
  for (const lane of input.lanes) {
    const invitations = (lane.invitations || []) as { vendor_id?: string; invitation_status?: string; vendors?: { vendor_name?: string } }[];
    for (const inv of invitations) {
      if (!inv.vendor_id || ['archived', 'declined'].includes(String(inv.invitation_status || '').toLowerCase())) continue;
      const item = expected.get(inv.vendor_id) || { name: inv.vendors?.vendor_name || inv.vendor_id, lanes: [] };
      item.lanes.push(lane); expected.set(inv.vendor_id, item);
    }
  }
  const reviews = new Map(input.reviews.map(r => [r.vendor_id, r]));
  const seen = new Map<string, Finding[]>();
  const linkOwners = new Map<string, Set<string>>();
  const findings = input.rows.map(row => {
    const vendorId = row.vendor_id || '';
    const finding: Finding = { id: row.id, vendorId, name: expected.get(vendorId)?.name || vendorId || row.id, issues: [] };
    const add = (issue: Issue) => { if (!finding.issues.includes(issue)) finding.issues.push(issue); };
    const review = reviews.get(vendorId);
    const email = (row.recipient_email || '').trim().toLowerCase();
    if (!review?.reviewed || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)
      || email !== (review.contact_snapshot?.email || '').trim().toLowerCase()) add('contact');
    if (!expected.has(vendorId)) add('audience');
    if (!row.subject?.trim() || !(row.text_body?.trim() || row.html_body?.trim())) add('content');
    if (typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) add('version');
    if (/\{\{[^}]*\}\}|\$\{[^}]*\}|\[\[[^\]]*\]\]/.test([row.subject, row.html_body, row.text_body].join(' '))) add('variables');
    const content = inspectContent(row);
    if (input.eventReference && !content.text.includes(normalizeText(input.eventReference))) add('event');
    const lanes = expected.get(vendorId)?.lanes || [];
    // Require origin and destination together in one route row, not scattered anywhere in the email.
    if (!lanes.length || lanes.some(lane => !lane.origin || !lane.destination || !content.routeRows.some(text =>
      text.includes(normalizeText(lane.origin!)) && text.includes(normalizeText(lane.destination!))))) add('routes');
    if (!content.validLinks) add('links');
    if (input.requiredTexts.some(text => !content.text.includes(normalizeText(text)))) add('required');
    for (const link of content.links) { const owners = linkOwners.get(link) || new Set<string>(); owners.add(vendorId); linkOwners.set(link, owners); }
    const siblings = seen.get(vendorId) || []; siblings.push(finding); seen.set(vendorId, siblings);
    return { finding, links: content.links };
  });
  for (const { finding, links } of findings) {
    if ((seen.get(finding.vendorId)?.length || 0) > 1) finding.issues.push('duplicate');
    if (links.some(link => (linkOwners.get(link)?.size || 0) > 1)) finding.issues.push('sharedLink');
  }
  const exceptions = findings.map(item => item.finding).filter(item => item.issues.length);
  for (const [vendorId, value] of expected) if (!seen.has(vendorId)) exceptions.push({ id: '', vendorId, name: value.name, issues: ['missingDraft'] });
  return { checked: input.rows.length, expected: expected.size, clean: findings.filter(item => !item.finding.issues.length).length, findings: exceptions, checkedAt: new Date().toISOString() };
}

/** Scope includes auth identity in the caller; input versions invalidate a cached report. */
export function bulkReviewKey(scope: string, drafts: OutreachMessage[], lanes: RfxLane[], reviews: CarrierReview[], requiredTexts: string[]) {
  return JSON.stringify([scope, drafts.map(m => [m.id, m.updated_at, m.status, m.recipient_email, m.vendor_id]).sort(), lanes, reviews, requiredTexts]);
}
