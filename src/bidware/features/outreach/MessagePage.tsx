import { words, tr, generationText } from "@/i18n/outreach";
import { useLang, getLang } from "@/i18n/language";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useParams } from "react-router-dom";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { newOperationId } from "@/lib/operation-id";
import { env } from "@/config/env";
import { ErrorBanner, InfoBanner, Pill, Spinner } from "@/components/ui";
import { fetchRfxDetail } from "@/features/rfx-admin/rfx.service";
import { gmailHealth, listGmailConnections } from "@/features/integrations/integrations.service";
import {
  archiveOutreachCampaign,
  createOutreachCampaign,
  generateOutreachDrafts,
  listOutreachCampaigns,
  listDraftAudienceSegments,
  type DraftChannel,
} from "./outreach.service";
import { isSystem, languageOf, listTemplates, updateTemplate } from "./templates.service";
import { LaunchHeader, LaunchTabs, audienceOf } from "./LaunchShell";
import { listContactReviews } from "./review.service";
import { reviewedDraftAudience } from "./reviewed-audience";

/**
 * The variables worth inserting, as rateware's renderer fills them per carrier
 * (outreachVariables). The wireframe's {{carrier_name}} / {{bid_room_link}}
 * are really vendor_name / bid_link: anything else goes out unfilled.
 */
const VARIABLES = [
  "vendor_name",
  "contact_name",
  "event_name",
  "rfx_id",
  "lane_count",
  "due_date",
  "lane_table",
  "bid_link",
  "profile_link",
];

const CHANNEL_LABEL: Record<DraftChannel, string> = {
  get email(){return words("word5");},
  whatsapp: "WhatsApp",
  get whatsapp_group() { return tr("text146"); },
};

/** A Meta status as a pill: only APPROVED lets WhatsApp go out automatically. */
function metaPill(status?: string | null) {
  const s = String(status ?? "").toUpperCase();
  if (!s) return <Pill>{tr("text147")}</Pill>;
  if (s === "APPROVED") return <Pill tone="green">APPROVED</Pill>;
  if (s === "PENDING") return <Pill tone="amber">PENDING</Pill>;
  return <Pill tone="red">{s}</Pill>;
}

/**
 * Message (wireframe 17): prepares the invitation drafts. It never sends —
 * the drafts go to the Delivery queue, the only surface that sends.
 */
