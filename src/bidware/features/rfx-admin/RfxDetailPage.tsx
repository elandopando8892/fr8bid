import { offerText } from "@/i18n/offer-detail";
import { tr } from "@/i18n/rfx-admin";
import { useLang, getLang } from "@/i18n/language";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchRfxDetail,
  inviteRfxLaneVendors,
  updateRfxEvent,
  archiveRfxEvent,
  deleteRfxEvent,
  rejectRfxBid,
} from "./rfx.service";
import { confirmAsync, promptAsync } from "@/components/confirm";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import {
  stagesOf,
  activeStage,
  statsOf,
  isAwaitingSend,
  isContacted,
  type StageKey,
  type LaneWithInvitations,
} from "./stages";
import { listEventConfirmations } from "./confirmations.service";
import { StageRail, GatePanel, GateStrip } from "./StageRail";
import { BuildStage } from "./BuildStage";
import { OperateStage } from "./OperateStage";
import { CloseStage } from "./CloseStage";
import { fxOf } from "./operate";
import { LaneEditDialog, ManualBidDialog, QuestionDialog } from "./OperateDialogs";
import { useAsync } from "@/components/useAsync";
import { eventOrigins } from "@/features/quotedesk/quotedesk.service";
import { Spinner, ErrorBanner, InfoBanner, StatusPill, OriginPill, Pill, dateShort } from "@/components/ui";

/** invite_rfx_lane_vendors takes at most this many ids per call. */
const INVITE_BATCH = 1000;

/**
 * The event workbench. One surface where an event moves Build -> Launch ->
 * Operate -> Close, instead of a sidebar of pages the operator has to sequence
 * from memory.
 */
