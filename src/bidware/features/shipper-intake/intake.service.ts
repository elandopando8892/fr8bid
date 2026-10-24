import { env } from "@/config/env";
import { tr } from "@/i18n/shipper-intake-options";
import { tr as intakeTr } from "@/i18n/shipper-intake";
import { callRatewareApi, callQuotedeskApi } from "@/lib/api-client";
/**
 * Shipper intake, on rateware's RFx process (the same records rateware manages):
 *   1. We open an RFx project for a CRM shipper and issue its private link,
 *      which opens Bidware's own form: spot = one screen, anything else = the
 *      RFQ wizard.
 *   2. The shipper fills it in and sends it; the answers land on the project.
 *   3. A spot request becomes a QuoteDesk quote; an RFQ becomes a Bid Room
 *      event (demand snapshot -> sourcing package -> event), still with no
 *      invitation sent.
 */

/** rateware-api's RFX_PROCESS_OPPORTUNITY_TYPES. */
export type RfxProjectType =
  | "spot"
  | "contract"
  | "program"
  | "dedicated"
  | "capacity_addition"
  | "new_provider"
  | "benchmark"
  | "backup";

/**
 * A mini-bid is rateware's "contract"; a program (a long, many-lane RFx) is
 * its own type since rateware #166. Launched, each becomes the event it
 * names: Mini-bid or RFx · Programa.
 */
export const RFX_PROJECT_TYPES: { value: RfxProjectType; label: string }[] = [
  { value: "spot", label: "Spot" },
  { value: "contract", label: "Mini-bid" },
  { value: "program", get label() { return tr("option1"); } },
  { value: "dedicated", get label() { return tr("option2"); } },
  { value: "capacity_addition", get label() { return tr("option3"); } },
  { value: "new_provider", get label() { return tr("option4"); } },
  { value: "benchmark", label: "Benchmark" },
  { value: "backup", get label() { return tr("option5"); } },
];

