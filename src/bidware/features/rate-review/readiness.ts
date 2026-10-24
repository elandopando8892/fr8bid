import { tr } from "@/i18n/rate-review";
/**
 * When a staged rate may enter the rate base, as rateware's review screen
 * decides it: the RFx award outcome and required fields block approval (no rate, text in the all-in, a
 * place without geography, no currency, no operation or service, a border
 * crossing without its crossing points) and the rest only warns. The checks
 * mirror rateware-api's approval guards; the server also checks blockers
 * before approving. This screen explains them before the request.
 */
export interface StagedRate {
  id: string;
  status?: string | null;
  vendor_id?: string | null;
  vendor_domain?: string | null;
  vendor_reference?: string | null;
  vendors?: { vendor_name?: string | null; domain?: string | null } | null;
  rfx_id?: string | null;
  rfx_bid_outcome?: string | null;
  raw_upload_id?: string | null;
  origin?: string | null;
  destination?: string | null;
  origin_market?: string | null;
  origin_zip_prefix?: string | null;
  origin_state?: string | null;
  origin_country?: string | null;
  destination_market?: string | null;
  destination_zip_prefix?: string | null;
  destination_state?: string | null;
  destination_country?: string | null;
  equipment?: string | null;
  trailer?: string | null;
  config?: string | null;
  operation?: string | null;
  service?: string | null;
  all_in_rate?: string | number | null;
  mx_border_crossing_point?: string | null;
  us_border_crossing_point?: string | null;
  mx_linehaul?: string | number | null;
  us_linehaul?: string | number | null;
  fsc?: string | number | null;
  border_crossing_fee?: string | number | null;
  currency?: string | null;
  quote_date?: string | null;
  valid_through?: string | null;
  weekly_capacity?: string | null;
  carrier_cost_rate?: number | null;
  customer_board_rate?: number | null;
  notes?: string | null;
  source_evidence?: Record<string, unknown> | null;
  audit_flags?: unknown[] | null;
  extraction_warnings?: unknown[] | null;
  field_confidence?: Record<string, unknown> | null;
  created_at?: string | null;
  [key: string]: unknown;
}

/** rateware's cleanRateText: the number in "USD 1,200", nothing for "N/A", "X" or "Tier 1". */
export function rateNumber(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text || /^x$/i.test(text) || /^n\/?a$/i.test(text) || /^please estimate$/i.test(text) || /^tier\s*[123]$/i.test(text)) return null;
  const cleaned = text
    .replace(/\b(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)\b/gi, "")
    .replace(/[$,]/g, "")
    .trim();
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

const positive = (value: unknown) => {
  const number = rateNumber(value);
  return number !== null && number > 0;
};

const SPLIT_FIELDS = ["mx_linehaul", "us_linehaul", "fsc", "border_crossing_fee"] as const;

export const hasSplitRate = (row: StagedRate) => SPLIT_FIELDS.some((field) => positive(row[field]));

