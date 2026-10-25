import { words, tr } from "@/i18n/outreach";
import { useLang } from "@/i18n/language";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { NEED_REASON } from "@/lib/roles";
import { ErrorBanner, InfoBanner, Spinner, TopBar } from "@/components/ui";
import {
  CHANNELS,
  connectWhatsapp,
  createTemplate,
  isSystem,
  languageOf,
  listTemplates,
  updateTemplate,
  variablesOf,
  type OutreachTemplate,
  type TemplateEdits,
} from "./templates.service";
import { LANGUAGE_LABEL, WhatsappStatus } from "./TemplatesPage";

const BLANK: TemplateEdits = { name: "", channel: "multi", subject: "", html_body: "", whatsapp_body: "" };

const editsOf = (t: OutreachTemplate): TemplateEdits => ({
  name: t.name,
  channel: t.channel || "multi",
  subject: t.subject || "",
  html_body: t.html_body || "",
  whatsapp_body: t.whatsapp_body || "",
});

const sameEdits = (a: TemplateEdits, b: TemplateEdits) =>
  (Object.keys(a) as (keyof TemplateEdits)[]).every((key) => a[key] === b[key]);

const usesEmail = (channel: string) => channel !== "whatsapp";
const usesWhatsapp = (channel: string) => channel !== "email";

/**
 * One template: `/plantillas/nueva` or `/plantillas/:id`. The system's are
 * shown read-only. Saving sends the whole template (see fullTemplate).
 */