/** A row of list_rfx_process_projects. */
export interface RfxProject {
  spot_quote?: { id: string; folio: string } | null;
  id: string;
  title: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_contact_name: string | null;
  customer_contact_email: string | null;
  opportunity_type: RfxProjectType | string;
  status: string;
  rfi_status: string;
  lane_count: number;
  bid_room_event_id: string | null;
  bid_room_rfx_id: string | null;
  bid_room_status: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function createShipperProject(input: {
  shipperId: string;
  shipperName: string;
  contactName?: string;
  contactEmail?: string;
  type: RfxProjectType;
  dueDate?: string;
}): Promise<RfxProject> {
  const res = await callRatewareApi<{ row: RfxProject }>("create_rfx_process_project", {
    project: {
      title: `${input.shipperName} · ${RFX_PROJECT_TYPES.find((t) => t.value === input.type)?.label ?? input.type}`,
      customer_id: input.shipperId,
      customer_name: input.shipperName,
      customer_contact_name: input.contactName || null,
      customer_contact_email: input.contactEmail || null,
      opportunity_type: input.type,
      due_date: input.dueDate || null,
    },
  });
  return res.row;
}

/**
 * The project's active shipper link, on Bidware. The backend reuses a live
 * link instead of issuing another and composes it on the origin we pass; a
 * link issued earlier from rateware is rebuilt on Bidware from its token.
 */
export async function shipperLink(projectId: string): Promise<{ link: string | null; reused: boolean; message?: string }> {
  const res = await callRatewareApi<{ link?: string | null; token?: string | null; reused?: boolean; message?: string }>(
    "create_rfx_rfi_magic_link",
    { project_id: projectId, app_origin: env.appOrigin },
  );
  let token = res.token ?? null;
  if (!token && res.link) {
    try {
      token = new URL(res.link).searchParams.get("token");
    } catch {
      token = null;
    }
  }
  const link = token ? `${env.appOrigin}/customer-rfi.html?token=${encodeURIComponent(token)}` : null;
  return { link, reused: Boolean(res.reused), message: res.message };
}

// Only projects that went through a shipper link: rateware's Ratebook sync also
// opens a project for every event, and those don't belong in this queue.
const INTAKE_STATUSES = new Set(["rfi_sent", "rfi_in_progress", "rfi_submitted", "demand_review"]);
export const isIntake = (project: RfxProject) =>
  INTAKE_STATUSES.has(project.status) || Boolean(project.rfi_status && project.rfi_status !== "not started");

/** The shipper sent its request back. */
export const responded = (project: RfxProject) => project.rfi_status === "submitted" || project.status === "rfi_submitted";

/** A shipper's request the team hasn't acted on yet: it came back, and it's neither a quote nor an event. */
export const awaitsTeam = (project: RfxProject) =>
  isIntake(project) && responded(project) && !project.bid_room_event_id && !projectQuote(project);

type QuoteRef = { id: string; folio: string };
async function receiptRows(ids: string[]) {
  if (!ids.length) return [];
  const result = await callQuotedeskApi<{ rows: { source_project_id: string; quote: QuoteRef }[] }>("list_spot_request_quotes", { project_ids: ids });
  return result.rows;
}
export const projectQuote = (project: RfxProject) => project.spot_quote ?? quoteFromNotes(project.notes);

export async function listShipperProjects(isCurrent: () => boolean = () => true): Promise<RfxProject[]> {
  const res = await callRatewareApi<{ rows?: RfxProject[] }>("list_rfx_process_projects", { limit: 100 });
  if (!isCurrent()) return [];
  const rows = res.rows ?? [];
  try {
    const receipts = await receiptRows(rows.filter(p => p.opportunity_type === "spot").map(p => p.id));
    if (!isCurrent()) return [];
    const quotes = new Map(receipts.map(r => [r.source_project_id, r.quote]));
    return rows.map(row => ({ ...row, spot_quote: quotes.get(row.id) ?? null }));
  } catch { throw new Error(intakeTr("conversionUnavailable")); }
}

export class IncompleteRfiError extends Error {}

/** A submitted RFQ becomes a Bid Room event (draft: nothing is sent to carriers). */
export async function launchShipperProject(projectId: string): Promise<string> {
  const snapshot = await callRatewareApi<{ row: { id: string }; validation_issues?: unknown[] }>(
    "create_rfx_demand_snapshot",
    { project_id: projectId },
  );
  const issues = snapshot.validation_issues?.length ?? 0;
  if (issues) {
    throw new IncompleteRfiError(
      `El shipper dejó ${issues} ruta(s) incompleta(s) (origen, destino, equipo o volumen). Pídele que las complete en su liga.`,
    );
  }
  const pack = await callRatewareApi<{ row: { id: string } }>("create_rfx_package", {
    project_id: projectId,
    demand_snapshot_id: snapshot.row.id,
  });
  const launched = await callRatewareApi<{ rfx_event_id: string }>("launch_rfx_package_to_bid_room", {
    package_id: pack.row.id,
    app_origin: env.appOrigin,
  });
  return launched.rfx_event_id;
}

// ------------------------------------------------------------ spot -> QuoteDesk

/** Where a spot request went in QuoteDesk, kept in the project's notes. */
const QUOTE_MARK = /QuoteDesk (Q-\d+) · ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function quoteFromNotes(notes: string | null | undefined): { folio: string; id: string } | null {
  const match = String(notes ?? "").match(QUOTE_MARK);
  return match ? { folio: match[1], id: match[2] } : null;
}


interface ProjectDetail {
  project: RfxProject;
  rfi_submission: { status: string | null; updated_at?: string | null } | null;
}

/** One transactional conversion; recovery only reads its durable receipt. */
export async function createQuoteFromRequest(project: RfxProject, isCurrent: () => boolean = () => true): Promise<QuoteRef> {
  const requireCurrent = () => { if (!isCurrent()) throw new Error(intakeTr("conversionScopeChanged")); };
  requireCurrent();
  const detail = await callRatewareApi<ProjectDetail>("get_rfx_process_project", { project_id: project.id, app_origin: env.appOrigin });
  requireCurrent();
  if (detail.project.id !== project.id) throw new Error(intakeTr("conversionMismatch"));
  if (detail.project.opportunity_type !== "spot") throw new Error(intakeTr("conversionSpotOnly"));
  if (detail.rfi_submission?.status !== "submitted") throw new Error(intakeTr("conversionNotSubmitted"));
  if (!detail.project.customer_id) throw new Error(intakeTr("conversionNoShipper"));
  const version = detail.rfi_submission.updated_at;
  if (!version) throw new Error(intakeTr("conversionMismatch"));
  try {
    const result = await callQuotedeskApi<{ quote: QuoteRef }>("convert_spot_request_to_quote", {
      project_id: project.id, expected_submission_updated_at: version,
    });
    requireCurrent();
    return result.quote;
  } catch (error) {
    requireCurrent();
    // A lost response may follow a committed conversion. Never retry a write automatically.
    try {
      const receipts = await receiptRows([project.id]);
      requireCurrent();
      const existing = receipts.find(r => r.source_project_id === project.id);
      if (existing) return existing.quote;
    } catch { requireCurrent(); }
    const message = error instanceof Error ? error.message : "";
    if (/spot_legacy_/.test(message)) throw new Error(intakeTr("conversionLegacy"));
    if (/spot_source_version_conflict|spot_source_not_convertible/.test(message)) throw new Error(intakeTr("conversionMismatch"));
    if (/spot_lane_|spot_weight_|spot_snapshot_|spot_currency_/.test(message)) throw new Error(intakeTr("conversionIncomplete"));
    throw new Error(intakeTr("conversionUnavailable"));
  }
}
