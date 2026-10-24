import { locale } from "@/i18n/language";
import { tr } from "@/i18n/rfx-admin";
import { useLang, getLang } from "@/i18n/language";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RfxEvent } from "@/types/domain";
import { Pill, money, dateShort } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { SEGMENTS } from "@/features/shipper-request/rubric";
import { EVENT_TYPES, loadDraftSettings, mostCommon, RUBRICS, VISIBILITY_MODES } from "./newEvent.service";
import type { LaneWithInvitations } from "./stages";

/**
 * Where a value came from, as the wireframe tags it. What the team typed (a
 * manual event, the dates, the visibility) is "editable".
 */
type Source = "intake" | "quotedesk" | "crm" | "editable";

const SOURCE: Record<Source, { label: string; tone: "indigo" | "orange" }> = {
  intake: { label: "intake", tone: "indigo" },
  quotedesk: { label: "QuoteDesk", tone: "indigo" },
  crm: { label: "Shipper CRM", tone: "indigo" },
  editable: { label: "editable", tone: "orange" },
};

/** The lane rows shown before "+ N rutas más". */
const FIRST_ROWS = 10;

const DISPLAY_ORDER = [
  "operation_criteria",
  "business_rules",
  "service_specifications",
  "carrier_requirements",
  "logistics_model",
  "other_notes",
] as const;

const text = (v: unknown) => String(v ?? "").trim();

/** "Reefer / Dry Van", most common first, and "y 2 más" past `max`. */
function summarize(values: unknown[], max = 2): string | null {
  const seen = [...new Set(values.map(text).filter(Boolean))];
  if (!seen.length) return null;
  const top = mostCommon(values) ?? seen[0];
  const rest = seen.filter((v) => v !== top);
  const shown = [top, ...rest.slice(0, max - 1)];
  const more = seen.length - shown.length;
  return shown.join(" / ") + (more > 0 ? tr("text048", more) : "");
}

