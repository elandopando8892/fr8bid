import { callRatewareApi } from "@/lib/api-client";
import type { StagedRate } from "./readiness";

/**
 * Rates waiting for review before they enter the rate base (rateware's
 * `rate_staging`, status pending_review). Approving one is setting its status
 * to approved; from then on it is part of the rate base the quotes, the
 * benchmarks and the reports read.
 */

export async function listPendingRates(): Promise<{ rows: StagedRate[]; total: number }> {
  const res = await callRatewareApi<{ rows?: StagedRate[]; total?: number }>("list_staging", {
    status: "pending_review",
    limit: 1000,
    offset: 0,
  });
  return { rows: res.rows ?? [], total: res.total ?? res.rows?.length ?? 0 };
}

/**
 * The same patch on many rows. The backend refuses a bulk write without an
 * explicit confirmation naming the action, even for one row.
 */
export const updateRates = (ids: string[], patch: Record<string, unknown>) =>
  callRatewareApi<{ updated: number }>("bulk_update_staging", {
    ids,
    patch,
    confirmed: true,
    confirmation_action: "bulk_update_staging",
  });

export const updateRate = (id: string, patch: Record<string, unknown>) =>
  callRatewareApi<{ row: StagedRate }>("update_staging", { id, patch });

/** Out of the queue for good (tests, duplicates). Reversible: the rows stay, archived. */
export const archiveRates = (ids: string[]) =>
  callRatewareApi<{ updated: number }>("archive_staging", {
    ids,
    confirmed: true,
    confirmation_action: "archive_staging",
  });
