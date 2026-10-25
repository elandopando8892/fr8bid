import { tr } from "@/i18n/integrations";
import { useLang, locale } from "@/i18n/language";
import { confirmAsync } from "@/components/confirm";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import type { Vendor } from "@/types/domain";
import { syncGmailBounces } from "@/features/carrier-crm/contact.service";
import {
  consentResult,
  disconnectGmail,
  disconnectGoogleChat,
  getGoogleChat,
  gmailConsentUrl,
  googleChatConsentUrl,
  googleChatHealth,
  listGoogleChatSpaces,
  retryGoogleChatSync,
  saveGoogleChatSpace,
  type GoogleChatSpace,
} from "./connect.service";
import {
  listGmailConnections,
  listGroupCarriers,
  getWhatsappStatus,
  listWhatsappTemplates,
  testWhatsappConnection,
  syncWhatsappTemplates,
  verifyGroup,
  verifyWhatsappWebhook,
  gmailHealth,
  whatsappHealth,
  syncStaleness,
  accessTokenAge,
  templateLanguage,
  templateName,
  templateStatus,
  HEALTH_TONE,
  HEALTH_LABEL,
  type ChannelHealth,
} from "./integrations.service";
import { useAsync } from "@/components/useAsync";
import { TopBar, Spinner, ErrorBanner, InfoBanner, Pill, dateShort } from "@/components/ui";
import { GmailConnectionCheck } from "./GmailConnectionCheck";

/** "CONECTADO" when the channel works; the health words otherwise. */
const stateLabel = (): Record<ChannelHealth, string> => ({ ...HEALTH_LABEL, get ok() { return tr("text023"); } });

/** "hoy 09:14" or "28 sep 2026 · 09:14", the way the wireframe stamps a time. */
function when(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const time = d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === new Date().toDateString() ? tr("text024", time) : `${dateShort(iso)} · ${time}`;
}

/** Meta's template review, in the team's words. */
const TEMPLATE_STATUS: Record<string, string> = {
  get APPROVED() { return tr("text132"); },
  get PENDING() { return tr("text133"); },
  get REJECTED() { return tr("text134"); },
  get PAUSED() { return tr("text135"); },
};

/** A carrier's WhatsApp group, as the server reports it. */
const GROUP_STATUS: Record<string, string> = {
  get manual_only() { return tr("text136"); },
  get api_ready() { return tr("text137"); },
  get verified() { return tr("text138"); },
  get blocked() { return tr("text139"); },
  get error() { return "Error"; },
};

const MAILBOX_STATUS: Record<string, string> = {
  get connected() { return tr("text023"); },
};

/** One labelled fact of a channel: value in mono, plus "✓ configurado" when a secret is in place. */
function Fact({ label, value, configured }: { label: string; value: ReactNode; configured?: boolean | null }) {
  useLang();
  return (
    <div className="ig-fact">
      <span>{label}</span>
      <div>
        <b className="mono">{value ?? "—"}</b>
        {configured === true && <em className="pill green">{tr("text025")}</em>}
        {configured === false && <em className="pill red">{tr("text026")}</em>}
      </div>
    </div>
  );
}

/**
 * Integraciones / Canales (wireframe 16): the shared backend's channels, the
 * same ones rateware sends through. Secrets never reach the browser; the page
 * shows masked ids and configured yes/no. Nothing here sends anything: the
 * Delivery queue of each event is the only place a message goes out.
 */