export function MessagePage() {
  useLang();
  const { id = "" } = useParams();
  const { can } = useAuth();
  const canWork = can("operate");
  const detail = useAsync(() => fetchRfxDetail(id), [id]);
  const templates = useAsync(listTemplates, []);
  const campaigns = useAsync(() => listOutreachCampaigns(id), [id]);
  const reviews = useAsync(() => listContactReviews(id), [id]);
  const gmail = useAsync(listGmailConnections, []);

  const [language, setLanguage] = useState<"es" | "en">("es");
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState<Set<DraftChannel>>(new Set(["email"]));
  const [busy, setBusy] = useState<"save" | "generate" | "archive" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [campaignKey, setCampaignKey] = useState(() => newOperationId());
  // One id per channel for this attempt: generate_outreach_drafts is a
  // correlated high-risk action, and a retry without the same id generates twice.
  const [operationIds, setOperationIds] = useState<Record<DraftChannel, string>>(() => ({
    email: newOperationId(),
    whatsapp: newOperationId(),
    whatsapp_group: newOperationId(),
  }));
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const event = detail.data?.event;
  const lanes = detail.data?.lanes ?? [];
  const all = templates.data ?? [];
  const eventCampaigns = (campaigns.data ?? []).filter((c: { status?: string }) => c.status !== "archived");
  const inLanguage = all.filter((t) => languageOf(t) === language);
  const template = all.find((t) => t.id === templateId) ?? null;
  const campaign = template ? eventCampaigns.find((c: { template_id?: string }) => c.template_id === template.id) : undefined;
  const segments = useAsync(
    () => campaign?.audience_policy?.mode === "saved_segment" ? listDraftAudienceSegments(id) : Promise.resolve([]),
    [id, campaign?.id, campaign?.audience_policy?.saved_segment_id],
  );
  const draftAudience = useMemo(() => reviewedDraftAudience(audienceOf(lanes), reviews.data ?? [], campaign?.audience_policy, segments.data ?? []),
    [lanes, reviews.data, campaign?.audience_policy, segments.data]);
  const audience = draftAudience.audience;
  const editable = Boolean(template && !isSystem(template));
  const dirty = Boolean(template && (subject !== (template.subject ?? "") || body !== (template.html_body ?? "")));
  const mailbox = gmail.data?.rows?.[0];
  const gmailState = gmailHealth(mailbox);
  const meta = template?.whatsapp_meta ?? null;
  const metaApproved = String(meta?.meta_template_status ?? "").toUpperCase() === "APPROVED";

  // Start on the template this event's campaign uses, else the default one.
  useEffect(() => {
    if (templateId || !all.length) return;
    const fromCampaign = eventCampaigns
      .map((c: { template_id?: string }) => all.find((t) => t.id === c.template_id))
      .find(Boolean);
    const start =
      fromCampaign ??
      all.find((t) => t.is_default && !isSystem(t) && languageOf(t) === "es") ??
      all.find((t) => !isSystem(t) && languageOf(t) === "es") ??
      all[0];
    setLanguage(languageOf(start));
    setTemplateId(start.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.length, campaigns.data]);

  // A template shows its own saved text.
  useEffect(() => {
    setSubject(template?.subject ?? "");
    setBody(template?.html_body ?? "");
  }, [template]);

  function pickLanguage(next: "es" | "en") {
    setLanguage(next);
    if (template && languageOf(template) === next) return;
    const candidates = all.filter((t) => languageOf(t) === next);
    const start = candidates.find((t) => t.is_default && !isSystem(t)) ?? candidates.find((t) => !isSystem(t)) ?? candidates[0];
    setTemplateId(start?.id ?? "");
  }

  function insert(variable: string) {
    const el = bodyRef.current;
    const token = `{{${variable}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  }

  async function save() {
    if (!template || !editable || !dirty) return;
    setBusy("save");
    setNotice(null);
    try {
      await updateTemplate(template, {
        name: template.name,
        channel: String(template.channel || "email"),
        subject,
        html_body: body,
        whatsapp_body: template.whatsapp_body ?? "",
      });
      templates.reload();
      setNotice(tr("text148", template.name));
    } catch (e) {
      setNotice(tr("text066", (e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  /** Links the event to the template (reusing its campaign) and prepares one set of drafts per channel. */
  async function generate() {
    if (!template || !canGenerate) return;
    const reviewedVendorIds = audience.map((v) => v.id);
    const list = [...channels];
    const ok = await confirmAsync(
      tr("text149", template.name, list.map((c) => CHANNEL_LABEL[c]).join(tr("text070"))) +
        tr("text150", audience.length, audience.length === 1 ? "" : "s") +
        tr("text151"),
      { ok: tr("text152") },
    );
    if (!ok) return;
    setBusy("generate");
    setNotice(null);
    try {
      let campaignId = campaign?.id as string | undefined;
      if (!campaignId) {
        const rfxKey = String(event?.rfx_id ?? event?.name ?? "RFx");
        const { row } = await createOutreachCampaign({
          rfx_event_id: id,
          template_id: template.id,
          name: `${rfxKey} invitation wave`,
          channel: String(template.channel || "email"),
          // Same key across retries of this attempt; a new one after success.
          idempotency_key: `bidware:${id}:${campaignKey}`,
        });
        setCampaignKey(newOperationId());
        campaignId = row?.id;
        campaigns.reload();
      }
      if (!campaignId) throw new Error(tr("text153"));
      const parts: string[] = [];
      let prepared = 0;
      for (const channel of list) {
        const res = (await generateOutreachDrafts({
          campaign_id: campaignId,
          channel,
          reviewed_vendor_ids: reviewedVendorIds,
          operation_id: operationIds[channel],
        })) as { generated?: number; rows?: unknown[]; skipped?: { reason?: string; reason_code?: string }[] };
        setOperationIds((prev) => ({ ...prev, [channel]: newOperationId() }));
        const count = res.generated ?? res.rows?.length ?? 0;
        prepared += count;
        const reasons = [...new Set((res.skipped ?? []).map((s) =>
          s.reason_code === "daily_cap" ? generationText("dailyCap") : s.reason_code === "not_reviewed" ? generationText("notReviewed") : s.reason,
        ).filter(Boolean))];
        parts.push(
          `${CHANNEL_LABEL[channel]}: ${count}` +
            (reasons.length ? tr("text154", res.skipped!.length, reasons.join("; ")) : ""),
        );
      }
      setNotice(prepared > 0 ? tr("text155", parts.join(" · ")) : generationText("none", parts.join(" · ")));
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "reviewed_audience_changed" || code === "reviewed_audience_required") {
        setNotice(generationText(code === "reviewed_audience_changed" ? "changed" : "noReviewed"));
        reviews.reload(); campaigns.reload(); detail.reload();
      } else setNotice(tr("text066", (e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function archiveCampaign() {
    if (!campaign) return;
    const ok = await confirmAsync(
      tr("text156", campaign.name || campaign.id) +
        tr("text157"),
      { ok: tr("text158") },
    );
    if (!ok) return;
    setBusy("archive");
    try {
      await archiveOutreachCampaign(campaign.id);
      campaigns.reload();
      setNotice(tr("text159"));
    } catch (e) {
      setNotice(tr("text066", (e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  /** The draft as a sample carrier will read it, with the event's own values. */
  const preview = useMemo(() => {
    const sampleName = audience[0]?.name || tr("text160");
    const firstLane = lanes[0] as Record<string, unknown> | undefined;
    const values: Record<string, string> = {
      vendor_name: sampleName,
      contact_name: sampleName,
      event_name: String(event?.name ?? event?.rfx_id ?? ""),
      rfx_id: String(event?.rfx_id ?? ""),
      rfx_type: String(event?.event_type ?? ""),
      due_date: String(event?.due_date ?? ""),
      lane_count: String(lanes.length || ""),
      lane_origin: String(firstLane?.origin ?? ""),
      lane_destination: String(firstLane?.destination ?? ""),
      equipment: String(firstLane?.equipment ?? ""),
      trailer: String(firstLane?.trailer ?? ""),
      config: String(firstLane?.config ?? ""),
      operation: String(firstLane?.operation ?? ""),
      service: String(firstLane?.service ?? ""),
      lane_table: `<table style="border-collapse:collapse;font-size:12px">${lanes
        .slice(0, 6)
        .map(
          (l) =>
            `<tr><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(String((l as Record<string, unknown>).origin ?? ""))}</td><td style="border:1px solid #ddd;padding:4px 8px">${escapeHtml(String((l as Record<string, unknown>).destination ?? ""))}</td></tr>`,
        )
        .join("")}</table>`,
      lane_rows_text: lanes
        .map(
          (l, i) =>
            `${i + 1}. ${escapeHtml(String((l as Record<string, unknown>).origin ?? ""))} → ${escapeHtml(String((l as Record<string, unknown>).destination ?? ""))}`,
        )
        .join("<br>"),
      bid_link: `${env.appOrigin}/rfx-bid.html?token=…`,
      profile_link: `${env.appOrigin}/carrier-profile.html?token=…`,
    };
    // A variable the renderer doesn't know stays visible, as it would in the email.
    const pattern = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    const asText = (text: string) =>
      text.replace(pattern, (_, key: string) =>
        key === "lane_table" || key === "lane_rows_text" ? `(${lanes.length} lanes)` : values[key] ?? `{{${key}}}`,
      );
    const asHtml = (html: string) =>
      html.replace(pattern, (_, key: string) => {
        const value = values[key];
        if (value === undefined) return `{{${key}}}`;
        return key === "lane_table" || key === "lane_rows_text" ? value : escapeHtml(value);
      });
    return { sampleName, subject: asText(subject), html: asHtml(body) };
  }, [getLang(), audience, lanes, event, subject, body]);

  const loading = detail.loading || templates.loading || campaigns.loading || reviews.loading || segments.loading;
  const cta = tr("text161", audience.length ? tr("text162", audience.length, audience.length === 1 ? "" : "s") : "");
  const canGenerate = Boolean(template && channels.size && audience.length && !loading
    && !detail.error && !campaigns.error && !reviews.error && !segments.error && !draftAudience.unresolved
    && !dirty && canWork && busy === null);
  const generateTitle = !canWork
    ? NEED_REASON.operate
    : dirty
      ? tr("text163")
      : !audience.length ? generationText("noReviewed") : undefined;

  return (
    <>
      <LaunchHeader
        eventId={id}
        event={event}
        title={tr("text145")}
        tags={<Pill tone="blue">LAUNCH</Pill>}
        info={generationText("reviewedCount", audience.length, draftAudience.selected)}
        actions={
          <>
            <button
              type="button"
              disabled={!editable || !dirty || busy !== null || !canWork}
              title={!canWork ? NEED_REASON.operate : !editable ? tr("text164") : undefined}
              onClick={save}
            >
              {busy === "save" ? tr("text051") : tr("text165")}
            </button>
            <button type="button" className="primary" disabled={!canGenerate} title={generateTitle} onClick={generate}>
              {busy === "generate" ? tr("text166") : cta}
            </button>
          </>
        }
      />
      <main className="main launch-main">
        <LaunchTabs eventId={id} active="message" />
        {notice && <div role="status" aria-live="polite"><InfoBanner>{notice}</InfoBanner></div>}
        {detail.error && <ErrorBanner message={detail.error} />}
        {templates.error && <ErrorBanner message={templates.error} />}
        {campaigns.error && <ErrorBanner message={campaigns.error} />}
        {reviews.error && <ErrorBanner message={reviews.error} />}
        {segments.error && <ErrorBanner message={segments.error} />}
        {draftAudience.unresolved && <ErrorBanner message={generationText("selectionUnavailable")} />}

        <div className="msg-audience">
          <Pill tone="dark">{tr("text167")}</Pill>
          <b>
            {generationText("reviewedCount", audience.length, draftAudience.selected)}
          </b>
          <span>
            {tr("text169")}{lanes.length} lane{lanes.length === 1 ? "" : "s"}{tr("text170")}</span>
          <div className="spacer" />
          <Link to={`/rfx/${id}/review`}>{generationText("reviewContacts")}</Link>
        </div>
        {!loading && <p className="msg-hint">{generationText("audienceRule", draftAudience.total)} {audience.length === 0 && generationText("noReviewed")}</p>}

        {loading ? (
          <Spinner label={tr("text172")} />
        ) : (
          <div className="msg-grid">
            <div className="msg-col">
              <section className="card msg-card">
                <header>
                  <h2>{tr("text173")}</h2>
                  <div className="spacer" />
                  {template && <Link to={`/plantillas/${template.id}`}>{tr("text174")}</Link>}
                </header>
                <div className="msg-row">
                  <label className="msg-field grow">
                    <span>{tr("text175")}</span>
                    <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                      {inLanguage.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {isSystem(t) ? tr("text176") : ""}
                          {t.is_default ? " · default" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="msg-field">
                    <span>{tr("text122")}</span>
                    <div className="msg-seg" role="group" aria-label={tr("text122")}>
                      {(["es", "en"] as const).map((l) => (
                        <button key={l} type="button" className={language === l ? "on" : undefined} onClick={() => pickLanguage(l)}>
                          {l.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="msg-hint">
                  {campaign ? (
                    <>
                      {tr("text177")}<b>{campaign.name || campaign.id}</b>
                      {can("admin") && (
                        <>
                          {" · "}
                          <button type="button" className="link" disabled={busy !== null} onClick={archiveCampaign}>
                            {tr("text178")}</button>
                        </>
                      )}
                    </>
                  ) : (
                    tr("text179")
                  )}
                  {template && !editable && tr("text180")}
                </p>
                <label className="msg-field">
                  <span>{tr("text181")}</span>
                  <input className="mono" value={subject} readOnly={!editable || !canWork} onChange={(e) => setSubject(e.target.value)} />
                </label>
                <label className="msg-field">
                  <span>{tr("text182")}</span>
                  <textarea
                    ref={bodyRef}
                    className="mono msg-body"
                    rows={12}
                    value={body}
                    readOnly={!editable || !canWork}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                {editable && canWork && (
                  <div className="msg-vars">
                    <span>{tr("text183")}</span>
                    {VARIABLES.map((v) => (
                      <button key={v} type="button" onClick={() => insert(v)}>
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="card msg-card">
                <header>
                  <h2>{tr("text184")}</h2>
                </header>
                <label className={`msg-channel${channels.has("email") ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={channels.has("email")}
                    onChange={(e) => toggle(setChannels, "email", e.target.checked)}
                  />
                  <span className="grow">
                    <b>Email · Gmail</b>
                    <small>
                      {mailbox?.mailbox_email
                        ? tr("text185", mailbox.mailbox_email)
                        : tr("text186")}
                    </small>
                  </span>
                  {gmailState.state === "ok" ? (
                    <Pill tone="green">{tr("text058")}</Pill>
                  ) : (
                    <Pill tone={gmailState.state === "down" ? "red" : "amber"}>{gmailState.state === "down" ? tr("text147") : tr("text187")}</Pill>
                  )}
                </label>
                <label className={`msg-channel${channels.has("whatsapp") ? " on" : ""}${meta ? "" : " off"}`}>
                  <input
                    type="checkbox"
                    disabled={!meta}
                    checked={channels.has("whatsapp")}
                    onChange={(e) => toggle(setChannels, "whatsapp", e.target.checked)}
                  />
                  <span className="grow">
                    <b>{tr("text188")}</b>
                    <small>
                      {meta
                        ? `${meta.meta_template_name ?? "—"} · ${meta.meta_template_language ?? "—"}`
                        : tr("text189")}
                    </small>
                  </span>
                  {metaPill(meta?.meta_template_status)}
                </label>
                <label className={`msg-channel${channels.has("whatsapp_group") ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={channels.has("whatsapp_group")}
                    onChange={(e) => toggle(setChannels, "whatsapp_group", e.target.checked)}
                  />
                  <span className="grow">
                    <b>{tr("text190")}</b>
                    <small>{tr("text191")}</small>
                  </span>
                  <Pill tone="amber">MANUAL ONLY</Pill>
                </label>
                <p className="msg-hint">{tr("text192")}</p>
              </section>
            </div>

            <aside className="msg-side">
              <section className="card msg-card">
                <header>
                  <h2>{tr("text193")}</h2>
                  <div className="spacer" />
                  <Pill tone="indigo">{preview.sampleName}</Pill>
                </header>
                <div className="msg-preview">
                  <b>{preview.subject || "—"}</b>
                  {/* The template is HTML; the sandbox renders it without running anything. */}
                  <iframe title={tr("text194")} sandbox="" srcDoc={previewDocument(preview.html)} />
                </div>
                <p className="msg-hint">{tr("text195")}</p>
              </section>

              {channels.has("whatsapp") && meta && !metaApproved && (
                <section className="msg-warn">
                  <header>
                    <Pill tone="amber">META {String(meta.meta_template_status ?? tr("text196")).toUpperCase()}</Pill>
                    <b>WhatsApp {language.toUpperCase()}{tr("text197")}</b>
                  </header>
                  <p>
                    {meta.meta_template_name}{tr("text198")}{String(meta.meta_template_status ?? words("word6")).toUpperCase()}{tr("text199")}</p>
                  <Link className="btn" to="/integraciones">
                    {tr("text200")}</Link>
                </section>
              )}

              <section className="msg-go">
                <b>{tr("text152")}</b>
                <p>
                  {tr("text201")}{audience.length}{tr("text202")}{audience.length === 1 ? "" : "es"}{tr("text203")}{[...channels].map((c) => CHANNEL_LABEL[c]).join(" + ") || tr("text204")}{tr("text205")}</p>
                <div className="msg-go-note">
                  <Pill tone="orange">{tr("text206")}</Pill>
                  <span>{tr("text207")}</span>
                </div>
                <button type="button" className="primary" disabled={!canGenerate} title={generateTitle} onClick={generate}>
                  {busy === "generate" ? tr("text166") : cta}
                </button>
                <Link to={`/rfx/${id}/delivery`}>{tr("text208")}</Link>
              </section>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

function toggle(set: Dispatch<SetStateAction<Set<DraftChannel>>>, channel: DraftChannel, on: boolean) {
  set((prev) => {
    const next = new Set(prev);
    if (on) next.add(channel);
    else next.delete(channel);
    return next;
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The preview document: the email's HTML in a neutral page, no scripts. */
function previewDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:10px 12px;font:12px/1.5 -apple-system,Segoe UI,Inter,sans-serif;color:#484848}a{color:#ea5e27}p{margin:0 0 8px}</style></head><body>${html}</body></html>`;
}
