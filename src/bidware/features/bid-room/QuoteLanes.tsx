import { useRef, useState } from "react";
import { InfoBanner, Pill, money } from "@/components/ui";
import { QuotePanel, QuotePanelEmpty } from "./QuotePanel";
import { SegmentTerms } from "./SegmentTerms";
import { QuoteExcel } from "./QuoteExcel";
import { canQuote, laneState, type Answer, type BookLane, type LaneState } from "./bidroom.service";

type Tone = "" | "green" | "amber" | "red" | "blue";

const STATE_PILL: Record<LaneState, { label: string; tone: Tone }> = {
  quoted: { label: "COTIZADO", tone: "green" },
  pending: { label: "PENDIENTE", tone: "amber" },
  declined: { label: "NO PARTICIPO", tone: "" },
  withdrawn: { label: "RETIRADA", tone: "" },
  closed: { label: "VENTANA CERRADA", tone: "red" },
  awarded: { label: "ADJUDICADO", tone: "green" },
  backup: { label: "RESPALDO", tone: "blue" },
  not_awarded: { label: "NO ADJUDICADO", tone: "" },
};

/** The row's one action: price it, revise it, or just look at it once it can't change. */
function actionOf(lane: BookLane): { label: string; primary?: boolean } | null {
  const state = laneState(lane);
  if (canQuote(lane)) {
    if (state === "quoted") return { label: "Revisar" };
    return state === "pending" ? { label: "Cotizar", primary: true } : { label: "Cotizar" };
  }
  return lane.bid_rate != null || ["awarded", "backup", "not_awarded"].includes(state) ? { label: "Ver" } : null;
}

/** Below this width the panel sits under the table instead of beside it. */
export const wide = () => window.matchMedia("(min-width: 1001px)").matches;

/**
 * "Cotizar lanes" (wireframe 24): the carrier's lanes of this event, the terms
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
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [excelBusy, setExcelBusy] = useState(false);
  const quoted = lanes.filter((l) => l.bid_rate != null).length;
  const volumes = lanes.some((l) => l.weekly_volume != null && l.weekly_volume !== "");

  function pick(lane: BookLane) {
    if (excelBusy) return;
    onPick(lane);
    if (!wide()) window.setTimeout(() => panel.current?.scrollIntoView({ block: "start" }), 30);
  }

  return (
    <div className="croom-body">
      <div className="croom-main">
        {notice && <InfoBanner>{notice}</InfoBanner>}
        <QuoteExcel token={token} eventId={eventId} onBusy={setExcelBusy} onSettled={onReload} />
        <div className="croom-note">
          <b>
            {quoted} de {lanes.length} lanes cotizados.
          </b>
          <span>
            Puedes cotizar en cualquier orden y corregir mientras la ventana siga abierta. Cotizar un lane no te
            compromete con los demás.
          </span>
        </div>

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
                <th>Origen</th>
                <th>Destino</th>
                <th>Equipo</th>
                {volumes && <th>Vol/sem</th>}
                <th>Tu oferta</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lanes.map((lane) => {
                const pill = STATE_PILL[laneState(lane)];
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
                      <Pill tone={pill.tone}>{pill.label}</Pill>
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

      <div className="croom-panel-slot" ref={panel}>
        <fieldset disabled={excelBusy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {picked ? (
          <QuotePanel lane={picked} extrasOpen={extras} onDone={(message) => onDone(picked, message)} onAsk={onAsk} />
        ) : (
          <QuotePanelEmpty />
        )}
        </fieldset>
      </div>
    </div>
  );
}
