import { callRatewareApi } from "@/lib/api-client";

/** rateware's dashboard counts, workspace-scoped. Fields are absent when a best-effort count failed. */
export interface DashboardSummary {
  vendors?: number;
  archived_vendors?: number;
  rfx_events?: number;
  rfx_open_events?: number;
  /** Priced offers since `bids_since` (rateware #165). */
  rfx_bids_since?: number;
  pending_review?: number;
  [key: string]: number | undefined;
}

/** Local midnight: "today" is the team's day, not UTC's. */
export function startOfToday(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

export async function dashboardSummary(): Promise<DashboardSummary> {
  return await callRatewareApi<DashboardSummary>("dashboard_summary", { bids_since: startOfToday() });
}
