import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { bulkReviewKey, inspectContent, readBulkDrafts, reviewBulk } from '../src/bidware/features/outreach/bulk-review';
import type { OutreachMessage } from '../src/bidware/features/outreach/outreach.service';
import type { CarrierReview } from '../src/bidware/features/outreach/review.service';
import type { RfxLane } from '../src/bidware/types/domain';

beforeAll(() => { vi.stubGlobal('document', parseHTML('<html><body></body></html>').document); });
const row = (i = 0): OutreachMessage => ({
  id: `message-${i}`, vendor_id: `vendor-${i}`, rfx_event_id: 'event', channel: 'email', status: 'drafted',
  recipient_email: `person${i}@example.com`, subject: 'Invitation', updated_at: '2026-11-03T12:00:00Z',
  html_body: `<p>10 noviembre 2026 23:59 America/Mexico_City · 40 mensuales</p><table><tr><td>Origin</td><td>Destination</td></tr></table><a href="https://portal.example/rfx-bid.html?token=bid${i}">Bid</a><a href="https://portal.example/carrier-profile.html?token=profile${i}">Profile</a>`,
});
const review = (i = 0): CarrierReview => ({ vendor_id: `vendor-${i}`, reviewed: true, contact_snapshot: { email: `person${i}@example.com` } });
const lane = (n = 1): RfxLane => ({ id: 'lane', origin: 'Origin', destination: 'Destination', invitations: Array.from({ length: n }, (_, i) => ({ vendor_id: `vendor-${i}`, vendors: { vendor_name: `Carrier ${i}` }, invitation_status: 'draft' })) });
const report = (rows = [row()], options: { lanes?: RfxLane[]; reviews?: CarrierReview[]; requiredTexts?: string[] } = {}) => reviewBulk({ rows, lanes: options.lanes || [lane()], reviews: options.reviews || [review()], requiredTexts: options.requiredTexts || [] });

