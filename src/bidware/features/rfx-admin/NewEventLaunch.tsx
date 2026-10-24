import { tr } from "@/i18n/rfx-admin";
import { useLang, locale, getLang } from "@/i18n/language";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { newOperationId } from "@/lib/operation-id";
import { ErrorBanner, Pill } from "@/components/ui";
import { SEGMENTS } from "@/features/shipper-request/rubric";
import { listCarrierTemplates, getCarrierTemplate } from "@/features/carrier-templates/templates.service";
import {
  defaultSelection,
  detectDuplicates,
  listVendorsByIds,
  materializeTemplate,
  previewEligibility,
} from "@/features/carrier-fit/carrierFit.service";
import { participantsOf } from "@/features/outreach/LaunchShell";
import { createOutreachCampaign, generateOutreachDrafts, listOutreachCampaigns, type DraftChannel } from "@/features/outreach/outreach.service";
import { isSystem, languageOf, listTemplates } from "@/features/outreach/templates.service";
import type { CarrierListTemplate, RfxEvent, Vendor } from "@/types/domain";
import type { LaneWithInvitations } from "./stages";
import { EVENT_TYPES, VISIBILITY_MODES, type LaneRubrics } from "./newEvent.service";
import { updateRfxEvent } from "./rfx.service";

/** The three rubros that invite the right carriers; the other three only warn of cost. */
const CORE_RUBRICS: { key: keyof LaneRubrics; label: string }[] = [
  { key: "logistics_model", get label() { return tr("text381"); } },
  { key: "operation_criteria", get label() { return tr("text383"); } },
  { key: "business_rules", get label() { return tr("text385"); } },
];

type ChannelChoice = "email" | "whatsapp" | "both";
const CHANNEL_CHOICES: { key: ChannelChoice; label: string; channels: DraftChannel[] }[] = [
  { key: "email", label: "Email", channels: ["email"] },
  { key: "whatsapp", label: "WhatsApp", channels: ["whatsapp"] },
  { key: "both", label: "Email + WhatsApp", channels: ["email", "whatsapp"] },
];

const dayLabel = (value: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(locale(), { day: "2-digit", month: "short", year: "numeric" }) : "—";
};

/**
 * Step 4 (wireframe 15): what the event is, what's missing, who gets invited
 * and how. Launching adds the template's eligible carriers to every lane and
 * prepares the invitation drafts; nothing is sent until someone approves it in
 * the Cola de envío.
 */
