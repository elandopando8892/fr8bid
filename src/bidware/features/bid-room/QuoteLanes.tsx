import { useEffect, useRef, useState } from "react";
import { InfoBanner, Pill, money } from "@/components/ui";
import { useLang } from "@/i18n/language";
import { q } from "@/i18n/bid-room-quote";
import { QuotePanel, QuotePanelEmpty } from "./QuotePanel";
import { nextPending, type SharedFields } from "./quick-quote";
import { SegmentTerms } from "./SegmentTerms";
import { QuoteExcel } from "./QuoteExcel";
import { canQuote, laneState, type Answer, type BookLane, type LaneState } from "./bidroom.service";

type Tone = "" | "green" | "amber" | "red" | "blue";

const STATE_TONE: Record<LaneState, Tone> = {
  quoted: "green",
  pending: "amber",
  declined: "",
  withdrawn: "",
  closed: "red",
  awarded: "green",
  backup: "blue",
  not_awarded: "",
};

/** The row's one action: price it, revise it, or just look at it once it can't change. */
function actionOf(lane: BookLane): { label: string; primary?: boolean } | null {
  const state = laneState(lane);
  if (canQuote(lane)) {
    if (state === "quoted") return { label: q("action.review") };
    return state === "pending" ? { label: q("action.quote"), primary: true } : { label: q("action.quote") };
  }
  return lane.bid_rate != null || ["awarded", "backup", "not_awarded"].includes(state) ? { label: q("action.view") } : null;
}

/** Below this width the panel sits under the table instead of beside it. */
export const wide = () => window.matchMedia("(min-width: 1001px)").matches;

/** The same answer as wide(), kept current when the window is resized or the phone turns. */
export function useWide() {
  const [is, setIs] = useState(wide);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1001px)");
    const change = () => setIs(mq.matches);
    mq.addEventListener?.("change", change);
    return () => mq.removeEventListener?.("change", change);
  }, []);
  return is;
}


/**
 * "Cotizar rutas" (wireframe 24): the carrier's lanes of this event, the terms
 * of their segments below, and the quote panel beside them.
 */
