import { tr } from "@/i18n/rfx-admin";
import { useLang, getLang } from "@/i18n/language";
import { confirmAsync } from "@/components/confirm";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { ErrorBanner, InfoBanner, Pill, Spinner } from "@/components/ui";
import { LaunchHeader } from "@/features/outreach/LaunchShell";
import { fetchRfxDetail } from "./rfx.service";
import type { LaneWithInvitations } from "./stages";
import {
  generateAwardNotices,
  isVoidLane,
  newOperationId,
  noticeAudience,
  noticeCopy,
  noticeLanguage,
  type NoticeGroup,
  type NoticesResult,
} from "./award.service";

const GROUPS: { key: NoticeGroup; label: string; tone: "green" | "indigo" | "" }[] = [
  { key: "primary", get label() { return tr("text001"); }, tone: "green" },
  { key: "backup", get label() { return tr("text002"); }, tone: "indigo" },
  { key: "not_awarded", get label() { return tr("text003"); }, tone: "" },
  // Only when some carrier took part in void lanes alone: nobody else won them.
  { key: "no_award", get label() { return tr("text004"); }, tone: "" },
];

/**
 * Award notices (wireframe 29): everyone who took part hears back, not only
 * the winner. A carrier who invested time and never heard what happened does
 * not quote again. The previews are the handler's own words; generating only
 * drafts them into the Delivery queue, behind the same human gate.
 */
