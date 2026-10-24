/**
 * Idempotency keys for the shared backend.
 *
 * `rateware-api` treats a set of actions as high risk and correlates them by an
 * operation id read from `x-operation-id` or `body.operation_id`. If the caller
 * sends none, **the server mints a fresh one per request** — so a retry is a
 * brand new operation and the write happens twice. Sending our own id is what
 * makes retrying safe.
 *
 * Actions that need one, verified against the deployed handler:
 *   award_rfx_lane_vendor, closeout_awarded_rfx_to_rateware,
 *   create_rfx_award_package, generate_outreach_drafts,
 *   generate_rfx_award_notices, send_outreach_messages, and the bulk_update_*
 *   and send_* family.
 */
export function newOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
