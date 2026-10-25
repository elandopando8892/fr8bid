import { words, tr } from "@/i18n/outreach";
import { useLang } from "@/i18n/language";
import { useState } from "react";
import "@/styles/table-scroll.css";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { NEED_REASON } from "@/lib/roles";
import { Empty, ErrorBanner, InfoBanner, Pill, Spinner, TopBar, dateShort } from "@/components/ui";
import {
  archiveTemplate,
  channelLabel,
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  isSystem,
  languageOf,
  listTemplates,
  makeDefault,
  type OutreachTemplate,
} from "./templates.service";

export const LANGUAGE_LABEL = { get es() { return tr("text245"); }, get en() { return tr("text246"); } } as const;

const sameName = (a: OutreachTemplate, b: OutreachTemplate) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

/** Where the template stands with WhatsApp: its link to the invitation Meta approved. */
export function WhatsappStatus({ template }: { template: OutreachTemplate }) {
  useLang();
  if (template.channel === "email") return <span className="cell-sub">{tr("text247")}</span>;
  const status = String(template.whatsapp_meta?.meta_template_status || "").toUpperCase();
  if (status === "APPROVED") return <Pill tone="green">{tr("text248")}</Pill>;
  if (!status) return <Pill tone="amber">{tr("text147")}</Pill>;
  if (["PENDING", "IN_APPEAL"].includes(status)) return <Pill tone="amber">{tr("text249")}</Pill>;
  return <Pill tone="red">{status}</Pill>;
}

/**
 * The invitation templates campaigns are built from. The system's originals
 * are read-only; the team edits its own versions (same name) and templates.
 */
export function TemplatesPage() {
  useLang();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canWork = can("operate");
  const canAdmin = can("admin");
  const { data, loading, error, reload } = useAsync(listTemplates, []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The team's first: they are the ones campaigns use and the ones that change.
  const rows = [...(data ?? [])].sort(
    (a, b) => Number(isSystem(a)) - Number(isSystem(b)) || a.name.localeCompare(b.name),
  );

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    try {
      await work();
    } catch (e) {
      setNotice(tr("text066", (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  /** A system template is changed through the team's own version of it. */
  async function personalize(t: OutreachTemplate) {
    const existing = rows.find((r) => !isSystem(r) && sameName(r, t));
    if (existing) {
      navigate(`/plantillas/${existing.id}`);
      return;
    }
    const ok = await confirmAsync(
      tr("text250", t.name) +
        tr("text251"),
    );
    if (!ok) return;
    await run(async () => {
      const row = await createTemplate(
        {
          name: t.name,
          channel: t.channel || "multi",
          subject: t.subject || "",
          html_body: t.html_body || "",
          whatsapp_body: t.whatsapp_body || "",
        },
        t,
      );
      navigate(`/plantillas/${row.id}`);
    });
  }

  async function duplicate(t: OutreachTemplate) {
    await run(async () => {
      const row = await duplicateTemplate(t.id);
      navigate(`/plantillas/${row.id}`);
    });
  }

  async function setDefault(t: OutreachTemplate) {
    await run(async () => {
      await makeDefault(t, rows);
      setNotice(tr("text282", t.name, LANGUAGE_LABEL[languageOf(t)].toLowerCase()));
      reload();
    });
  }

  async function archive(t: OutreachTemplate) {
    const ok = await confirmAsync(
      tr("text252", t.name) +
        tr("text253"),
    );
    if (!ok) return;
    await run(async () => {
      await archiveTemplate(t.id);
      setNotice(tr("text254", t.name));
      reload();
    });
  }

  async function remove(t: OutreachTemplate) {
    const systemTwin = rows.some((r) => isSystem(r) && sameName(r, t));
    const ok = await confirmAsync(
      tr("text255", t.name) +
        (systemTwin ? tr("text256") : "") +
        tr("text257") +
        tr("text258"),
    );
    if (!ok) return;
    await run(async () => {
      await deleteTemplate(t.id);
      setNotice(tr("text259", t.name));
      reload();
    });
  }

  const lockedTitle = canWork ? undefined : NEED_REASON.operate;
  const adminTitle = canAdmin ? undefined : NEED_REASON.admin;

  return (
    <>
      <TopBar
        title={tr("text260")}
        sub={tr("text261")}
        actions={
          <>
            <button
              className="primary"
              disabled={!canWork}
              title={lockedTitle}
              onClick={() => navigate("/plantillas/nueva")}
            >
              {tr("text221")}</button>
          </>
        }
      />
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          <p className="cell-sub" style={{ margin: 0 }}>{tr("text263")}</p>
          {notice && <InfoBanner>{notice}</InfoBanner>}
          {loading && <Spinner label={tr("text264")} />}
          {error && <ErrorBanner message={error} />}
          {!loading && !error && (rows.length ? (
            <div className="data-table-scroll" role="region" tabIndex={0} aria-label={tr("text260")}>
            <table className="data">
              <thead>
                <tr>
                  <th>{tr("text222")}</th>
                  <th>{tr("text042")}</th>
                  <th>{tr("text122")}</th>
                  <th>WhatsApp</th>
                  <th>{tr("text265")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const system = isSystem(t);
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link to={`/plantillas/${t.id}`} className="cell-title">
                          {t.name}
                        </Link>
                        <div className="cell-sub">
                          {system ? tr("text266") : tr("text225")}
                          {t.is_default ? words("word9") : ""}
                        </div>
                      </td>
                      <td>{channelLabel(t.channel)}</td>
                      <td>{LANGUAGE_LABEL[languageOf(t)]}</td>
                      <td>
                        <WhatsappStatus template={t} />
                      </td>
                      <td className="mono">{dateShort(t.updated_at)}</td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {system ? (
                            <button disabled={busy || !canWork} title={lockedTitle} onClick={() => personalize(t)}>
                              {tr("text267")}</button>
                          ) : (
                            <>
                              <Link to={`/plantillas/${t.id}`} className="btn">
                                {tr("text268")}</Link>
                              {!t.is_default && (
                                <button disabled={busy || !canWork} title={lockedTitle} onClick={() => setDefault(t)}>
                                  {tr("text281")}</button>
                              )}
                              <button disabled={busy || !canWork} title={lockedTitle} onClick={() => duplicate(t)}>
                                {tr("text269")}</button>
                              <button disabled={busy || !canAdmin} title={adminTitle} onClick={() => archive(t)}>
                                {tr("text158")}</button>
                              <button disabled={busy || !canAdmin} title={adminTitle} onClick={() => remove(t)}>
                                {tr("text270")}</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          ) : (
            <Empty title={tr("text271")} hint={tr("text272")} />
          ))}
        </div>
      </main>
    </>
  );
}