export function AwardNoticesPage() {
  useLang();
  const { id = "" } = useParams();
  const { can } = useAuth();
  // Preparing the notices is an Administrador's decision, like awarding.
  const decides = can("admin");
  const adminOnly = decides ? undefined : NEED_REASON.admin;

  const detail = useAsync(() => fetchRfxDetail(id), [id]);
  const event = detail.data?.event;
  const lanes = useMemo(() => (detail.data?.lanes ?? []) as LaneWithInvitations[], [getLang(), detail.data]);
  const audience = useMemo(() => noticeAudience(lanes), [getLang(), lanes]);
  const language = noticeLanguage(event as Record<string, unknown> | undefined);
  const rfxKey = String(event?.rfx_id || event?.name || "Bid Room");

  const inGroup = (g: NoticeGroup) => audience.filter((r) => r.group === g);
  const reachable = audience.filter((r) => r.email).length;
  const noEmail = audience.length - reachable;
  const uncovered = lanes.filter((l) => {
    if (isVoidLane(l)) return false;
    const offers = (l.invitations ?? []).filter((i) => i.bid_rate != null);
    return offers.length > 0 && !offers.some((o) => String(o.award_role ?? "").toLowerCase() === "primary");
  }).length;
  const unawarded = inGroup("not_awarded").length + inGroup("no_award").length;

  const [operationId, setOperationId] = useState(() => newOperationId());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NoticesResult | null>(null);

  async function generate() {
    const primary = inGroup("primary").filter((r) => r.email).length;
    const backup = inGroup("backup").filter((r) => r.email).length;
    const rest = [...inGroup("not_awarded"), ...inGroup("no_award")].filter((r) => r.email).length;
    if (
      !await confirmAsync(
        tr("text005", reachable, primary, backup, rest) +
          (uncovered ? tr("text006", uncovered) : "") +
          tr("text007"),
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await generateAwardNotices(id, operationId);
      setResult(res);
      setOperationId(newOperationId());
    } catch (e) {
      // The same id stays: retrying re-reads the same operation instead of drafting twice.
      setError(tr("text008", (e as Error).message, operationId.slice(0, 8)));
    } finally {
      setBusy(false);
    }
  }

  const drafted = result ? (result.created ?? 0) + (result.refreshed ?? 0) : null;

  return (
    <>
      <LaunchHeader
        eventId={id}
        event={event}
        title={tr("text009")}
        tags={<Pill tone="indigo">CLOSE</Pill>}
        info={tr("text010", audience.length, audience.length === 1 ? "" : "s")}
        actions={
          <Link to={`/rfx/${id}`} className="btn">
            {tr("text011")}</Link>
        }
      />
      <main className="main launch-main">
        <p className="rev-intro">
          {tr("text012")}</p>
        <div className="rev-contract">
          <Pill tone="amber">{tr("text013")}</Pill>
          <span className="mono">
            {tr("text014")}</span>
        </div>

        {detail.error && <ErrorBanner message={detail.error} />}
        {error && <ErrorBanner message={error} />}
        {!decides && (
          <InfoBanner title={tr("text015")}>{tr("text016")}</InfoBanner>
        )}

        <div className="rev-kpis">
          {[
            { label: tr("text017"), value: audience.filter((r) => r.quoted).length },
            { label: tr("text018"), value: inGroup("primary").length, accent: true },
            { label: tr("text019"), value: inGroup("backup").length },
            { label: tr("text020"), value: unawarded },
            { label: tr("text021"), value: noEmail },
          ].map((k) => (
            <div key={k.label}>
              <span>{k.label}</span>
              <strong className={k.accent ? "accent" : undefined}>{detail.loading ? "…" : k.value}</strong>
            </div>
          ))}
        </div>

        {detail.loading ? (
          <Spinner label={tr("text022")} />
        ) : (
          <>
            <p className="an-lang">
              {tr("text023")}<b>{language === "es" ? tr("text024") : tr("text025")}</b> {tr("text026")}</p>
            <div className="an-grid">
              {GROUPS.filter((g) => g.key !== "no_award" || inGroup(g.key).length).map((g) => {
                const people = inGroup(g.key);
                const copy = noticeCopy(g.key, language, rfxKey);
                const quotedOnly = people.filter((p) => p.quoted).length;
                const missing = people.filter((p) => !p.email).length;
                return (
                  <section key={g.key} className="an-card">
                    <header>
                      <Pill tone={g.tone}>{g.label}</Pill>
                      <span>
                        {people.length} carrier{people.length === 1 ? "" : "s"}
                        {(g.key === "not_awarded" || g.key === "no_award") && people.length > quotedOnly
                          ? tr("text027", quotedOnly, people.length - quotedOnly)
                          : ""}
                      </span>
                    </header>
                    <div className="an-body">
                      <span className="an-label">{tr("text028")}</span>
                      <b className="an-subject">{copy.subject}</b>
                      <hr />
                      <span className="an-status">{copy.label}</span>
                      <b>{copy.headline}</b>
                      <p>{copy.intro}</p>
                      <p className="an-table">{tr("text029")}</p>
                      <span className="an-cta">{copy.cta}</span>
                      {copy.call && <span className="an-cta ghost">{copy.call}</span>}
                      <p>{copy.next}</p>
                    </div>
                    <footer>
                      <span className="mono">{tr("text030")}</span>
                      <span className={missing ? "an-missing" : undefined}>
                        {missing ? tr("text031", missing) : tr("text032")}
                      </span>
                    </footer>
                  </section>
                );
              })}
            </div>

            <section className="an-gate">
              <header>
                <span className="crm-kicker">{tr("text033")}</span>
                {drafted != null && <Pill tone="indigo">{drafted} {tr("text034")}</Pill>}
              </header>
              <p>
                {tr("text035")}</p>
              {result && (
                <p className="an-result">
                  {result.created ?? 0} {tr("text036")}{result.refreshed ?? 0} {tr("text037")}{result.preserved ? tr("text038", result.preserved) : ""}
                  {result.skipped?.length
                    ? tr("text039", result.skipped.length)
                    : ""}
                </p>
              )}
              <div className="an-go">
                <span className={uncovered ? "an-warn" : undefined}>
                  {uncovered
                    ? tr("text040", uncovered, uncovered === 1 ? tr("text041") : tr("text042"))
                    : lanes.some(isVoidLane)
                      ? tr("text043")
                      : tr("text044")}
                </span>
                <button className="primary" disabled={!decides || !reachable || busy} title={adminOnly} onClick={generate}>
                  {busy ? tr("text045") : tr("text046", reachable, reachable === 1 ? "" : "es")}
                </button>
                <Link to={`/rfx/${id}/delivery`} className="btn">
                  {tr("text047")}</Link>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