export function NewEventLaunch({
  event,
  lanes,
  rubrics,
  segment,
  currency,
  aliasesSaved,
  onEditDetails,
  onEditLanes,
}: {
  event: RfxEvent;
  lanes: LaneWithInvitations[];
  rubrics: LaneRubrics;
  segment: string;
  currency: string;
  aliasesSaved: number;
  onEditDetails: () => void;
  onEditLanes: () => void;
}) {
  useLang();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canWork = can("operate");
  const eventId = String(event.id);

  const templates = useAsync(() => listCarrierTemplates({ lifecycle_status: "active", limit: 200 }), []);
  const outreach = useAsync(listTemplates, []);
  const [templateId, setTemplateId] = useState("");
  const [template, setTemplate] = useState<CarrierListTemplate | null>(null);
  const [members, setMembers] = useState<Vendor[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [messageId, setMessageId] = useState("");
  const [channel, setChannel] = useState<ChannelChoice>("email");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One id per write for this attempt, reused if it's retried (materialising and
  // generating drafts are correlated high-risk actions).
  const [ids, setIds] = useState(() => ({
    materialize: newOperationId(),
    campaign: newOperationId(),
    email: newOperationId(),
    whatsapp: newOperationId(),
  }));

  // The template members, and who among them can be invited.
  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      setMembers([]);
      return;
    }
    let live = true;
    setLoadingMembers(true);
    // usage_context writes the same carrier_fit audit entry Carrier Fit does.
    getCarrierTemplate(templateId, "carrier_fit")
      .then(async (row) => {
        if (!live) return;
        setTemplate(row);
        const vendors = await listVendorsByIds((row?.vendor_ids ?? []) as string[]);
        if (live) setMembers(vendors);
      })
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setLoadingMembers(false));
    return () => {
      live = false;
    };
  }, [templateId]);

  const memberIds = useMemo(() => (template?.vendor_ids ?? []) as string[], [getLang(), template]);
  const vendorById = useMemo(() => new Map(members.map((v) => [v.id, v])), [getLang(), members]);
  const duplicates = useMemo(() => detectDuplicates(members), [getLang(), members]);
  const eligible = useMemo(() => defaultSelection(memberIds, vendorById, duplicates), [getLang(), memberIds, vendorById, duplicates]);
  const inRfx = useMemo(() => participantsOf(lanes), [getLang(), lanes]);
  const toAdd = eligible.filter((id) => !inRfx.has(id));
  const unavailable = memberIds.filter((id) => !previewEligibility(vendorById.get(id)).ok || duplicates.get(id)?.redundantOf).length;

  // The invitation template: the team's own Spanish default first, as Mensaje starts.
  const messages = outreach.data ?? [];
  useEffect(() => {
    if (messageId || !messages.length) return;
    const own = messages.filter((t) => !isSystem(t));
    const start =
      own.find((t) => t.is_default && languageOf(t) === "es") ??
      own.find((t) => languageOf(t) === "es") ??
      messages.find((t) => languageOf(t) === "es") ??
      messages[0];
    setMessageId(start.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outreach.data]);
  const message = messages.find((t) => t.id === messageId) ?? null;

  // What the event adds up to.
  const volume = lanes.reduce((sum, lane) => sum + (Number(lane.weekly_volume) || 0), 0);
  const tally = (pick: (lane: LaneWithInvitations) => unknown) => {
    const counts = new Map<string, number>();
    for (const lane of lanes) {
      const key = String(pick(lane) ?? "").trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const equipment = tally((lane) => lane.trailer || lane.equipment);
  const operations = tally((lane) => lane.operation);
  const markets = new Set(
    lanes.flatMap((lane) => [lane.origin_market, lane.destination_market].map((value) => String(value ?? "").trim()).filter(Boolean)),
  );
  const missingCore = CORE_RUBRICS.filter((r) => !String(rubrics[r.key] ?? "").trim());
  const visibility = VISIBILITY_MODES.find((m) => m.key === event.bid_visibility_mode) ?? VISIBILITY_MODES[0];
  const segmentLabel = SEGMENTS.find((s) => s.value === segment);
  const channels = CHANNEL_CHOICES.find((c) => c.key === channel)!.channels;

  const checks: { ok: boolean; warn?: boolean; title: string; detail: string }[] = [
    {
      ok: !missingCore.length,
      warn: missingCore.length > 0,
      title: missingCore.length ? tr("text417") : tr("text418"),
      detail: missingCore.length
        ? tr("text419", missingCore.map((r) => r.label.toLowerCase()).join(", "))
        : tr("text420"),
    },
    {
      ok: lanes.length > 0,
      title: lanes.length ? tr("text421", lanes.length, lanes.length) : tr("text422"),
      detail: lanes.length
        ? aliasesSaved
          ? tr("text423", aliasesSaved)
          : tr("text424")
        : tr("text425"),
    },
    {
      ok: toAdd.length > 0 || (Boolean(template) && inRfx.size > 0),
      warn: !template,
      title: template ? tr("text426") : tr("text427"),
      detail: template
        ? tr("text428", toAdd.length, inRfx.size ? tr("text429", inRfx.size) : "")
        : tr("text430"),
    },
    {
      ok: Boolean(message),
      warn: !message,
      title: tr("text431"),
      detail: message ? `${message.name} · ${languageOf(message).toUpperCase()}` : tr("text432"),
    },
    {
      ok: true,
      title: tr("text058"),
      detail: `${visibility.key} — ${visibility.hint}`,
    },
  ];
  const ready = lanes.length > 0 && Boolean(template) && toAdd.length + inRfx.size > 0 && Boolean(message) && !busy;

  async function launch() {
    if (!ready || !template || !message) return;
    const ok = await confirmAsync(
      tr("text433", toAdd.length, template.segment_name, lanes.length) +
        tr("text434", message.name, channels.map((c) => (c === "email" ? "Email" : "WhatsApp")).join(tr("text435"))) +
        tr("text436") +
        tr("text437"),
      { ok: tr("text438") },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      if (toAdd.length) {
        setStep(tr("text439"));
        await materializeTemplate({
          laneIds: lanes.map((lane) => String(lane.id)),
          vendorIds: toAdd,
          templateId: String(template.id),
          templateVersion: Number(template.template_version ?? template.version ?? 1),
          operationId: ids.materialize,
        });
      }
      setStep(tr("text440"));
      const campaigns = await listOutreachCampaigns(eventId);
      let campaignId = (campaigns ?? []).find(
        (c: { template_id?: string; status?: string }) => c.template_id === message.id && c.status !== "archived",
      )?.id as string | undefined;
      if (!campaignId) {
        const { row } = await createOutreachCampaign({
          rfx_event_id: eventId,
          template_id: message.id,
          name: `${event.rfx_id || event.name || "RFx"} invitation wave`,
          channel: String(message.channel || "email"),
          idempotency_key: `bidware:${eventId}:${ids.campaign}`,
        });
        campaignId = row?.id;
      }
      if (!campaignId) throw new Error(tr("text441"));
      for (const draftChannel of channels) {
        setStep(tr("text442", draftChannel === "email" ? "Email" : "WhatsApp"));
        await generateOutreachDrafts({ campaign_id: campaignId, channel: draftChannel, operation_id: ids[draftChannel as "email" | "whatsapp"] });
      }
      // Launching opens the Bid Room (2026-09-29): a draft never shows on the
      // public board. Last, so a failed step above leaves nothing half open.
      if (["", "draft"].includes(String(event.status ?? "").toLowerCase())) {
        setStep(tr("text443"));
        await updateRfxEvent(eventId, { status: "open" });
      }
      setIds({ materialize: newOperationId(), campaign: newOperationId(), email: newOperationId(), whatsapp: newOperationId() });
      navigate(`/rfx/${eventId}/delivery`);
    } catch (e) {
      // The same ids stay: retrying re-reads the same operations instead of repeating them.
      if ((e as { code?: string }).code === "reviewed_audience_required") {
        navigate(`/rfx/${eventId}/review`);
      } else setError(tr("text444", (e as Error).message));
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  const eventType = EVENT_TYPES.find((t) => t.key === event.event_type);
  return (
    <div className="nev-launch">
      <div className="nev-launch-main">
        <section className="nev-card">
          <header>
            <b>{tr("text445")}</b>
            <button className="link nev-edit" onClick={onEditDetails}>
              {tr("text446")}</button>
          </header>
          <dl className="nev-facts">
            <div>
              <dt>Shipper</dt>
              <dd>{String(event.customer ?? "—")}</dd>
            </div>
            <div>
              <dt>{tr("text447")}</dt>
              <dd>{eventType?.key === "rfx" ? tr("text406") : eventType?.label ?? String(event.event_type ?? "—")}</dd>
            </div>
            <div>
              <dt>{tr("text082")}</dt>
              <dd className="mono" title={segmentLabel?.[getLang()]}>
                {segment || "—"}
              </dd>
            </div>
            <div>
              <dt>RFx ID</dt>
              <dd className="mono">{String(event.rfx_id ?? "—")}</dd>
            </div>
            <div>
              <dt>{tr("text448")}</dt>
              <dd>{dayLabel(event.due_date)}</dd>
            </div>
            <div>
              <dt>{tr("text449")}</dt>
              <dd>{dayLabel(event.operation_start_date)}</dd>
            </div>
            <div>
              <dt>{tr("text450")}</dt>
              <dd className="mono">{visibility.key}</dd>
            </div>
            <div>
              <dt>{tr("text057")}</dt>
              <dd className="mono">{currency}</dd>
            </div>
          </dl>
        </section>

        <section className="nev-card">
          <header>
            <b>{tr("text061")}</b>
            <button className="link nev-edit" onClick={onEditLanes}>
              {tr("text451")}</button>
          </header>
          <dl className="nev-facts big">
            <div>
              <dt>{tr("text061")}</dt>
              <dd className="mono">{lanes.length}</dd>
            </div>
            <div>
              <dt>{tr("text452")}</dt>
              <dd className="mono">{volume ? tr("text453", volume.toLocaleString(locale())) : "—"}</dd>
            </div>
            <div>
              <dt>{tr("text454")}</dt>
              <dd className="mono">{equipment.size}</dd>
            </div>
            <div>
              <dt>{tr("text455")}</dt>
              <dd className="mono">{markets.size || "—"}</dd>
            </div>
          </dl>
          {(equipment.size > 0 || operations.size > 0) && (
            <div className="nev-chips">
              {[...equipment.entries(), ...operations.entries()].map(([label, n]) => (
                <span key={label}>
                  {label} · {n}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="nev-card">
          <header>
            <b>{tr("text456")}</b>
          </header>
          <ul className="nev-checklist">
            {checks.map((c) => (
              <li key={c.title}>
                <i className={c.ok ? "ok" : c.warn ? "warn" : "bad"}>{c.ok ? "✓" : "!"}</i>
                <div>
                  <b>{c.title}</b>
                  <span>{c.detail}</span>
                </div>
                <Pill tone={c.ok ? "green" : "amber"}>{c.ok ? tr("text457") : tr("text458")}</Pill>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="nev-launch-side">
        <section className="nev-card">
          <header>
            <b>{tr("text459")}</b>
            <Link className="nev-edit" to={`/carrier-fit?event=${eventId}${templateId ? `&template=${templateId}` : ""}`}>
              {tr("text460")}</Link>
          </header>
          <label className="nev-field">
            <span className="nev-kicker">Starting set</span>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">{templates.loading ? tr("text461") : tr("text462")}</option>
              {(templates.data?.rows ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.segment_name} ({t.member_count ?? (t.vendor_ids ?? []).length})
                </option>
              ))}
            </select>
          </label>
          <dl className="nev-audience">
            <div>
              <dt>{tr("text463")}</dt>
              <dd>{template ? memberIds.length : "—"}</dd>
            </div>
            <div>
              <dt>{tr("text464")}</dt>
              <dd className="ok">{template ? (loadingMembers ? "…" : eligible.length) : "—"}</dd>
            </div>
            <div>
              <dt>{tr("text465")}</dt>
              <dd>{inRfx.size}</dd>
            </div>
            <div>
              <dt>{tr("text466")}</dt>
              <dd className="bad">{template ? (loadingMembers ? "…" : unavailable) : "—"}</dd>
            </div>
          </dl>
          <p className="nev-note">{tr("text467")}</p>
        </section>

        <section className="nev-card">
          <header>
            <b>{tr("text468")}</b>
          </header>
          <label className="nev-field">
            <span>{tr("text469")}</span>
            <select
              value="now"
              disabled
              title={tr("text470")}
            >
              <option value="now">{tr("text471")}</option>
            </select>
          </label>
          <label className="nev-field">
            <span>{tr("text431")}</span>
            <select value={messageId} onChange={(e) => setMessageId(e.target.value)}>
              <option value="">{outreach.loading ? tr("text472") : tr("text473")}</option>
              {messages.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {languageOf(t).toUpperCase()}
                  {isSystem(t) ? tr("text474") : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="nev-field">
            <span>{tr("text475")}</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as ChannelChoice)}>
              {CHANNEL_CHOICES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="nev-go">
          <b>{tr("text476")}</b>
          <p>
            {tr("text477")}{template ? tr("text478", toAdd.length) : tr("text479")} {tr("text480")}{lanes.length} {tr("text481")}</p>
          <div className="nev-gate">
            <Pill tone="orange">{tr("text482")}</Pill>
            <span>{tr("text483")}</span>
          </div>
          {error && <ErrorBanner message={error} />}
          <button
            className="primary"
            disabled={!canWork || !ready}
            title={canWork ? (ready ? undefined : tr("text484")) : NEED_REASON.operate}
            onClick={launch}
          >
            {busy ? step ?? tr("text485") : tr("text486")}
          </button>
          <button className="nev-later" disabled={busy} onClick={() => navigate(`/rfx/${eventId}`)}>
            {tr("text487")}</button>
        </section>
      </aside>
    </div>
  );
}