export function RfxDetailPage() {
  useLang();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  // Archiving, restoring and deleting are an Administrador's.
  const { can } = useAuth();
  const { data, loading, error, reload } = useAsync(() => fetchRfxDetail(id), [id]);
  // The origin tag (magic link, QuoteDesk, manual), as the event list shows it.
  const origin = useAsync(() => eventOrigins([id]), [id]);
  // What each carrier answered to the rubros; reread with the event so it follows the offers.
  const confirmations = useAsync(() => listEventConfirmations(id), [id, data]);
  // Only the first load blanks the page. A reload after an action keeps the
  // stage mounted, or it would drop the stage's own confirmation messages.
  const firstLoad = loading && !data;
  const [picked, setPicked] = useState<StageKey | null>(null);
  const [questionMessage, setQuestionMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const [dialog, setDialog] = useState<{
    kind: "bid" | "question" | "lane";
    lane?: LaneWithInvitations;
    invitation?: Record<string, unknown>;
  } | null>(null);
  const canWork = can("operate");

  const event = data?.event;
  const lanes = (data?.lanes ?? []) as LaneWithInvitations[];

  const stages = useMemo(() => stagesOf(event, lanes), [getLang(), event, lanes]);
  const stage = picked ?? activeStage(stages);
  const current = stages.find((s) => s.key === stage) ?? stages[0];
  const next = stages[stages.findIndex((s) => s.key === current.key) + 1];
  const stats = useMemo(() => statsOf(lanes), [getLang(), lanes]);
  const fx = useMemo(() => fxOf(data), [getLang(), data]);

  const statusOf = (i: Record<string, unknown>) =>
    String(i.invitation_status ?? "").toLowerCase();

  /** Carriers added from Carrier Fit wait as "drafted" until someone authorizes them. */
  const drafts = useMemo(
    () =>
      lanes.flatMap((lane) =>
        (lane.invitations ?? []).filter((i) => ["drafted", ""].includes(statusOf(i))).map((i) => String(i.id)),
      ),
    [getLang(), lanes],
  );

  /**
   * Authorizes draft invitations. invite_rfx_lane_vendors takes the
   * invitations' own ids (rfx_lane_vendors), not the lane's: sent a lane id
   * it finds nothing and answers "0 updated".
   */
  async function invite(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setNotice(null);
    try {
      let updated = 0;
      for (let at = 0; at < ids.length; at += INVITE_BATCH) {
        const res = (await inviteRfxLaneVendors(ids.slice(at, at + INVITE_BATCH))) as { updated?: number };
        updated += res?.updated ?? 0;
      }
      setNotice(
        updated
          ? tr("text681", updated)
          : tr("text682"),
      );
      reload();
    } catch (err) {
      setNotice(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** Every lane's drafts at once (wireframe 03), after saying what it does and doesn't do. */
  async function inviteAll() {
    const withDrafts = lanes.filter((lane) =>
      (lane.invitations ?? []).some((i) => ["drafted", ""].includes(statusOf(i))),
    ).length;
    const ok = await confirmAsync(
      tr("text683", drafts.length, withDrafts) +
        tr("text684"),
    );
    if (ok) await invite(drafts);
  }

  /**
   * Opens the Bid Room: the event goes from draft to open, so it shows on the
   * public board and among the open lanes other carriers see (2026-09-29).
   * Launching from Bidware opens it; this is for events left in draft.
   */
  async function openRoom() {
    const ok = await confirmAsync(
      tr("text685") +
        tr("text686") +
        tr("text687"),
      { ok: tr("text688") },
    );
    if (!ok) return;
    setBusy(true);
    setNotice(null);
    try {
      await updateRfxEvent(id, { status: "open" });
      setNotice(tr("text689"));
      reload();
    } catch (err) {
      setNotice(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Declines a carrier's bid. The reason stays with the team, in the event's
   * history and the audit log; the carrier never reads it (rateware #164).
   */
  async function reject(invitation: Record<string, unknown>) {
    const vendor = (invitation.vendors ?? {}) as Record<string, unknown>;
    const name = String(vendor.vendor_name ?? invitation.vendor_id ?? tr("text690"));
    const reason = await promptAsync(
      tr("text691", name),
      "",
    );
    if (reason === null) return;
    setBusy(true);
    setNotice(null);
    try {
      await rejectRfxBid(String(invitation.id), reason.trim() || tr("text692"));
      setNotice(tr("text693", name));
      reload();
    } catch (err) {
      setNotice(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const done = (message: string) => {
    setDialog(null);
    setNotice(message);
    reload();
  };

  const status = String(event?.status ?? "").toLowerCase();
  const archived = status === "archived";
  // Administrative status stays open until Close; the carrier's bid window
  // ends at the server's Mexico City deadline independently of that status.
  const bidDeadline = event?.due_date
    ? Date.parse(`${String(event.due_date).slice(0, 10)}T23:59:59-06:00`)
    : NaN;
  const biddingExpired = status === "open" && Number.isFinite(bidDeadline) && bidDeadline < clock;
  useEffect(() => {
    const refreshClock = () => setClock(Date.now());
    let timer: number | undefined;
    const schedule = () => {
      const remaining = bidDeadline - Date.now() + 1;
      if (status === "open" && Number.isFinite(remaining) && remaining > 0) {
        timer = window.setTimeout(() => {
          refreshClock();
          schedule();
        }, Math.min(remaining, 2_147_483_647));
      }
    };
    document.addEventListener("visibilitychange", refreshClock);
    refreshClock();
    schedule();
    return () => {
      document.removeEventListener("visibilitychange", refreshClock);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [bidDeadline, status]);
  // The draft wizard edits drafts and open events; a closed one is read here.
  const editable = ["draft", "open"].includes(status);

  /**
   * Archiving only hides the event from the active lists; lanes, offers and
   * drafts stay as they are. It does NOT close the event — closing is what
   * hands awards to rateware, and that lives in the Close stage.
   */
  async function toggleArchived() {
    const ok = await confirmAsync(
      archived
        ? tr("text694")
        : tr("text695") +
            tr("text696"),
    );
    if (!ok) return;
    setBusy(true);
    setNotice(null);
    try {
      if (archived) await updateRfxEvent(id, { status: "draft" });
      else await archiveRfxEvent(id);
      setNotice(archived ? tr("text697") : tr("text698"));
      reload();
    } catch (err) {
      setNotice(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Deleting is for good, so it states what goes with the event and asks for
   * the event's code typed out, as rateware did. Archiving is the reversible way.
   */
  async function removeEvent() {
    const code = String(event?.rfx_id || event?.name || "").trim();
    const invitations = lanes.flatMap((lane) => lane.invitations ?? []);
    const withOffer = invitations.filter((i) => i.bid_rate != null).length;
    const awarded = invitations.filter((i) =>
      ["primary", "backup"].includes(String(i.award_role ?? "").toLowerCase()),
    ).length;
    const typed = await promptAsync(
      tr("text699") +
        tr("text700", lanes.length, invitations.length) +
        (withOffer ? tr("text701", withOffer) : "") +
        (awarded ? tr("text702", awarded) : "") +
        tr("text703") +
        tr("text704") +
        tr("text705") +
        tr("text706") +
        tr("text707", code),
    );
    if (typed == null) return;
    if (!code || typed.trim().toLowerCase() !== code.toLowerCase()) {
      setNotice(tr("text708", code));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await deleteRfxEvent(id);
      navigate("/rfx", { replace: true });
    } catch (err) {
      const message = (err as Error).message;
      setNotice(
        /foreign key|23503|shipment/i.test(message)
          ? tr("text709")
          : `Error: ${message}`,
      );
      setBusy(false);
    }
  }

  const eventName = (event?.name as string) || tr("text710");
  const summary = [
    tr("text711", stats.invitations),
    tr("text712", stats.quoted),
    stats.lanes ? tr("text713", stats.awardedLanes, stats.lanes) : null,
    stats.voidLanes ? tr("text714", stats.voidLanes, stats.voidLanes === 1 ? "" : "s") : null,
    event?.due_date
      ? tr(biddingExpired ? "text771" : "text715", dateShort(event.due_date))
      : null,
    event?.operation_start_date ? tr("text716", dateShort(event.operation_start_date)) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /** The stage's own actions, as wireframes 08 (Build) and 03 (Operate) put them. */
  const stageActions =
    stage === "build" ? (
      <>
        {editable && (
          <Link to={`/rfx/new/${id}`} className="btn">
            {tr("text446")}</Link>
        )}
        <button className="primary" onClick={() => setPicked("launch")}>
          {tr("text717")}</button>
      </>
    ) : stage === "operate" ? (
      <>
        <Link to="/board" target="_blank" rel="noreferrer" className="btn">
          {tr("text718")}</Link>
        <button
          className="primary"
          disabled={busy || !canWork || !drafts.length}
          title={
            !canWork
              ? NEED_REASON.operate
              : drafts.length
                ? tr("text719")
                : tr("text720")
          }
          onClick={inviteAll}
        >
          {tr("text721")}{drafts.length ? ` (${drafts.length})` : ""}
        </button>
      </>
    ) : null;

  return (
    <>
      {/* Wireframe 19 · Workbench del evento: who and what the event is, in one block. */}
      <header className="identity rfx-identity">
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div className="crumb">
            <Link to="/rfx">RFx / Bid Room</Link>
            {event ? ` · ${[event.rfx_id, event.customer].filter(Boolean).join(" · ")}` : ""}
          </div>
          <h1 className="ellipsis" title={eventName}>
            {eventName}
          </h1>
          {event && <p className="sub">{summary}</p>}
        </div>
        {event && (
          <div className="identity-side">
            <div className="row identity-meta">
              <Link to={`/rfx/${id}/chat`}>{tr("text229")}</Link>
              <button className="link" onClick={reload}>
                {tr("text232")}</button>
              <button
                className="link"
                disabled={busy || !can("admin")}
                title={can("admin") ? undefined : NEED_REASON.admin}
                onClick={toggleArchived}
              >
                {archived ? tr("text722") : tr("text723")}
              </button>
              <button
                className="link"
                disabled={busy || !can("admin")}
                title={can("admin") ? undefined : NEED_REASON.admin}
                onClick={removeEvent}
              >
                {tr("text724")}</button>
              <OriginPill origin={origin.data?.origins[id] ?? null} folio={origin.data?.folios[id]} />
              {biddingExpired
                ? <Pill tone="green">{tr("text773")}</Pill>
                : <StatusPill status={event.status as string} />}
              {biddingExpired && <Pill tone="amber">{tr("text772")}</Pill>}
            </div>
            {stageActions && <div className="row identity-actions">{stageActions}</div>}
          </div>
        )}
      </header>

      {!firstLoad && !error && <StageRail stages={stages} active={stage} onPick={setPicked} />}

      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          {firstLoad && <Spinner label={tr("text725")} />}
          {error && <ErrorBanner message={error} />}
          {notice && <InfoBanner>{notice}{questionMessage && <p><Link to={`/rfx/${id}/delivery?message=${encodeURIComponent(questionMessage)}`}>{offerText("queue")}</Link></p>}</InfoBanner>}
          {confirmations.error && (
            <ErrorBanner message={tr("text726", confirmations.error)} />
          )}
          {event && status === "draft" && stats.invitations > 0 && (
            <div className="open-room">
              <span>
                <b>{tr("text727")}</b> {tr("text728")}</span>
              <button
                className="primary"
                disabled={busy || !canWork}
                title={canWork ? undefined : NEED_REASON.operate}
                onClick={openRoom}
              >
                {tr("text688")}</button>
            </div>
          )}

          {!firstLoad && !error && data && event && (
            <>
              {/* Build and Operate use the full width (wireframes 08 and 03): their gate is a line. */}
              {stage === "build" && (
                <>
                  <GateStrip stage={current} next={next} />
                  <BuildStage
                    eventId={id}
                    event={event}
                    lanes={lanes}
                    origin={origin.data?.origins[id] ?? null}
                    folio={origin.data?.folios[id]}
                    busy={busy}
                    canWork={canWork}
                    onEditLane={(lane) => setDialog({ kind: "lane", lane })}
                    onAuthorize={invite}
                  />
                </>
              )}

              {stage === "operate" && (
                <>
                  <GateStrip stage={current} next={next} />
                  <OperateStage
                    eventId={id}
                    lanes={lanes}
                    fx={fx}
                    confirmations={confirmations.data ?? []}
                    busy={busy}
                    canWork={canWork}
                    onCapture={() => setDialog({ kind: "bid" })}
                    onAsk={(lane, invitation) => setDialog({ kind: "question", lane, invitation })}
                    onEditBid={(lane, invitation) => setDialog({ kind: "bid", lane, invitation })}
                    onReject={reject}
                    onAward={() => setPicked("close")}
                  />
                </>
              )}

              {stage === "launch" && (
                <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 12 }}>
                    {/* Wireframe 19: the launch work as tabs; each opens its own screen for now. */}
                    <nav className="tabs tab-links">
                      <Link to={`/rfx/${id}/message`}>{tr("text265")}</Link>
                      <Link to={`/rfx/${id}/delivery`}>{tr("text729")}</Link>
                    </nav>
                    <InfoBanner title={tr("text730")}>
                      {tr("text731")}</InfoBanner>
                    {/* Enviadas counts messages that really left; authorizing only clears them to go. */}
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Lane</th>
                          <th title={tr("text732")}>{tr("text733")}</th>
                          <th title={tr("text734")}>{tr("text735")}</th>
                          <th title={tr("text736")}>{tr("text737")}</th>
                          <th>{tr("text738")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lanes.map((lane) => {
                          const inv = lane.invitations ?? [];
                          return (
                            <tr key={lane.id}>
                              <td>
                                {(lane.origin as string) || "—"} →{" "}
                                {(lane.destination as string) || "—"}
                              </td>
                              <td className="mono">
                                {inv.filter((i) => ["drafted", ""].includes(statusOf(i))).length}
                              </td>
                              <td className="mono">{inv.filter(isAwaitingSend).length}</td>
                              <td className="mono">{inv.filter(isContacted).length}</td>
                              <td className="mono">
                                {inv.filter((i) => statusOf(i) === "declined").length}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <GatePanel stage={current} next={next} />
                </div>
              )}

              {/* Close carries its own checklist (wireframe 20). */}
              {stage === "close" && (
                <CloseStage eventId={id} lanes={lanes} confirmations={confirmations.data ?? []} onChanged={reload} />
              )}
            </>
          )}
        </div>
      </main>

      {dialog?.kind === "lane" && dialog.lane && (
        <LaneEditDialog lane={dialog.lane} onClose={() => setDialog(null)} onSaved={done} />
      )}
      {dialog?.kind === "bid" && (
        <ManualBidDialog
          lanes={lanes}
          preset={dialog.lane && dialog.invitation ? { lane: dialog.lane, invitation: dialog.invitation } : undefined}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
      {dialog?.kind === "question" && (
        <QuestionDialog
          eventId={id}
          lanes={lanes}
          preset={dialog.lane && dialog.invitation ? { lane: dialog.lane, invitation: dialog.invitation } : undefined}
          onClose={() => setDialog(null)}
          onSent={(message, messageId) => { setQuestionMessage(messageId || null); done(message); }}
        />
      )}
    </>
  );
}
