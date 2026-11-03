import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BulkEmailReview } from '../src/bidware/features/outreach/BulkEmailReview';
import type { OutreachMessage, QueuePage } from '../src/bidware/features/outreach/outreach.service';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../src/bidware/features/outreach/outreach.service', () => ({ listQueuePage: read }));
let root: Root;
let container: HTMLElement;
const message: OutreachMessage = { id: 'draft', vendor_id: 'vendor', rfx_event_id: 'event', status: 'drafted', channel: 'email', recipient_email: 'contact@example.com', subject: 'Invitation', updated_at: '2026-11-03T00:00:00Z', html_body: '<table><tr><td>Origin</td><td>Destination</td></tr></table><a href="https://portal.example/rfx-bid.html?token=bid">Bid</a><a href="https://portal.example/carrier-profile.html?token=profile">Profile</a>' };
const props = { eventId: 'event', scope: 'user:event', drafts: [message], detail: { event: { id: 'event' }, lanes: [{ id: 'lane', origin: 'Origin', destination: 'Destination', invitations: [{ vendor_id: 'vendor' }] }] }, reviews: [{ vendor_id: 'vendor', reviewed: true, contact_snapshot: { email: 'contact@example.com' } }], refreshVersion: 0, disabled: false, onReview: vi.fn() };
beforeEach(() => {
  const dom = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.getElementById('root')!;
  root = createRoot(container);
  read.mockReset(); read.mockResolvedValue({ rows: [message], total: 1, offset: 0, has_more: false });
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === label);
  expect(button, `button ${label}`).toBeTruthy();
  await act(async () => { button!.click(); });
}
it('uses the full-content list endpoint once, reuses the report and invalidates on refresh', async () => {
  await act(async () => root.render(createElement(BulkEmailReview, props)));
  await click('Revisión masiva de correos');
  await click('Revisar lote completo');
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'event', channel: 'email', state: 'drafted', offset: 0, limit: 250, includeContent: true }));
  expect(container.textContent).toContain('1 correos leídos');
  expect(container.textContent).not.toContain('token=');
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === 'Revisar lote completo')!;
  expect(button.disabled).toBe(true);
  await act(async () => root.render(createElement(BulkEmailReview, { ...props, refreshVersion: 1 })));
  expect(container.textContent).not.toContain('1 correos leídos');
  await click('Revisar lote completo');
  expect(read).toHaveBeenCalledTimes(2);
});
it('ignores an in-flight result when event/identity scope changes', async () => {
  let finish!: (page: QueuePage) => void;
  read.mockImplementationOnce(() => new Promise<QueuePage>(resolve => { finish = resolve; }));
  await act(async () => root.render(createElement(BulkEmailReview, props)));
  await click('Revisión masiva de correos');
  await click('Revisar lote completo');
  await act(async () => root.render(createElement(BulkEmailReview, { ...props, scope: 'different-user:event' })));
  await act(async () => finish({ rows: [message], total: 1, offset: 0, has_more: false }));
  expect(container.textContent).not.toContain('1 correos leídos');
  expect(read).toHaveBeenCalledTimes(1);
});
