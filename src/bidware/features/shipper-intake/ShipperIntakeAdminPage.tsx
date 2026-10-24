import { words, tr } from "@/i18n/shipper-intake";
import { useLang, locale } from "@/i18n/language";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, InfoBanner, Kpis, Pill, Spinner, TopBar } from "@/components/ui";
import { ShipperPicker } from "@/components/ShipperPicker";
import type { ShipperOption } from "@/features/quotedesk/quotedesk.service";
import {
  awaitsTeam,
  createQuoteFromRequest,
  createShipperProject,
  isIntake,
  launchShipperProject,
  listShipperProjects,
  projectQuote,
  responded,
  RFX_PROJECT_TYPES,
  shipperLink,
  type RfxProject,
  type RfxProjectType,
} from "./intake.service";

const isSpot = (project: RfxProject) => String(project.opportunity_type || "spot") === "spot";
const promoted = (project: RfxProject) => Boolean(project.bid_room_event_id || projectQuote(project));

type Stage = "new" | "filling" | "sent" | "promoted";

/** Where a shipper's request stands, as the wireframe names it. */
function stageOf(project: RfxProject): Stage {
  if (promoted(project)) return "promoted";
  if (responded(project)) return "new";
  if (project.rfi_status === "draft" || project.rfi_status === "reopened" || project.status === "rfi_in_progress") {
    return "filling";
  }
  return "sent";
}

const STAGE: Record<Stage, { label: string; tone: "" | "green" | "amber" | "orange"; order: number }> = {
  new: { get label() { return tr("text001"); }, tone: "orange", order: 0 },
  filling: { get label() { return tr("text002"); }, tone: "amber", order: 1 },
  sent: { get label() { return tr("text003"); }, tone: "", order: 2 },
  promoted: { get label() { return tr("text004"); }, tone: "green", order: 3 },
};

/**
 * The request kinds the wireframe offers: spot, mini-bid (rateware's
 * "contract") and program. The rarer RFQ kinds sit behind "Otro".
 */
const KINDS = [
  { key: "spot", label: "Spot", get hint() { return tr("text005"); } },
  { key: "contract", label: "Mini-bid", get hint() { return tr("text006"); } },
  { key: "program", get label() { return tr("text007"); }, get hint() { return tr("text008"); } },
  { key: "other", get label() { return tr("text009"); }, get hint() { return tr("text010"); } },
] as const;
const OTHER_TYPES = RFX_PROJECT_TYPES.filter((option) => !["spot", "contract", "program"].includes(option.value));
/** The request kind in a table cell. */
const typeLabel = (type: string) => RFX_PROJECT_TYPES.find((o) => o.value === type)?.label ?? type;
const typeTitle = (type: string) =>
  type === "contract" ? tr("text011") : RFX_PROJECT_TYPES.find((o) => o.value === type)?.label ?? type;

/** "Hoy 09:12", "Ayer", "20 sep"; without the time, "hoy". */
function when(value: string | null | undefined, withTime = true): string {
  const at = new Date(String(value ?? ""));
  if (Number.isNaN(at.getTime())) return "—";
  const today = new Date();
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) {
    return withTime ? tr("text012", at.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })) : tr("text013");
  }
  if (days === 1) return tr("text014");
  return at.toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

/**
 * Shipper intake (wireframe 02): open a request for a CRM shipper and share
 * its private link. A spot request becomes a QuoteDesk quote; an RFQ becomes
 * a Bid Room event. Either way, nothing is sent to carriers from here.
 */
export function ShipperIntakeAdminPage() {
  const { user, role } = useAuth();
  return <ShipperIntakeContent key={`${user?.id ?? "anonymous"}:${role ?? "pending"}`} />;
}