describe('read-only bulk snapshot', () => {
  it('reads 41 complete messages in one page, not 41 per-message reads', async () => {
    const rows = Array.from({ length: 41 }, (_, i) => row(i));
    const read = vi.fn(async () => ({ rows, total: 41, offset: 0, has_more: false }));
    expect(await readBulkDrafts('event', read)).toEqual(rows);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('paginates beyond 250 without dropping messages', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => row(i));
    const read = vi.fn(async (offset: number) => ({ rows: rows.slice(offset, offset + 250), total: rows.length, offset, has_more: offset + 250 < rows.length }));
    expect(await readBulkDrafts('event', read)).toHaveLength(501);
    expect(read.mock.calls.map(call => call[0])).toEqual([0, 250, 500]);
  });
  it.each([
    { rows: [{ ...row(), rfx_event_id: 'another-event' }], total: 1, offset: 0, has_more: false },
    { rows: [{ ...row(), status: 'sent' }], total: 1, offset: 0, has_more: false },
    { rows: [{ ...row(), channel: 'whatsapp' }], total: 1, offset: 0, has_more: false },
    { rows: [row(), row()], total: 2, offset: 0, has_more: false },
    { rows: [row()], total: 2, offset: 0, has_more: false },
    { rows: [], total: 1, offset: 0, has_more: true },
    { rows: [row()], total: 1, offset: 99, has_more: false },
  ])('rejects malformed, incomplete, or out-of-scope pages %#', async page => {
    await expect(readBulkDrafts('event', async () => page)).rejects.toThrow('snapshot');
  });
  it('rejects changed total between pages', async () => {
    const read = vi.fn().mockResolvedValueOnce({ rows: [row()], total: 2, offset: 0, has_more: true }).mockResolvedValueOnce({ rows: [row(1)], total: 3, offset: 1, has_more: true });
    await expect(readBulkDrafts('event', read)).rejects.toThrow('snapshot');
  });
  it('discards a response after scope cancellation without fetching again', async () => {
    let current = true;
    const read = vi.fn(async () => { current = false; return { rows: [row()], total: 1, offset: 0, has_more: false }; });
    await expect(readBulkDrafts('event', read, () => current)).rejects.toThrow('scope');
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('consolidated exceptions', () => {
  it('validates 41 carriers and retains only exceptions, not credentials or bodies', () => {
    const rows = Array.from({ length: 41 }, (_, i) => row(i));
    const result = report(rows, { lanes: [lane(41)], reviews: rows.map((_, i) => review(i)), requiredTexts: ['23:59', '40 mensuales'] });
    expect(result).toMatchObject({ checked: 41, expected: 41, clean: 41, findings: [] });
    expect(JSON.stringify(result)).not.toContain('token');
    expect(JSON.stringify(result)).not.toContain('html_body');
  });
  it('flags exact recipient mismatch even with a previously reviewed carrier', () => {
    expect(report([{ ...row(), recipient_email: 'other@example.com' }]).findings[0].issues).toContain('contact');
    expect(report([row()], { reviews: [{ ...review(), reviewed: false }] }).findings[0].issues).toContain('contact');
  });
  it('finds carriers with missing drafts and excludes inactive invitations', () => {
    const lanes = [lane(2), { ...lane(), id: 'archived', invitations: [{ vendor_id: 'gone', invitation_status: 'archived' }] }];
    expect(report([row()], { lanes }).findings).toEqual([{ id: '', vendorId: 'vendor-1', name: 'Carrier 1', issues: ['missingDraft'] }]);
    expect(report([row(2)]).findings[0].issues).toContain('audience');
  });
  it('requires origin and destination together, detecting a missing lane', () => {
    const broken = { ...row(), html_body: row().html_body!.replace('<td>Destination</td>', '<td>Elsewhere</td>') + '<p>Destination</p>' };
    expect(report([broken]).findings[0].issues).toContain('routes');
    expect(report([row()], { lanes: [lane(), { ...lane(), id: 'second', destination: 'Different destination' }] }).findings[0].issues).toContain('routes');
  });
  it('flags reused private credentials for both carriers without leaking them', () => {
    const second = { ...row(1), html_body: row(1).html_body!.replace('bid1', 'bid0') };
    const result = report([row(), second], { lanes: [lane(2)], reviews: [review(), review(1)] });
    expect(result.findings.map(item => item.issues)).toEqual([['sharedLink'], ['sharedLink']]);
    expect(JSON.stringify(result)).not.toMatch(/token=|bid0|portal.example/);
  });
  it('rejects insecure/private-link lookalikes without opening them', () => {
    expect(report([{ ...row(), html_body: row().html_body!.replace('https://portal.example/rfx-bid', 'http://portal.example/rfx-bid') }]).findings[0].issues).toContain('links');
  });
  it('reports unresolved variables, missing version/content and required date/volume text', () => {
    const result = report([{ ...row(), subject: '{{event_name}}', updated_at: undefined }], { requiredTexts: ['missing volume'] });
    expect(result.findings[0].issues).toEqual(expect.arrayContaining(['variables', 'version', 'required']));
    expect(report([{ ...row(), subject: '' }]).findings[0].issues).toContain('content');
  });
  it('checks the registered event reference in subject/body', () => {
    const result = reviewBulk({ rows: [row()], lanes: [lane()], reviews: [review()], requiredTexts: [], eventReference: 'RFx-SYNTHETIC' });
    expect(result.findings[0].issues).toContain('event');
  });
  it('flags duplicate drafts for the same carrier', () => {
    expect(report([row(), { ...row(), id: 'second' }]).findings.every(item => item.issues.includes('duplicate'))).toBe(true);
  });
  it('parses inertly, ignores scripts/styles and never appends untrusted HTML', () => {
    const append = vi.spyOn(document.body, 'appendChild');
    const content = inspectContent({ ...row(), html_body: row().html_body + '<img src="https://tracker.example/pixel"><script>40 secret</script><style>hidden secret</style>' });
    expect(content.text).not.toContain('secret');
    expect(append).not.toHaveBeenCalled();
    expect(document.body.children).toHaveLength(0);
  });
  it('invalidates cached reports on versions, identity, recipients, lane/contact reviews and criteria', () => {
    const key = bulkReviewKey('scope', [row()], [lane()], [review()], []);
    expect(bulkReviewKey('scope', [row()], [lane()], [review()], [])).toBe(key);
    for (const value of [
      bulkReviewKey('different-user', [row()], [lane()], [review()], []),
      bulkReviewKey('scope', [{ ...row(), updated_at: '2026-11-04T12:00:00Z' }], [lane()], [review()], []),
      bulkReviewKey('scope', [{ ...row(), recipient_email: 'other@example.com' }], [lane()], [review()], []),
      bulkReviewKey('scope', [row()], [], [review()], []),
      bulkReviewKey('scope', [row()], [lane()], [{ ...review(), reviewed: false }], []),
      bulkReviewKey('scope', [row()], [lane()], [review()], ['23:59']),
    ]) expect(value).not.toBe(key);
  });
});
