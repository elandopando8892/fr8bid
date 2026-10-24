import { tr } from "@/i18n/carrier-crm";
import { useLang } from "@/i18n/language";
import { useAsync } from "@/components/useAsync";
import { NEED_REASON } from "@/lib/roles";
import type { CarrierListTemplate, Vendor } from "@/types/domain";
import { fetchVendorsByIds, STAGE_LABEL, vendorLabel, type VendorPatch } from "./crm.service";

export type TmsStatus = NonNullable<VendorPatch["status"]>;
const STATUSES: TmsStatus[] = ["active", "inactive", "invited", "blocked"];

type Row = Vendor & { effective_funnel_stage?: string; funnel_stage?: string | null };

/**
 * "Ficha de carrier" (wireframe 23): the carrier the operator is looking at,
 * read in full — the list rows leave out secondary emails and Bid Room
 * participation — and the one control that belongs to it alone, its TMS status.
 */
export function CarrierCard({
  vendor,
  version,
  templates,
  selectedCount,
  canWork,
  busy,
  onStatus,
  onBulkStatus,
  onProfileLink,
}: {
  vendor: Row | null;
  /** Bumped after a write, so the card reads the carrier again. */
  version: number;
  templates: CarrierListTemplate[] | null;
  selectedCount: number;
  canWork: boolean;
  busy: boolean;
  onStatus: (status: TmsStatus) => void;
  onBulkStatus: (status: TmsStatus) => void;
  onProfileLink: () => void;
}) {
  useLang();
  const full = useAsync(
    () => (vendor ? fetchVendorsByIds([vendor.id]).then((rows) => rows[0] ?? null) : Promise.resolve(null)),
    [vendor?.id, version],
  );

  if (!vendor) {
    return (
      <aside className="crm-side crm-card">
        <p className="crm-kicker">{tr("text031")}</p>
        <p className="crm-card-empty">{tr("text032")}</p>
      </aside>
    );
  }

  const card = full.data && full.data.id === vendor.id ? full.data : null;
  const status = String(card?.status ?? vendor.status ?? "").toLowerCase();
  const domain = String(card?.domain ?? vendor.domain ?? "").trim();
  const secondary = Array.isArray(card?.secondary_emails) ? card.secondary_emails.filter(Boolean).length : null;
  const whatsapp = String(card?.whatsapp_phone ?? vendor.whatsapp_phone ?? "").trim();
  const bid = card?.bid_metrics;

  const base = String(vendor.base_stage ?? card?.base_stage ?? "").toLowerCase();
  const effective = vendor.effective_funnel_stage || String(card?.funnel_stage ?? vendor.funnel_stage ?? "");
  const stored = String(vendor.funnel_stage ?? card?.funnel_stage ?? "");
  const stage =
    base === "procurement"
      ? `Procurement · ${STAGE_LABEL[effective] ?? (effective || "—")}`
      : STAGE_LABEL[base] ?? (base || "—");

  const inTemplates = (templates ?? []).filter(
    (t) => t.lifecycle_status !== "archived" && (t.vendor_ids ?? []).includes(vendor.id),
  );
  const templateText = !templates
    ? "—"
    : inTemplates.length
      ? inTemplates.slice(0, 2).map((t) => t.segment_name || tr("text033")).join(", ") +
        (inTemplates.length > 2 ? ` +${inTemplates.length - 2}` : "")
      : tr("text034");

  const participation = full.loading
    ? "…"
    : !bid || !bid.shortlisted
      ? tr("text035")
      : tr("text036", bid.shortlisted, bid.shortlisted === 1 ? "" : "s", bid.quoted ?? 0, bid.quoted === 1 ? "" : "s");

  const locked = canWork ? undefined : NEED_REASON.operate;

  return (
    <aside className="crm-side crm-card">
      <p className="crm-kicker">{tr("text031")}</p>
      <h2 title={vendorLabel(vendor)}>{vendorLabel(vendor)}</h2>
      <p className="crm-card-sub">
        {domain || tr("text037")}
        {secondary !== null && tr("text038", secondary, secondary === 1 ? "" : "s", secondary === 1 ? "" : "s")}
      </p>
      {full.error && <p className="crm-card-error">{tr("text039")}{full.error}</p>}

      <dl className="crm-facts">
        <div>
          <dt>{tr("text040")}</dt>
          <dd>
            {stage}
            {base === "procurement" && stored && effective && stored !== effective && (
              <small title={tr("text041")}>{tr("text042")}{STAGE_LABEL[stored] ?? stored}</small>
            )}
          </dd>
        </div>
        <div>
          <dt>{tr("text043")}</dt>
          <dd>{status || "—"}</dd>
        </div>
        <div>
          <dt>WhatsApp</dt>
          <dd className={whatsapp ? "mono" : undefined}>{whatsapp || tr("text044")}</dd>
        </div>
        <div>
          <dt>{tr("text045")}</dt>
          <dd title={inTemplates.map((t) => t.segment_name).join(", ") || undefined}>{templateText}</dd>
        </div>
        <div>
          <dt>{tr("text046")}</dt>
          <dd title={bid?.last_activity_at ? tr("text047", bid.last_activity_at.slice(0, 10)) : undefined}>
            {participation}
          </dd>
        </div>
      </dl>

      <div className="crm-status">
        <b>{tr("text048")}</b>
        <p>{tr("text049")}</p>
        <div className="crm-seg" role="group" aria-label={tr("text043")}>
          {STATUSES.map((s) => (
            <button
              key={s}
              className={s === status ? "on" : undefined}
              aria-pressed={s === status}
              disabled={busy || !canWork || s === status}
              title={locked}
              onClick={() => onStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
        {selectedCount > 1 && (
          <div className="crm-status-bulk">
            <span>{tr("text050")}{selectedCount} {tr("text051")}</span>
            <span>
              {STATUSES.map((s) => (
                <button key={s} className="link" disabled={busy || !canWork} title={locked} onClick={() => onBulkStatus(s)}>
                  {s}
                </button>
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="crm-card-actions">
        <button disabled={!canWork} title={locked} onClick={onProfileLink}>
          {tr("text052")}</button>
      </div>
    </aside>
  );
}