function ShipperIntakeContent() {
  useLang();
  const { can, roleLoaded } = useAuth();
  const active = useRef(true);
  const allowed = useRef(false);
  const pending = useRef(false);
  const canOperate = roleLoaded && can("operate");
  allowed.current = canOperate;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = () => active.current && allowed.current;
  const navigate = useNavigate();
  const [shipper, setShipper] = useState<ShipperOption | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("spot");
  const [otherType, setOtherType] = useState<RfxProjectType>("dedicated");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ shipper: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // A new key clears the picker's own search once a link is out.
  const [pickerKey, setPickerKey] = useState(0);
  const form = useRef<HTMLElement>(null);

  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: string; text: string; link?: string; eventId?: string } | null>(null);

  const projects = useAsync(() => listShipperProjects(() => active.current), []);
  const rows = useMemo(
    () =>
      (projects.data ?? [])
        .filter(isIntake)
        .sort(
          (a, b) =>
            STAGE[stageOf(a)].order - STAGE[stageOf(b)].order ||
            String(b.updated_at).localeCompare(String(a.updated_at)),
        ),
    [projects.data],
  );
  const kpis = useMemo(() => {
    const promotedCount = rows.filter(promoted).length;
    return {
      active: rows.filter((p) => ["sent", "filling"].includes(stageOf(p))).length,
      fresh: rows.filter(awaitsTeam).length,
      promoted: promotedCount,
      conversion: rows.length ? `${Math.round((promotedCount / rows.length) * 100)}%` : "—",
    };
  }, [rows]);

  const crmContact = {
    name: shipper?.primary_contact_name ?? "",
    email: shipper?.primary_contact_email ?? "",
  };

  function pickShipper(next: ShipperOption | null) {
    setShipper(next);
    setContactName(next?.primary_contact_name ?? "");
    setContactEmail(next?.primary_contact_email ?? "");
  }

  /** "Nuevo magic link": a clean form, ready to search the next shipper. */
  function startOver() {
    pickShipper(null);
    setPickerKey((k) => k + 1);
    setFresh(null);
    setErr(null);
    setDueDate("");
    form.current?.scrollIntoView({ block: "nearest" });
    window.setTimeout(() => form.current?.querySelector<HTMLInputElement>("input")?.focus(), 50);
  }

  async function generate() {
    if (!shipper || !current() || pending.current) return;
    pending.current = true;
    setBusy(true);
    setErr(null);
    setFresh(null);
    setCopied(false);
    try {
      const name = shipper.shipper_name || shipper.legal_name || "Shipper";
      const project = await createShipperProject({
        shipperId: shipper.id,
        shipperName: name,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        type: kind === "other" ? otherType : kind,
        dueDate,
      });
      if (!current()) return;
      const { link } = await shipperLink(project.id);
      if (!current()) return;
      if (!link) throw new Error(tr("text015"));
      setFresh({ shipper: name, link });
      pickShipper(null);
      setPickerKey((k) => k + 1);
      setDueDate("");
      projects.reload();
    } catch (e) {
      if (current()) setErr((e as Error).message);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function withLink(project: RfxProject, open: boolean) {
    if (!current() || pending.current) return;
    pending.current = true;
    // Opened before the await: Safari blocks windows opened after one.
    const tab = open ? window.open("", "_blank") : null;
    setRowBusy(project.id);
    setRowMsg(null);
    try {
      const { link, message } = await shipperLink(project.id);
      if (!current()) { tab?.close(); return; }
      if (!link) {
        tab?.close();
        setRowMsg({ id: project.id, text: message || tr("text016") });
      } else if (open) {
        if (tab) {
          tab.opener = null;
          tab.location.href = link;
        } else {
          window.location.assign(link);
        }
      } else {
        await navigator.clipboard?.writeText(link).catch(() => undefined);
        setRowMsg({ id: project.id, text: tr("text017"), link });
      }
    } catch (e) {
      tab?.close();
      if (current()) setRowMsg({ id: project.id, text: (e as Error).message });
    } finally {
      pending.current = false;
      if (active.current) setRowBusy(null);
    }
  }

  async function toQuote(project: RfxProject) {
    if (!current() || pending.current) return;
    pending.current = true;
    setRowBusy(project.id);
    setRowMsg(null);
    try {
      const quote = await createQuoteFromRequest(project, current);
      if (!current()) return;
      navigate(`/quotedesk/${quote.id}`);
    } catch (e) {
      if (!current()) return;
      setRowMsg({ id: project.id, text: (e as Error).message });
      setRowBusy(null);
      // A quote may exist by now; the reloaded row links to it instead of offering a second.
      projects.reload();
    } finally {
      pending.current = false;
      if (active.current) setRowBusy(null);
    }
  }

  async function toEvent(project: RfxProject) {
    if (!current() || pending.current) return;
    pending.current = true;
    setRowBusy(project.id);
    setRowMsg(null);
    try {
      const eventId = await launchShipperProject(project.id);
      if (!current()) return;
      setRowMsg({ id: project.id, text: tr("text018"), eventId });
      projects.reload();
    } catch (e) {
      if (current()) setRowMsg({ id: project.id, text: (e as Error).message });
    } finally {
      pending.current = false;
      if (active.current) setRowBusy(null);
    }
  }

  return (
    <>
      <TopBar
        title="Shipper intake"
        actions={
          <button className="primary" onClick={startOver}>
            {tr("text019")}</button>
        }
      />
      <main className="main intake">
        <Kpis
          items={[
            { label: tr("text020"), value: kpis.active },
            { label: tr("text021"), value: kpis.fresh, accent: true },
            { label: tr("text022"), value: kpis.promoted },
            { label: tr("text023"), value: kpis.conversion },
          ]}
        />

        <div className="intake-cols">
          <section className="intake-form" ref={form}>
            <h2>{tr("text024")}</h2>

            <div className="intake-field">
              <span>{tr("text025")}</span>
              <ShipperPicker key={pickerKey} value={shipper} onChange={pickShipper} appearance="card" />
              <a className="intake-create" href="/shippers" target="_blank" rel="noreferrer">
                {tr("text026")}</a>
            </div>

            <div className="intake-field">
              <span>{tr("text027")}{shipper ? tr("text028") : ""}</span>
              <div className="intake-contact">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={tr("text029")} />
                <input
                  type="email"
                  className="mono"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder={words("word0")}
                />
              </div>
              {shipper && contactEmail && contactEmail === crmContact.email && contactName === crmContact.name && (
                <em className="intake-auto">{tr("text030")}</em>
              )}
            </div>

            <div className="intake-field">
              <span>{tr("text031")}</span>
              <div className="intake-segmented" role="radiogroup">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    role="radio"
                    aria-checked={kind === k.key}
                    className={kind === k.key ? "on" : undefined}
                    title={k.hint}
                    onClick={() => setKind(k.key)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              {kind === "other" && (
                <select value={otherType} onChange={(e) => setOtherType(e.target.value as RfxProjectType)}>
                  {OTHER_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <em className="intake-auto">{KINDS.find((k) => k.key === kind)?.hint}</em>
            </div>

            <label className="intake-field">
              <span>{tr("text032")}</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>

            {err && <ErrorBanner message={err} />}
            <button className="primary intake-go" disabled={!canOperate || busy || rowBusy !== null || !shipper} onClick={generate}>
              {busy ? tr("text033") : tr("text034")}
            </button>

            {fresh && (
              <div className="intake-fresh">
                <b>{tr("text035")}{fresh.shipper} (Shipper CRM)</b>
                <div>
                  <span className="mono">{fresh.link}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(fresh.link).catch(() => undefined);
                      setCopied(true);
                    }}
                  >
                    {copied ? tr("text036") : tr("text037")}
                  </button>
                  <a className="btn" href={fresh.link} target="_blank" rel="noopener">
                    {tr("text038")}</a>
                </div>
                <em>{tr("text039")}</em>
              </div>
            )}

            <details className="intake-how">
              <summary>{tr("text040")}</summary>
              <p>
                <b>Spot:</b>{tr("text041")}</p>
              <p>
                <b>RFQ:</b>{tr("text042")}</p>
              <p>{tr("text043")}</p>
            </details>
          </section>

          <section className="intake-drafts">
            <header>
              <h2>{tr("text044")}</h2>
              <p>
                {tr("text045")}</p>
            </header>
            {projects.loading && <Spinner label={tr("text046")} />}
            {projects.error && <ErrorBanner message={projects.error} />}
            {!projects.loading &&
              !projects.error &&
              (rows.length ? (
                <table className="data intake-table">
                  <thead>
                    <tr>
                      <th>{tr("text047")}</th>
                      <th>{tr("text048")}</th>
                      <th>Lanes</th>
                      <th>{tr("text049")}</th>
                      <th>{tr("text050")}</th>
                      <th>{tr("text051")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((project) => {
                      const stage = stageOf(project);
                      const spot = isSpot(project);
                      const quote = projectQuote(project);
                      const came = responded(project) || stage === "promoted";
                      return (
                        <tr key={project.id}>
                          <td>
                            <div className="cell-title">{project.customer_name || project.title}</div>
                            {project.customer_contact_email && <div className="cell-sub">{project.customer_contact_email}</div>}
                            {rowMsg?.id === project.id && (
                              <div className="intake-rowmsg">
                                <InfoBanner>
                                  {rowMsg.text}
                                  {rowMsg.eventId && (
                                    <>
                                      {" "}
                                      <Link to={`/rfx/${rowMsg.eventId}`}>{tr("text052")}</Link>
                                    </>
                                  )}
                                  {/* Shown as well: the browser may block the clipboard. */}
                                  {rowMsg.link && <div className="mono intake-link">{rowMsg.link}</div>}
                                </InfoBanner>
                              </div>
                            )}
                          </td>
                          <td title={typeTitle(project.opportunity_type)}>{typeLabel(project.opportunity_type)}</td>
                          <td className="mono">{project.lane_count || "—"}</td>
                          <td className={came ? undefined : "intake-muted"} title={came ? undefined : tr("text053")}>
                            {came ? when(project.updated_at) : tr("text054", when(project.created_at, false).toLowerCase())}
                          </td>
                          <td>
                            <Pill tone={STAGE[stage].tone}>{STAGE[stage].label}</Pill>
                          </td>
                          <td className="intake-act">
                            {project.bid_room_event_id ? (
                              <Link to={`/rfx/${project.bid_room_event_id}`}>{tr("text055")}{project.bid_room_rfx_id || ""}</Link>
                            ) : quote ? (
                              <Link to={`/quotedesk/${quote.id}`}>{tr("text056")}{quote.folio}</Link>
                            ) : stage === "new" ? (
                              <button
                                className="ne-link"
                                disabled={!canOperate || rowBusy !== null}
                                onClick={() => (spot ? toQuote(project) : toEvent(project))}
                              >
                                {spot ? tr("text057") : tr("text058")}
                              </button>
                            ) : (
                              // Once answered, a new link would only reopen the request as "Liga enviada".
                              <>
                                <button className="ne-link" disabled={!canOperate || rowBusy !== null} onClick={() => withLink(project, false)}>
                                  {tr("text059")}</button>
                                <button className="ne-link" disabled={!canOperate || rowBusy !== null} onClick={() => withLink(project, true)}>
                                  {tr("text038")}</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <Empty title={tr("text060")} hint={tr("text061")} />
              ))}
          </section>
        </div>
      </main>
    </>
  );
}