export function QuoteLanes({
  token,
  eventId,
  onReload,
  lanes,
  answers,
  onAnswer,
  picked,
  extras,
  notice,
  onPick,
  onDone,
  onAsk,
  onClose,
  shared,
  onShare,
  answered,
}: {
  token: string;
  eventId: string;
  onReload: () => void;
  lanes: BookLane[];
  answers: Map<string, Answer>;
  onAnswer: (key: string, answer: Answer) => void;
  picked: BookLane | null;
  extras: boolean;
  notice: string | null;
  onPick: (lane: BookLane) => void;
  onDone: (lane: BookLane, message: string) => void;
  onAsk: () => void;
  /** Closes the bottom sheet on a phone. */
  onClose: () => void;
  shared: SharedFields | null;
  onShare: (fields: SharedFields | null) => void;
  /** Lanes answered here whose reload has not arrived yet. */
  answered: ReadonlySet<string>;
}) {
  useLang();
  const panel = useRef<HTMLDivElement>(null);
  const isWide = useWide();
  // While an offer is on its way the sheet stays open: its result (sent, or the error) shows there.
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  sendingRef.current = sending;
  const close = () => {
    if (!sendingRef.current) onClose();
  };
  // On a phone the quote opens as a sheet over the list, one lane at a time.
  const sheet = !isWide && Boolean(picked);
  const position = picked ? lanes.findIndex((l) => l.rfx_lane_id === picked.rfx_lane_id) + 1 : 0;
  const next = picked && picked.bid_rate == null ? nextPending(lanes, picked, answered) : null;
  const others = lanes.filter((l) => l.bid_rate == null && canQuote(l) && !answered.has(l.rfx_lane_id) && l.rfx_lane_id !== picked?.rfx_lane_id).length;

  // The sheet takes the focus to its title, closes with Escape, and the list behind it does not scroll.
  useEffect(() => {
    if (!sheet) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // A confirmation opened over the sheet handles its own keys.
      const above = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].some(
        (d) => d !== panel.current && !panel.current?.contains(d),
      );
      if (above) return;
      if (e.key === "Escape") return close();
      // Tab stays inside the sheet.
      if (e.key !== "Tab" || !panel.current) return;
      const all = [...panel.current.querySelectorAll<HTMLElement>("button, input, select, textarea, summary, [href]")].filter(
        (el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0,
      );
      if (!all.length) return;
      const first = all[0], last = all[all.length - 1];
      if (!panel.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    // Capture phase: runs while a confirmation on top is still open, so its Escape never closes the sheet.
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sheet) return;
    panel.current?.scrollTo?.({ top: 0 });
    panel.current?.querySelector<HTMLElement>(".croom-panel-title")?.focus();
  }, [sheet, picked?.rfx_lane_id]);
  const [excelBusy, setExcelBusy] = useState(false);
  const quoted = lanes.filter((l) => l.bid_rate != null).length;
  const volumes = lanes.some((l) => l.weekly_volume != null && l.weekly_volume !== "");

  function pick(lane: BookLane) {
    if (excelBusy) return;
    onPick(lane);
  }

  return (
    <div className="croom-body">
      <div className="croom-main">
        {notice && <InfoBanner>{notice}</InfoBanner>}
        <QuoteExcel
          token={token}
          eventId={eventId}
          onBusy={setExcelBusy}
          onSettled={onReload}
          progress={
            <>
              <b>{q("lanes.progress", quoted, lanes.length)}</b>{" "}
              <span className="ayuda">{q("lanes.progressHint")}</span>
            </>
          }
        />

        <fieldset disabled={excelBusy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="croom-table">
          <table className="data fixed lanes">
            <colgroup>
              <col style={{ width: 44 }} />
              <col />
              <col />
              <col style={{ width: 150 }} />
              {volumes && <col style={{ width: 76 }} />}
              <col style={{ width: 104 }} />
              <col style={{ width: 132 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>{q("lanes.origin")}</th>
                <th>{q("lanes.destination")}</th>
                <th>{q("lanes.equipment")}</th>
                {volumes && <th>{q("lanes.volume")}</th>}
                <th>{q("lanes.yourOffer")}</th>
                <th>{q("lanes.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lanes.map((lane) => {
                const state = laneState(lane);
                const action = actionOf(lane);
                return (
                  <tr
                    key={lane.rfx_lane_id}
                    className={`clickable${picked?.rfx_lane_id === lane.rfx_lane_id ? " picked" : ""}`}
                    onClick={() => pick(lane)}
                  >
                    <td className="c-num mono croom-soft">{lane.lane_number != null ? String(lane.lane_number) : "—"}</td>
                    <td className="c-origin ellipsis" title={String(lane.origin ?? "")}>
                      {String(lane.origin ?? "—")}
                    </td>
                    <td className="c-dest ellipsis croom-dest" title={String(lane.destination ?? "")}>
                      {String(lane.destination ?? "—")}
                    </td>
                    <td className="c-equip ellipsis croom-soft" title={String(lane.equipment ?? "")}>
                      {String(lane.equipment ?? "—")}
                    </td>
                    {volumes && <td className="c-vol mono">{lane.weekly_volume != null ? String(lane.weekly_volume) : "—"}</td>}
                    <td className={`c-offer mono${lane.bid_rate == null ? " croom-soft" : ""}`}>
                      {lane.bid_rate != null ? money(lane.bid_rate, String(lane.currency || "USD")) : "—"}
                    </td>
                    <td className="c-state">
                      <Pill tone={STATE_TONE[state]}>{q(`state.${state}`)}</Pill>
                    </td>
                    <td className="c-action" style={{ textAlign: "right" }}>
                      {action ? (
                        <button
                          type="button"
                          className={action.primary ? "primary" : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            pick(lane);
                          }}
                        >
                          {action.label}
                        </button>
                      ) : (
                        <span className="croom-soft">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <SegmentTerms lanes={lanes} answers={answers} onAnswer={onAnswer} />
        </fieldset>
      </div>

      {sheet && <div className="croom-hoja-fondo" onClick={close} aria-hidden />}
      {(isWide || picked) && (
        <div
          className={`croom-panel-slot${sheet ? " croom-hoja" : ""}`}
          ref={panel}
          role={sheet ? "dialog" : undefined}
          aria-modal={sheet ? true : undefined}
          aria-label={sheet && picked ? `${String(picked.origin ?? "")} → ${String(picked.destination ?? "")}` : undefined}
        >
          {sheet && (
            <div className="croom-hoja-barra">
              <span className="croom-hoja-asa" aria-hidden />
              <button type="button" className="btn-texto-croom" onClick={close} disabled={sending}>
                {q("panel.close")}
              </button>
            </div>
          )}
          {sheet && notice && <InfoBanner>{notice}</InfoBanner>}
          <fieldset disabled={excelBusy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {picked ? (
            <QuotePanel
              lane={picked}
              extrasOpen={extras}
              onDone={(message) => onDone(picked, message)}
              onAsk={onAsk}
              position={{ n: position, total: lanes.length }}
              next={next}
              shared={shared}
              onShare={onShare}
              others={others}
              onBusy={setSending}
            />
          ) : (
            <QuotePanelEmpty />
          )}
          </fieldset>
        </div>
      )}
    </div>
  );
}