/** A rubric's text as the chips of the wireframe: its " | ", ";" or line-separated parts. */
const chipsOf = (value: string) =>
  value
    .split(/\s*(?:\||;|\n|•)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Build (wireframe 08): what the event is before anyone is invited — the
 * cédula, the lane matrix and the terms carriers will read. The cédula has no
 * event columns in rateware: its terms live on every lane, so the event shows
 * what most lanes carry and says where a lane differs.
 */
export function BuildStage({
  eventId,
  event,
  lanes,
  origin,
  folio,
  busy,
  canWork,
  onEditLane,
  onAuthorize,
}: {
  eventId: string;
  event: RfxEvent;
  lanes: LaneWithInvitations[];
  /** magic | quotedesk | manual, from QuoteDesk's event_origins. */
  origin: string | null;
  folio?: string | null;
  busy: boolean;
  canWork: boolean;
  onEditLane: (lane: LaneWithInvitations) => void;
  onAuthorize: (invitationIds: string[]) => void;
}) {
  useLang();
  const [allRows, setAllRows] = useState(false);
  const stamped: Source | null =
    origin === "magic" ? "intake" : origin === "quotedesk" ? "quotedesk" : origin === "manual" ? "editable" : null;

  const facts = useMemo(() => {
    const settings = loadDraftSettings(eventId);
    const segmentLabel = (key: string) => SEGMENTS.find((s) => s.value === key)?.[getLang()] ?? key;
    const segments =
      summarize(lanes.map((l) => text(l.rfx_segment_name) || (text(l.rfx_segment_key) ? segmentLabel(text(l.rfx_segment_key)) : ""))) ??
      (settings.segment ? segmentLabel(settings.segment) : null);
    const equipment = summarize(lanes.map((l) => text(l.equipment) || text(l.trailer)));
    const operations = summarize(
      lanes.map((l) => [text(l.operation), text(l.service)].filter(Boolean).join(" · ")),
    );
    const weekly = lanes.reduce((sum, l) => sum + (Number(l.weekly_volume) > 0 ? Number(l.weekly_volume) : 0), 0);
    const annual = lanes.reduce((sum, l) => sum + (Number(l.annual_volume) > 0 ? Number(l.annual_volume) : 0), 0);
    const currencies = summarize(lanes.map((l) => text(l.currency).toUpperCase()), 2) ?? settings.currency ?? null;
    const withTarget = lanes.filter((l) => Number(l.target_rate) > 0).length;
    const type = EVENT_TYPES.find((t) => t.key === text(event.event_type))?.label ?? (text(event.event_type) || null);
    const mode = VISIBILITY_MODES.find((m) => m.key === text(event.bid_visibility_mode))?.label ?? null;
    const lane = stamped ?? undefined;
    return [
      { label: "RFx reference", value: text(event.rfx_id) || null, source: lane, mono: true },
      {
        label: tr("text049"),
        value: text(event.customer) || null,
        source: event.customer_id ? ("crm" as Source) : lane,
        href: event.customer_id ? `/shippers/${String(event.customer_id)}` : undefined,
      },
      { label: tr("text050"), value: segments, source: lane },
      { label: tr("text051"), value: type, source: lane },
      { label: tr("text052"), value: equipment, source: lane },
      { label: tr("text053"), value: operations, source: lane },
      {
        label: tr("text054"),
        value: weekly ? tr("text055", weekly.toLocaleString(locale())) : annual ? tr("text056", annual.toLocaleString(locale())) : null,
        source: lane,
      },
      { label: tr("text057"), value: currencies, source: lane },
      { label: tr("text058"), value: mode, source: "editable" as Source },
      { label: tr("text059"), value: event.due_date ? dateShort(event.due_date) : null, source: "editable" as Source },
      {
        label: tr("text060"),
        value: event.operation_start_date ? dateShort(event.operation_start_date) : null,
        source: "editable" as Source,
      },
      {
        label: tr("text061"),
        value: lanes.length ? tr("text062", lanes.length, lanes.length === 1 ? "" : "s", withTarget) : null,
        source: lane,
      },
    ];
  }, [getLang(), event, eventId, lanes, stamped]);

  /**
   * Each rubric as most lanes carry it, and how many lanes say something else.
   * Paired as the wireframe pairs them: what widens the pool, what narrows it,
   * then the context.
   */
  const rubrics = useMemo(
    () =>
      DISPLAY_ORDER.map((key) => RUBRICS.find((r) => r.key === key)!).map((r) => {
        const values = lanes.map((l) => text(l[r.key]));
        const common = mostCommon(values);
        const differ = common ? values.filter((v) => v !== common).length : 0;
        return { ...r, value: common, differ };
      }),
    [getLang(), lanes],
  );

  const shown = allRows ? lanes : lanes.slice(0, FIRST_ROWS);
  const hidden = lanes.length - shown.length;
  const rubricsFrom =
    stamped === "intake"
      ? tr("text063")
      : stamped === "quotedesk"
        ? tr("text064", folio ? ` ${folio}` : "")
        : tr("text065");

  return (
    <div className="bld">
      <div className="bld-stamp">
        {origin === "magic" ? (
          <>
            <b>{tr("text066")}</b>
            <span>
              {tr("text067")}</span>
          </>
        ) : origin === "quotedesk" ? (
          <>
            <b>{tr("text068")}{folio ? ` · ${folio}` : ""}:</b>
            <span>
              {tr("text069")}</span>
          </>
        ) : (
          <>
            <b>{tr("text070")}</b>
            <span>
              {tr("text071")}</span>
          </>
        )}
      </div>

      <section className="bld-card">
        <header>
          <h2>{tr("text072")}</h2>
          <span className="bld-num">01</span>
        </header>
        <div className="bld-facts">
          {facts.map((f) => (
            <div key={f.label} className="bld-fact">
              <span className="bld-fact-label">{f.label}</span>
              <span className={`bld-fact-value${f.value ? "" : " unset"}${f.mono ? " mono" : ""}`} title={f.value ?? undefined}>
                {f.value ? f.href ? <Link to={f.href}>{f.value}</Link> : f.value : tr("text073")}
              </span>
              {f.source && <Pill tone={SOURCE[f.source].tone}>{SOURCE[f.source].label}</Pill>}
            </div>
          ))}
        </div>
      </section>

      <section className="bld-card flush">
        <header>
          <h2>{tr("text074")}</h2>
          <Link to={`/carrier-fit?event=${eventId}`} className="btn">
            {tr("text075")}</Link>
          <Link to={`/rfx/new/${eventId}?step=3`} className="btn">
            {tr("text076")}</Link>
          <span className="bld-num">02</span>
        </header>
        {lanes.length ? (
          <>
            <table className="data bld-matrix">
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>{tr("text077")}</th>
                  <th>{tr("text078")}</th>
                  <th>{tr("text079")}</th>
                  <th>{tr("text080")}</th>
                  <th>{tr("text081")}</th>
                  <th>Vol</th>
                  <th>{tr("text082")}</th>
                  <th>Target</th>
                  <th>Carriers</th>
                  <th>{tr("text083")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((lane) => {
                  // Carriers added from Carrier Fit wait as "drafted" until someone authorizes them.
                  const drafts = (lane.invitations ?? [])
                    .filter((i) => ["drafted", ""].includes(String(i.invitation_status ?? "").toLowerCase()))
                    .map((i) => String(i.id));
                  const equipment = [text(lane.equipment), text(lane.trailer), text(lane.config)].filter(Boolean).join(" · ");
                  return (
                    <tr key={lane.id}>
                      <td className="mono">L-{String(lane.lane_number ?? "—").padStart(3, "0")}</td>
                      <td className="ellipsis" title={text(lane.origin)}>{text(lane.origin) || "—"}</td>
                      <td className="ellipsis" title={text(lane.destination)}>{text(lane.destination) || "—"}</td>
                      <td className="ellipsis" title={equipment}>{text(lane.equipment) || text(lane.trailer) || "—"}</td>
                      <td>{text(lane.operation) || "—"}</td>
                      <td>{text(lane.service) || "—"}</td>
                      <td className="mono">{Number(lane.weekly_volume) > 0 ? tr("text084", Number(lane.weekly_volume)) : "—"}</td>
                      <td className="ellipsis" title={text(lane.rfx_segment_name)}>{text(lane.rfx_segment_name) || "—"}</td>
                      <td className="mono">
                        {Number(lane.target_rate) > 0 ? money(lane.target_rate, text(lane.currency) || "USD") : "—"}
                      </td>
                      <td className="mono">{lane.invitation_count ?? 0}</td>
                      <td className="mono">{lane.bid_count ?? 0}</td>
                      <td className="bld-row-acts">
                        <button
                          className="ne-link"
                          disabled={busy || !canWork}
                          title={canWork ? tr("text085") : NEED_REASON.operate}
                          onClick={() => onEditLane(lane)}
                        >
                          {tr("text086")}</button>
                        <button
                          className="ne-link"
                          disabled={busy || !canWork || !drafts.length}
                          onClick={() => onAuthorize(drafts)}
                          title={
                            !canWork
                              ? NEED_REASON.operate
                              : drafts.length
                                ? tr("text087", drafts.length)
                                : tr("text088")
                          }
                        >
                          {drafts.length ? tr("text089", drafts.length) : tr("text090")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lanes.length > FIRST_ROWS && (
              <button className="link bld-more" onClick={() => setAllRows((v) => !v)}>
                {allRows
                  ? tr("text091", FIRST_ROWS)
                  : tr("text092", hidden, hidden === 1 ? "" : "s", stamped === "intake" ? tr("text093") : stamped === "quotedesk" ? tr("text094") : "")}
              </button>
            )}
          </>
        ) : (
          <div className="bld-empty">
            <b>{tr("text095")}</b> {tr("text096")}<Link to={`/rfx/new/${eventId}?step=3`} className="btn primary">
              {tr("text097")}</Link>
          </div>
        )}
      </section>

      <section className="bld-card">
        <header>
          <h2>{tr("text098")}</h2>
          <span className="bld-num">03</span>
          <Pill tone="blue">{rubricsFrom}</Pill>
        </header>
        <div className="bld-rubrics">
          {rubrics.map((r) => (
            <div key={r.key} className="bld-rubric">
              <div className="bld-rubric-head">
                <b>{r.label}</b>
                {r.effect === "widens" && <Pill tone="green">{tr("text099")}</Pill>}
                {r.effect === "narrows" && <Pill tone="amber">{tr("text100")}</Pill>}
              </div>
              {r.value ? (
                <div className="bld-chips">
                  {chipsOf(r.value).map((chip, i) => (
                    <span key={`${chip}-${i}`} className="bld-chip">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="bld-rubric-empty">{tr("text101")}{r.placeholder.replace(/^—/, " —")}</span>
              )}
              {r.value && r.differ > 0 && (
                <span className="bld-rubric-note">
                  {r.differ} {tr("text102")}{lanes.length} {tr("text103")}</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