export function IntegrationsPage() {
  useLang();
  const gmail = useAsync(() => listGmailConnections(), []);
  const wa = useAsync(() => getWhatsappStatus(), []);
  const templates = useAsync(() => listWhatsappTemplates(), []);
  const groups = useAsync(() => listGroupCarriers(), []);
  const chat = useAsync(() => getGoogleChat(), []);
  const { can } = useAuth();
  const canWork = can("operate");
  const canAdmin = can("admin");

  const [busy, setBusy] = useState<string | null>(null);
  const [gmailCheckBusy, setGmailCheckBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<GoogleChatSpace[] | null>(null);
  const [space, setSpace] = useState("");

  // Back from Google's consent screen: say how it went, then clear the address
  // so a reload does not repeat it.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const result = consentResult(params);
    if (!result) return;
    if (result.ok) setNotice(result.message);
    else setFailure(result.message);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reloadAll() {
    gmail.reload();
    chat.reload();
    wa.reload();
    templates.reload();
    groups.reload();
  }

  /** Leaves Bidware for Google's consent page; the callback brings the browser back here. */
  async function connect(key: "gmail" | "chat") {
    const who = key === "gmail" ? mailbox?.mailbox_email ?? gmail.data?.allowed_sender : chat.data?.account;
    const ok = await confirmAsync(
      tr("text027", key === "gmail" ? tr("text028") : "Google Chat") +
        tr("text029", who ?? tr("text030")),
    );
    if (!ok) return;
    setBusy(key);
    setNotice(null);
    setFailure(null);
    try {
      window.location.assign(key === "gmail" ? await gmailConsentUrl(who ?? undefined) : await googleChatConsentUrl(who ?? undefined));
    } catch (e) {
      setFailure((e as Error).message);
      setBusy(null);
    }
  }

  async function loadSpaces() {
    setBusy("spaces");
    setFailure(null);
    try {
      const res = await listGoogleChatSpaces();
      setSpaces(res.rows);
      setSpace(res.current ?? "");
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function run(key: string, fn: () => Promise<unknown>, ok: (r: any) => string) {
    setBusy(key);
    setNotice(null);
    setFailure(null);
    try {
      const res = await fn();
      setNotice(ok(res));
      reloadAll();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const mailbox = gmail.data?.rows?.[0];
  const conn = wa.data;
  const g = gmailHealth(mailbox);
  const chatRow = chat.data?.row;
  const c = googleChatHealth(chatRow);
  const w = whatsappHealth(conn);
  const sync = syncStaleness(conn?.templates_last_synced_at);
  const rows = templates.data ?? [];
  // The banner explains Meta's review; a REJECTED or PAUSED template already reads so in its row.
  const pending = rows.filter((t) => templateStatus(t) === "PENDING");
  const groupsEnabled = conn?.groups_enabled === true;
  const groupRows = groups.data ?? [];
  const operateOnly = canWork ? {} : { disabled: true, title: NEED_REASON.operate };
  const adminOnly = canAdmin ? {} : { disabled: true, title: NEED_REASON.admin };

  const loading = gmail.loading || wa.loading || chat.loading;

  return (
    <>
      <TopBar
        title={tr("text031")}
        sub={tr("text032")}
        actions={
          <button onClick={reloadAll} disabled={loading || gmailCheckBusy}>
            {loading ? tr("text033") : tr("text034")}
          </button>
        }
      />
      <main className="main">
        <div className="ig-page">
          {notice && <InfoBanner>{notice}</InfoBanner>}
          {failure && <ErrorBanner message={failure} />}
          {gmail.error && <ErrorBanner message={gmail.error} />}
          {wa.error && <ErrorBanner message={wa.error} />}

          {loading && <Spinner label={tr("text037")} />}

          {!loading && (
            <>
              {/* WhatsApp Business */}
              <section className={`card ig-card${w.state === "down" ? " ig-down" : ""}`}>
                <div className="ig-head">
                  <h2>WhatsApp Business · Meta Cloud API</h2>
                  <Pill tone={HEALTH_TONE[w.state]}>{stateLabel()[w.state]}</Pill>
                  <div className="spacer" />
                  <button
                    disabled={busy !== null}
                    onClick={() =>
                      run("test", testWhatsappConnection, (r) =>
                        r?.ok
                          ? tr("text038", r.verified_name ?? "—", r.display_phone_number ?? "—", r.quality_rating ?? "—")
                          : tr("text039"),
                      )
                    }
                  >
                    {busy === "test" ? tr("text040") : tr("text041")}
                  </button>
                  <button
                    disabled={busy !== null || !canWork}
                    title={canWork ? undefined : NEED_REASON.operate}
                    onClick={async () => {
                      if (!(await confirmAsync(tr("text042"))))
                        return;
                      run("sync", syncWhatsappTemplates, () => tr("text043"));
                    }}
                  >
                    {busy === "sync" ? tr("text044") : tr("text045")}
                  </button>
                  <button
                    disabled={busy !== null || !canWork}
                    title={canWork ? undefined : NEED_REASON.operate}
                    onClick={async () => {
                      if (!(await confirmAsync(tr("text046"))))
                        return;
                      run("webhook", verifyWhatsappWebhook, (r) =>
                        r?.verified
                          ? tr("text047", r.endpoint ?? tr("text048"))
                          : tr("text049"),
                      );
                    }}
                  >
                    {busy === "webhook" ? tr("text050") : tr("text051")}
                  </button>
                </div>
                {w.state !== "ok" && <p className="ig-alert">{w.detail}</p>}

                <div className="ig-facts">
                  <Fact label={tr("text052")} value={conn?.display_phone_number || "—"} />
                  <Fact label={tr("text053")} value={conn?.verified_name || "—"} />
                  <Fact label={tr("text126")} value={conn?.quality_rating || "—"} />
                  <Fact label={tr("text127")} value={conn?.phone_number_id || "—"} configured={conn?.phone_number_id_configured} />
                  <Fact label="WABA ID" value={conn?.waba_id || "—"} configured={conn?.waba_id_configured} />
                  <Fact label={tr("text128")} value={tr("text054")} configured={conn?.app_secret_configured} />
                  <Fact label={tr("text129")} value={tr("text054")} configured={conn?.webhook_configured} />
                  <Fact
                    label="Webhook"
                    value={conn?.webhook_verified_at ? tr("text055", when(conn.webhook_verified_at)) : tr("text056")}
                    configured={conn?.webhook_verified_at ? true : undefined}
                  />
                </div>
                {conn?.internal_managed && (
                  <p className="ig-note">
                    {tr("text057")}<b>internal_managed</b>{tr("text058")}</p>
                )}

                <div className="ig-templates">
                  <div className="ig-templates-head">
                    <b>{tr("text059")}</b>
                    <span>
                      {tr("text060")}{conn?.templates_last_synced_at
                        ? tr("text061", when(conn.templates_last_synced_at), sync.stale ? tr("text062") : "")
                        : ""}
                    </span>
                  </div>
                  {templates.loading && <Spinner label={tr("text063")} />}
                  {!templates.loading && !rows.length && (
                    <p className="ig-note">{tr("text064")}</p>
                  )}
                  {rows.map((t, i) => {
                    const status = templateStatus(t);
                    const ok = status === "APPROVED";
                    const lang = templateLanguage(t);
                    return (
                      <div key={String(t.id ?? templateName(t) ?? i)} className="ig-template">
                        <span className="mono">{templateName(t)}</span>
                        <span className="mono">{lang}</span>
                        <span className="ig-template-hint">
                          {ok ? tr("text065") : tr("text066", lang.split("_")[0].toUpperCase())}
                        </span>
                        <Pill tone={ok ? "green" : status === "REJECTED" ? "red" : "amber"}>{TEMPLATE_STATUS[status] ?? (status || "—")}</Pill>
                      </div>
                    );
                  })}
                </div>
                {pending.length > 0 && (
                  <div className="banner warn">
                    <b>{tr("text067")}</b>
                    <span>
                      {tr("text068")}</span>
                  </div>
                )}
              </section>

              <div className="ig-grid">
                {/* WhatsApp groups */}
                <section className="card ig-card ig-groups">
                  <div className="ig-head">
                    <h2>{tr("text069")}</h2>
                    <Pill tone={groupsEnabled ? "green" : "amber"}>{groupsEnabled ? tr("text130") : tr("text131")}</Pill>
                  </div>
                  <p className="ig-note">
                    {groupsEnabled
                      ? tr("text070")
                      : tr("text071")}
                  </p>
                  {groups.loading && <Spinner label={tr("text072")} />}
                  {groups.error && <ErrorBanner message={groups.error} />}
                  {!groups.loading && !groups.error && (
                    <div className="ig-list">
                      {groupRows.length ? (
                        groupRows.map((v: Vendor) => {
                          const status = String(v.whatsapp_group_status ?? "manual_only");
                          const name = String(v.whatsapp_group_name || v.vendor_name || v.name || tr("text073"));
                          return (
                            <div key={v.id} className="ig-list-row">
                              <Link to="/crm" className="ig-list-name" title={tr("text074")}>
                                {name}
                                {Boolean(v.whatsapp_group_name) && <small>{String(v.vendor_name ?? v.name ?? "")}</small>}
                              </Link>
                              <Pill tone={status === "api_ready" || status === "verified" ? "green" : status === "blocked" || status === "error" ? "red" : "amber"}>
                                {GROUP_STATUS[status] ?? status.replace(/_/g, " ")}
                              </Pill>
                              <button
                                className="ig-small"
                                disabled={busy !== null || !canWork}
                                title={canWork ? undefined : NEED_REASON.operate}
                                onClick={() =>
                                  run(`group-${v.id}`, () => verifyGroup(v), (r) =>
                                    r?.manual_only
                                      ? tr("text075", name)
                                      : tr("text076", name),
                                  )
                                }
                              >
                                {busy === `group-${v.id}` ? tr("text050") : tr("text077")}
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <p className="ig-note">
                          {tr("text078")}<Link to="/crm">Carrier CRM</Link>.
                        </p>
                      )}
                    </div>
                  )}
                </section>

                {/* Gmail */}
                <section className={`card ig-card${g.state === "down" ? " ig-down" : ""}`}>
                  <div className="ig-head">
                    <h2>Gmail</h2>
                    <Pill tone={HEALTH_TONE[g.state]}>{stateLabel()[g.state]}</Pill>
                  </div>
                  {g.state !== "ok" && <p className="ig-alert">{g.detail}</p>}
                  <div className="ig-facts two">
                    <Fact label={tr("text081")} value={mailbox?.mailbox_email ?? gmail.data?.allowed_sender ?? "—"} />
                    <Fact label={tr("senderIdentity")} value={mailbox?.sender_name || tr("senderNotConfigured")} />
                    <Fact label={tr("text082")} value={mailbox?.status ? MAILBOX_STATUS[mailbox.status] ?? mailbox.status : "—"} />
                    <Fact label="Token OAuth" value={mailbox?.status === "connected" ? tr("text083") : "—"} configured={mailbox?.status === "connected"} />
                    <Fact label={tr("text084")} value={accessTokenAge(mailbox?.token_expires_at)} />
                    <Fact label={tr("text085")} value={mailbox?.bounces_synced_at ? when(mailbox.bounces_synced_at) : tr("text086")} />
                    <Fact label={tr("text087")} value={mailbox?.last_error ?? tr("text088")} />
                  </div>
                  <p className="ig-note">
                    {tr("text089")}{g.state === "ok"
                      ? tr("text090")
                      : tr("text091")}
                  </p>
                  <GmailConnectionCheck blocked={busy !== null || gmail.loading || Boolean(gmail.error)} revision={mailbox?.updated_at ?? ""} onPendingChange={setGmailCheckBusy}/>
                  <div className="ig-actions">
                    <button className={g.state === "ok" ? undefined : "primary"} disabled={busy !== null || gmailCheckBusy} {...operateOnly} onClick={() => connect("gmail")}>
                      {busy === "gmail" ? tr("text092") : g.state === "down" ? tr("text093") : tr("text094")}
                    </button>
                    <button
                      disabled={busy !== null || gmailCheckBusy || g.state === "down"}
                      {...operateOnly}
                      onClick={() =>
                        run("bounces", syncGmailBounces, (r) => {
                          return tr("text095", r?.scanned ?? 0, r?.detected ?? 0, r?.blocked ?? 0);
                        })
                      }
                    >
                      {busy === "bounces" ? tr("text044") : tr("text096")}
                    </button>
                    <Link to="/crm/rebotes" className="btn">
                      {tr("text097")}</Link>
                    <div className="spacer" />
                    {mailbox?.status === "connected" && (
                      <button
                        disabled={busy !== null || gmailCheckBusy}
                        {...adminOnly}
                        onClick={async () => {
                          if (
                            !(await confirmAsync(
                              tr("text098") +
                                tr("text099"),
                            ))
                          )
                            return;
                          run("gmail-off", disconnectGmail, () => tr("text100"));
                        }}
                      >
                        {tr("text101")}</button>
                    )}
                  </div>
                </section>

                {/* Google Chat: added after the wireframe; the team's mirror of the Bid Room. */}
                <section className={`card ig-card ig-wide${c.state === "down" ? " ig-down" : ""}`}>
                  <div className="ig-head">
                    <h2>Google Chat</h2>
                    <Pill tone={HEALTH_TONE[c.state]}>{stateLabel()[c.state]}</Pill>
                  </div>
                  {chat.error && <ErrorBanner message={chat.error} />}
                  {c.state !== "ok" && <p className="ig-alert">{c.detail}</p>}
                  <div className="ig-facts">
                    <Fact label={tr("text102")} value={chat.data?.account ?? "—"} />
                    <Fact label={tr("text103")} value={chatRow?.default_space_display_name ?? chatRow?.default_space_name ?? tr("text104")} />
                    <Fact label={tr("text105")} value={chatRow?.connected ? (chatRow.inbound_enabled ? tr("text106") : "no") : "—"} />
                    <Fact label={tr("text087")} value={chatRow?.last_error ?? tr("text088")} />
                  </div>
                  {c.state === "ok" && <p className="ig-note">{c.detail}</p>}

                  {spaces && (
                    <div className="row" style={{ marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <label className="field" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
                        <span>{tr("text107")}</span>
                        <select value={space} onChange={(e) => setSpace(e.target.value)}>
                          <option value="">{tr("text108")}</option>
                          {spaces.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.display_name || s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        disabled={busy !== null || !space || space === chatRow?.default_space_name}
                        onClick={() =>
                          run("space", () => saveGoogleChatSpace(space), () => tr("text109"))
                        }
                      >
                        {tr("text110")}</button>
                    </div>
                  )}

                  <div className="ig-actions">
                    <button className={c.state === "down" ? "primary" : undefined} disabled={busy !== null} {...operateOnly} onClick={() => connect("chat")}>
                      {busy === "chat" ? tr("text092") : chatRow?.connected ? tr("text111") : tr("text112")}
                    </button>
                    {chatRow?.connected && !spaces && (
                      <button disabled={busy !== null} {...operateOnly} onClick={loadSpaces}>
                        {busy === "spaces" ? tr("text033") : tr("text113")}
                      </button>
                    )}
                    {chatRow?.connected && (
                      <button
                        disabled={busy !== null}
                        {...operateOnly}
                        onClick={() =>
                          run("retry", retryGoogleChatSync, (r) =>
                            r?.attempted
                              ? tr("text114", r.attempted, r.synced ?? 0, r.failed ?? 0, r.skipped ? tr("text115", r.skipped) : "")
                              : tr("text116"),
                          )
                        }
                      >
                        {busy === "retry" ? tr("text117") : tr("text118")}
                      </button>
                    )}
                    <div className="spacer" />
                    {chatRow?.connected && (
                      <button
                        disabled={busy !== null}
                        {...adminOnly}
                        onClick={async () => {
                          if (
                            !(await confirmAsync(
                              tr("text119") +
                                tr("text120"),
                            ))
                          )
                            return;
                          run("chat-off", disconnectGoogleChat, () => tr("text121"));
                        }}
                      >
                        {tr("text101")}</button>
                    )}
                  </div>
                  <p className="ig-note">
                    <b>{tr("text122")}</b> {tr("text123")}</p>
                </section>
              </div>

              <div className="ig-gate">
                <Pill tone="orange">{tr("text124")}</Pill>
                <span>
                  {tr("text125")}</span>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