export function splitTotal(row: StagedRate): number | null {
  const values = SPLIT_FIELDS.map((field) => rateNumber(row[field])).filter((value): value is number => value !== null && value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

/** The rate the row stands for: its all-in, else the sum of its parts. */
export function rateOf(row: StagedRate): number | null {
  const allIn = rateNumber(row.all_in_rate);
  return allIn !== null && allIn > 0 ? allIn : splitTotal(row);
}

const serviceMode = (value: unknown) => {
  const text = String(value ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
  if (/\b(rt|round trip|roundtrip|round)\b/.test(text)) return "roundtrip";
  if (/\b(ow|one way|oneway)\b/.test(text)) return "oneway";
  return "";
};

export type IssueKey =
  | "rfx_outcome"
  | "rate"
  | "rate_text"
  | "split_mismatch"
  | "currency"
  | "location"
  | "vendor"
  | "quote_date"
  | "operation"
  | "service"
  | "border"
  | "service_conflict"
  | "source_audit";

export const ISSUE_LABEL: Record<IssueKey, string> = {
  get rfx_outcome() { return tr("rfxApprovalHeld"); },
  get rate() { return tr("text080"); },
  get rate_text() { return tr("text081"); },
  get split_mismatch() { return tr("text082"); },
  get currency() { return tr("text083"); },
  get location() { return tr("text084"); },
  get vendor() { return tr("text085"); },
  get quote_date() { return tr("text086"); },
  get operation() { return tr("text087"); },
  get service() { return tr("text088"); },
  get border() { return tr("text089"); },
  get service_conflict() { return tr("text090"); },
  get source_audit() { return tr("text091"); },
};

/** What stops an approval; everything else only warns (rateware's review screen). */
const BLOCKERS = new Set<IssueKey>(["rfx_outcome", "rate", "rate_text", "location", "currency", "operation", "service", "border"]);

/** Empty outcomes are legacy/uploads; nonempty outcomes must be RFx awards. */
export const rfxBidOutcome = (row: StagedRate) => String(row.rfx_bid_outcome ?? "").trim().toLowerCase();
export function rfxOutcomeLabel(row: StagedRate): string | null {
  switch (rfxBidOutcome(row)) {
    case "": return null;
    case "awarded": return tr("outcomeAwarded");
    case "backup": return tr("outcomeBackup");
    case "not_awarded": return tr("outcomeNotAwarded");
    case "submitted": return tr("outcomeSubmitted");
    case "withdrawn": return tr("outcomeWithdrawn");
    default: return tr("outcomeUnknown");
  }
}

/**
 * A rate that crosses the border, as rateware's review screen reads it: its
 * operation, service or countries say cross, export or import, or it already
 * names a crossing point. "MX Northbound" to Laredo, TX ends at the border and
 * doesn't cross it.
 */
export function crossesBorder(row: StagedRate): boolean {
  const text = [row.operation, row.service, row.origin_country, row.destination_country, row.mx_border_crossing_point, row.us_border_crossing_point]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /cross|export|import/.test(text) || Boolean(row.mx_border_crossing_point || row.us_border_crossing_point);
}

/** Everything worth a look before approving, blockers first. */
export function reviewIssues(row: StagedRate): IssueKey[] {
  const issues: IssueKey[] = [];
  const outcome = rfxBidOutcome(row);
  if (outcome && outcome !== "awarded") issues.push("rfx_outcome");
  const allIn = rateNumber(row.all_in_rate);
  const split = splitTotal(row);
  if (!positive(row.all_in_rate) && !positive(row.mx_linehaul) && !positive(row.us_linehaul)) issues.push("rate");
  if (/[a-z]/i.test(String(row.all_in_rate ?? ""))) issues.push("rate_text");
  if (allIn !== null && split !== null && allIn > 0 && split > 0 && Math.abs(allIn - split) > Math.max(25, allIn * 0.05)) {
    issues.push("split_mismatch");
  }
  if ((positive(row.all_in_rate) || hasSplitRate(row)) && !String(row.currency ?? "").trim()) issues.push("currency");
  const originPlaced = Boolean(row.origin_market || row.origin_zip_prefix || row.origin_state || row.origin_country);
  const destinationPlaced = Boolean(row.destination_market || row.destination_zip_prefix || row.destination_state || row.destination_country);
  if (!originPlaced || !destinationPlaced) issues.push("location");
  if (!String(row.vendor_id ?? "").trim()) issues.push("vendor");
  if (!String(row.quote_date ?? "").trim()) issues.push("quote_date");
  if (!String(row.operation ?? "").trim()) issues.push("operation");
  if (!String(row.service ?? "").trim()) issues.push("service");
  if (crossesBorder(row) && (!String(row.mx_border_crossing_point ?? "").trim() || !String(row.us_border_crossing_point ?? "").trim())) {
    issues.push("border");
  }
  const evidence = row.source_evidence ?? {};
  const sourceMode = serviceMode([evidence.service, evidence.lane, evidence.source_service].filter(Boolean).join(" "));
  const stagedMode = serviceMode(row.service);
  if (sourceMode && stagedMode && sourceMode !== stagedMode) issues.push("service_conflict");
  const confidence = row.field_confidence ?? {};
  if (
    (Array.isArray(row.audit_flags) && row.audit_flags.length > 0) ||
    (Array.isArray(row.extraction_warnings) && row.extraction_warnings.length > 0) ||
    Object.values(confidence).some((value) => typeof value === "number" && value < 0.75)
  ) {
    issues.push("source_audit");
  }
  return [...issues.filter((issue) => BLOCKERS.has(issue)), ...issues.filter((issue) => !BLOCKERS.has(issue))];
}

export const blockersOf = (row: StagedRate) => reviewIssues(row).filter((issue) => BLOCKERS.has(issue));
export const warningsOf = (row: StagedRate) => reviewIssues(row).filter((issue) => !BLOCKERS.has(issue));
export const isBlocking = (issue: IssueKey) => BLOCKERS.has(issue);

/** Signs the row came from a test or a canary run, not from a carrier. */
export function looksLikeTest(row: StagedRate): boolean {
  return /dummy|canary|smoke|shadow|\btest\b|prueba/i.test(String(row.rfx_id ?? ""));
}