export function TemplateEditorPage() {
  useLang();
  const { id = "" } = useParams();
  const isNew = id === "nueva";
  const navigate = useNavigate();
  const { can } = useAuth();
  const canWork = can("operate");
  const list = useAsync(listTemplates, [id]);
  const template = isNew ? null : (list.data ?? []).find((t) => t.id === id) ?? null;
  const readOnly = !canWork || (template ? isSystem(template) : false);

  const [edits, setEdits] = useState<TemplateEdits | null>(isNew ? BLANK : null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Seeded once per template; a reload (after connecting WhatsApp) keeps what is being typed.
  useEffect(() => {
    if (isNew) setEdits(BLANK);
    else if (template) setEdits(editsOf(template));
    else setEdits(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, template?.id]);

  const saved = template ? editsOf(template) : BLANK;
  const dirty = edits ? !sameEdits(edits, saved) : false;
  const set = (key: keyof TemplateEdits) => (value: string) => setEdits((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function leave() {
    if (dirty && !(await confirmAsync(tr("text209")))) return;
    navigate("/plantillas");
  }

  async function save() {
    if (!edits) return;
    const missing = [
      !edits.name.trim() && tr("text210"),
      usesEmail(edits.channel) && !edits.subject.trim() && words("word7"),
      usesEmail(edits.channel) && !edits.html_body.trim() && tr("text211"),
      edits.channel === "whatsapp" && !edits.whatsapp_body.trim() && tr("text212"),
    ].filter(Boolean);
    if (missing.length) {
      setNotice(tr("text213", missing.join(", ")));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      if (!template) {
        const row = await createTemplate(edits);
        navigate(`/plantillas/${row.id}`, { replace: true });
        return;
      }
      // What the server stored (it trims the texts) is the new starting point.
      setEdits(editsOf(await updateTemplate(template, edits)));
      setNotice(tr("text214"));
      list.reload();
    } catch (e) {
      setNotice(tr("text066", (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!template) return;
    if (dirty) {
      setNotice(tr("text215"));
      return;
    }
    const language = languageOf(template);
    const ok = await confirmAsync(
      tr("text216", LANGUAGE_LABEL[language].toLowerCase()) +
        tr("text217", language) +
        tr("text218"),
    );
    if (!ok) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await connectWhatsapp(template.id);
      setNotice(
        res.ready
          ? tr("text219")
          : tr("text220", res.message || res.row?.meta_template_status || words("word8")),
      );
      list.reload();
    } catch (e) {
      setNotice(tr("text066", (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const variables = edits ? variablesOf(edits.subject, edits.html_body, edits.whatsapp_body) : [];
  const title = isNew ? tr("text221") : template?.name || tr("text222");

  return (
    <>
      <TopBar
        title={title}
        sub={template ? (isSystem(template) ? tr("text224") : tr("text225")) : isNew ? tr("text225") : undefined}
        actions={
          <>
            <button onClick={leave}>{tr("text226")}</button>
            {!readOnly && (
              <button className="primary" disabled={busy || !edits || (!isNew && !dirty)} onClick={save}>
                {busy ? tr("text051") : isNew ? tr("text227") : tr("text228")}
              </button>
            )}
          </>
        }
      />
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          {notice && <InfoBanner>{notice}</InfoBanner>}
          {list.loading && !list.data && <Spinner label={tr("text229")} />}
          {list.error && <ErrorBanner message={list.error} />}
          {!isNew && list.data && !template && (
            <ErrorBanner message={tr("text273")} />
          )}
          {template && isSystem(template) && (
            <InfoBanner title={tr("text230")}>
              {tr("text231")}</InfoBanner>
          )}
          {!canWork && <InfoBanner>{NEED_REASON.operate}</InfoBanner>}

          {edits && (
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
              <div className="card" style={{ display: "grid", gap: 10, alignContent: "start" }}>
                <label className="field">
                  <span>{tr("text232")}</span>
                  <input value={edits.name} disabled={readOnly} onChange={(e) => set("name")(e.target.value)} />
                </label>
                <label className="field">
                  <span>{tr("text042")}</span>
                  <select value={edits.channel} disabled={readOnly} onChange={(e) => set("channel")(e.target.value)}>
                    {CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                    {!CHANNELS.some((c) => c.value === edits.channel) && (
                      <option value={edits.channel}>{edits.channel}</option>
                    )}
                  </select>
                </label>
                {usesEmail(edits.channel) && (
                  <>
                    <label className="field">
                      <span>{tr("text233")}</span>
                      <input value={edits.subject} disabled={readOnly} onChange={(e) => set("subject")(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>{tr("text234")}</span>
                      <textarea
                        rows={16}
                        className="mono"
                        style={{ fontSize: 12 }}
                        value={edits.html_body}
                        disabled={readOnly}
                        onChange={(e) => set("html_body")(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {usesWhatsapp(edits.channel) && (
                  <label className="field">
                    <span>{tr("text235")}</span>
                    <textarea
                      rows={6}
                      value={edits.whatsapp_body}
                      disabled={readOnly}
                      onChange={(e) => set("whatsapp_body")(e.target.value)}
                    />
                  </label>
                )}
                <div>
                  <div className="cell-sub" style={{ marginBottom: 4 }}>
                    {tr("text236")}{variables.length}):
                  </div>
                  <div className="mono" style={{ fontSize: 12, lineHeight: 1.7 }}>
                    {variables.length ? variables.map((v) => `{{${v}}}`).join("  ") : tr("text237")}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
                {usesEmail(edits.channel) && (
                  <div className="card">
                    <h2 style={{ marginTop: 0 }}>{tr("text194")}</h2>
                    <div className="cell-sub" style={{ marginBottom: 8 }}>
                      {tr("text238")}{edits.subject || "—"}{tr("text239")}{words("word10")}{tr("text240")}</div>
                    <iframe
                      title={tr("text194")}
                      sandbox=""
                      srcDoc={edits.html_body}
                      style={{ width: "100%", height: 520, border: "1px solid var(--line)", background: "#fff" }}
                    />
                  </div>
                )}
                {usesWhatsapp(edits.channel) && (
                  <div className="card">
                    <h2 style={{ marginTop: 0 }}>WhatsApp</h2>
                    {template ? (
                      <>
                        <div className="row" style={{ alignItems: "center" }}>
                          <WhatsappStatus template={template} />
                          <span className="cell-sub">
                            {template.whatsapp_meta?.meta_template_name
                              ? `${template.whatsapp_meta.meta_template_name} · ${template.whatsapp_meta.meta_template_language ?? ""}`
                              : tr("text241")}
                          </span>
                          <div className="spacer" />
                          {!isSystem(template) &&
                            String(template.whatsapp_meta?.meta_template_status || "").toUpperCase() !== "APPROVED" && (
                              <button disabled={busy || !canWork} title={canWork ? undefined : NEED_REASON.operate} onClick={connect}>
                                {tr("text242")}</button>
                            )}
                        </div>
                        <p className="cell-sub" style={{ marginBottom: 0 }}>
                          {tr("text243")}</p>
                      </>
                    ) : (
                      <p className="cell-sub" style={{ margin: 0 }}>
                        {tr("text244")}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
