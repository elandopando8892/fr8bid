import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, Pill, money } from "@/components/ui";
import { SCORE_FACTORS, canQuote, getLaneBoard, laneState, type BookLane, type LiveBoard } from "./bidroom.service";

/**
 * "Mi ranking" (wireframe 27): where the carrier stands on each lane it quoted.
 *
 * The server builds one board per lane and only for that lane's token, so each
 * quoted lane is read with its own token. Unquoted lanes are NOT read: the
 * first read stamps a lane as viewed on MARKSMAN's side, and opening this tab
 * must not make every lane look viewed. Everything competitors reveal (rank,
 * names, amounts, the exact distance) is already filtered by the server per
 * the event's mode.
 */

type Tone = "" | "green" | "blue" | "amber";
type BoardState = { board: LiveBoard | null; error: string | null };

const route = (lane: BookLane) => `${String(lane.origin ?? "—")} → ${String(lane.destination ?? "—")}`;

function signalOf(lane: BookLane, board: LiveBoard | null, mode: string): { label: string; tone: Tone; sub: string } {
  const state = laneState(lane);
  if (state === "awarded") return { label: "Adjudicado", tone: "green", sub: "la ruta es tuya" };
  if (state === "backup") return { label: "Respaldo", tone: "blue", sub: "quedaste como respaldo" };
  if (state === "not_awarded") return { label: "No adjudicado", tone: "", sub: "se adjudicó a otro carrier" };
  if (state === "declined") return { label: "No participo", tone: "", sub: "marcaste que no participas" };
  if (lane.bid_rate == null) return { label: "Sin cotizar", tone: "", sub: "cotiza para ver tu posición" };
  if (!board) return { label: "…", tone: "", sub: "cargando tu posición" };
  if (mode === "private") return { label: "Enviada", tone: "", sub: "evento privado, sin ranking" };
  const place = board.current_rank ? `lugar ${board.current_rank}${board.bid_count ? ` de ${board.bid_count}` : ""}` : "";
  if (board.current_rank === 1) return { label: "Líder", tone: "green", sub: place || "vas primero" };
  if (board.current_score_bucket === "needs_review") return { label: "Lejos", tone: "amber", sub: place || "hay ofertas mejor armadas" };
  return { label: "Competitivo", tone: "green", sub: place || "estás dentro del rango" };
}

/** The distance to the lowest offer: exact only on an open leaderboard, a range otherwise. */
function distanceOf(lane: BookLane, board: LiveBoard | null, mode: string): { value: string; sub: string } {
  const currency = String(lane.currency || board?.currency || "USD");
  if (lane.bid_rate == null) return { value: "—", sub: "sin oferta" };
  if (!board) return { value: "…", sub: "" };
  if (mode === "private") return { value: "—", sub: "no se comparte" };
  const delta = board.delta_to_leader;
  if (delta != null) {
    if (delta <= 0) return { value: money(0, currency), sub: "tienes la más baja" };
    const mine = board.rows?.find((r) => r.is_current)?.amount ?? Number(lane.bid_rate);
    const best = Number(mine) - delta;
    return {
      value: `+${money(delta, currency)}`,
      sub: best > 0 ? `${((delta / best) * 100).toFixed(1)} % arriba` : "arriba de la más baja",
    };
  }
  switch (board.delta_bucket) {
    case "leading":
      return { value: money(0, currency), sub: "tienes la más baja" };
    case "within_250":
      return { value: `< ${money(250, currency)}`, sub: "de la oferta más baja" };
    case "within_500":
      return { value: `< ${money(500, currency)}`, sub: "de la oferta más baja" };
    case "above_500":
      return { value: `> ${money(500, currency)}`, sub: "de la oferta más baja" };
    default:
      return { value: "—", sub: "aún sin con quién comparar" };
  }
}

/** "+$820 · 4.8 %" on an open board, the range otherwise. */
function distanceCell(d: { value: string; sub: string }): string {
  return d.sub.endsWith("% arriba") ? `${d.value} · ${d.sub.replace(" arriba", "")}` : d.value;
}

function scoreOf(board: LiveBoard | null, mode: string): { value: string; sub: string } {
  if (mode === "private") return { value: "—", sub: "sin score en eventos privados" };
  if (!board || board.current_score == null) return { value: "—", sub: "" };
  if (board.current_rank === 1) return { value: String(board.current_score), sub: "la mejor de este lane" };
  return {
    value: String(board.current_score),
    sub: board.leader_score != null ? `la mejor está en ${board.leader_score}` : "",
  };
}

export function MyRanking({
  lanes,
  mode,
  onComplete,
}: {
  lanes: BookLane[];
  /** The event's bid_visibility_mode. */
  mode: string;
  /** Opens the quote panel on this lane, with the score fields in view. */
  onComplete: (lane: BookLane) => void;
}) {
  const quoted = useMemo(() => lanes.filter((l) => l.bid_rate != null && l.invitation_token), [lanes]);
  const [boards, setBoards] = useState<Record<string, BoardState>>({});
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!quoted.length) return;
    setLoading(true);
    const entries = await Promise.all(
      quoted.map(async (lane) => {
        try {
          return [lane.rfx_lane_id, { board: await getLaneBoard(String(lane.invitation_token)), error: null }] as const;
        } catch (e) {
          return [lane.rfx_lane_id, { board: null, error: (e as Error).message }] as const;
        }
      }),
    );
    setBoards(Object.fromEntries(entries));
    setLoadedAt(new Date());
    setLoading(false);
  }, [quoted]);

  // The server suggests a refresh cadence; boards move as competitors bid.
  const refreshSeconds = Math.max(
    15,
    Object.values(boards).find((b) => b.board?.visibility?.refresh_seconds)?.board?.visibility?.refresh_seconds ?? 30,
  );
  useEffect(() => {
    load();
    const id = window.setInterval(load, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [load, refreshSeconds]);

  if (!lanes.length) return <Empty title="Sin lanes en tu invitación" />;

  const selected = lanes.find((l) => l.rfx_lane_id === picked) ?? quoted[0] ?? lanes[0];
  const board = boards[selected.rfx_lane_id]?.board ?? null;
  const signal = signalOf(selected, board, mode);
  const distance = distanceOf(selected, board, mode);
  const score = scoreOf(board, mode);
  const factors = SCORE_FACTORS.map((f) => ({ ...f, ok: f.done(selected) }));
  const pending = factors.filter((f) => !f.ok).length + (selected.bid_rate == null ? 1 : 0);
  const rows = board?.rows ?? [];

  return (
    <div className="croom-body">
      <div className="croom-main">
        <div className="croom-kpis">
          <div className="croom-kpis-lane">
            {selected.lane_number != null ? `Lane ${String(selected.lane_number)} · ` : ""}
            {route(selected)}
          </div>
          <div>
            <span>Tu señal</span>
            <strong className="signal">{signal.label}</strong>
            <small>{signal.sub}</small>
          </div>
          <div>
            <span>Distancia a la mejor</span>
            <strong>{distance.value}</strong>
            <small>{distance.sub}</small>
          </div>
          <div>
            <span>Tu score</span>
            <strong>{score.value}</strong>
            <small>{score.sub}</small>
          </div>
          <div>
            <span>Lanes cotizados</span>
            <strong>
              {quoted.length} de {lanes.length}
            </strong>
            <small>{lanes.length - quoted.length} sin oferta</small>
          </div>
        </div>

        <div className="croom-table">
          <table className="data fixed">
            <colgroup>
              <col />
              <col style={{ width: 120 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Lane</th>
                <th>Tu oferta</th>
                <th>Vs mejor</th>
                <th>Score</th>
                <th>Señal</th>
              </tr>
            </thead>
            <tbody>
              {lanes.map((lane) => {
                const state = boards[lane.rfx_lane_id];
                const b = state?.board ?? null;
                const s = signalOf(lane, b, mode);
                const d = distanceOf(lane, b, mode);
                return (
                  <tr
                    key={lane.rfx_lane_id}
                    className={`clickable${lane.rfx_lane_id === selected.rfx_lane_id ? " picked" : ""}`}
                    onClick={() => setPicked(lane.rfx_lane_id)}
                  >
                    <td className="ellipsis" title={route(lane)}>
                      {lane.lane_number != null && <span className="croom-num">{String(lane.lane_number)}</span>}
                      <span className="croom-route">{route(lane)}</span>
                    </td>
                    <td className="mono">{lane.bid_rate != null ? money(lane.bid_rate, String(lane.currency || "USD")) : "—"}</td>
                    <td className="mono croom-soft" title={state?.error ?? undefined}>
                      {state?.error ? "no disponible" : distanceCell(d)}
                    </td>
                    <td className="mono">{mode !== "private" && b?.current_score != null ? b.current_score : "—"}</td>
                    <td>
                      <Pill tone={s.tone}>{s.label.toUpperCase()}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {quoted.length > 0 && (
            <div className="croom-table-foot">
              <span>
                {loadedAt
                  ? `Actualizado ${loadedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · se actualiza solo cada ${refreshSeconds} s`
                  : "Cargando tu posición…"}
              </span>
              <div className="spacer" />
              <button type="button" className="link" disabled={loading} onClick={load}>
                {loading ? "Actualizando…" : "Actualizar"}
              </button>
            </div>
          )}
        </div>

        {mode === "open_leaderboard" && rows.length > 1 && (
          <div className="croom-table">
            <table className="data fixed">
              <colgroup>
                <col style={{ width: 70 }} />
                <col />
                <col style={{ width: 140 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Lugar</th>
                  <th>Carrier · {route(selected)}</th>
                  <th>Oferta</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rank} className={r.is_current ? "picked" : undefined}>
                    <td className="mono">#{r.rank}</td>
                    <td className="ellipsis">{r.is_current ? "Tú" : r.bidder}</td>
                    <td className="mono">{r.amount != null ? money(r.amount, String(r.currency || selected.currency || "USD")) : "—"}</td>
                    <td className="mono">{r.marketplace_score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section className="croom-card">
          <header className="croom-card-head">
            <b className="grow">Qué sube tu score sin bajar tu tarifa</b>
            <Pill tone={pending ? "amber" : "green"}>{pending ? `${pending} PENDIENTE${pending === 1 ? "" : "S"}` : "COMPLETO"}</Pill>
          </header>
          <div className={`croom-check-row${selected.bid_rate != null ? " ok" : ""}`}>
            <span className="mark">{selected.bid_rate != null ? "✓" : "○"}</span>
            <span className="grow">Tarifa all-in declarada</span>
            <span className="hint">{selected.bid_rate != null ? "ya la tienes" : "sin tarifa no hay score"}</span>
          </div>
          {factors.map((f) => (
            <div key={f.label} className={`croom-check-row${f.ok ? " ok" : ""}`}>
              <span className="mark">{f.ok ? "✓" : "○"}</span>
              <span className="grow">{f.label}</span>
              <span className="hint">{f.hint}</span>
            </div>
          ))}
          <div className="croom-card-foot">
            {canQuote(selected) ? (
              <>
                <div className="spacer" />
                <button type="button" className="primary" onClick={() => onComplete(selected)}>
                  {selected.bid_rate != null ? "Completar mi oferta" : "Cotizar este lane"}
                </button>
              </>
            ) : (
              <span className="croom-soft">Este lane ya no admite cambios.</span>
            )}
          </div>
        </section>
      </div>

      <aside className="croom-side">
        {mode === "private" ? (
          <>
            <div className="croom-eyebrow">Evento privado</div>
            <div className="croom-box">
              <b>No hay ranking en este evento</b>
              <p>
                MARKSMAN compara todas las ofertas; tú solo ves la tuya. Lo que pesa es lo mismo: tarifa, capacidad,
                tránsito, equipo y validación.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="croom-eyebrow">Si no has cotizado</div>
            <div className="croom-box">
              <b>Tu score está bloqueado</b>
              <p>Envía tu tarifa all-in con capacidad, ETA y datos de validación para desbloquearlo.</p>
            </div>
            <div className="croom-eyebrow">El score no es solo precio</div>
            <p className="croom-side-text">
              Una tarifa más alta con capacidad firme, ETA clara y equipo confirmado puede ganarle a una más barata sin
              respaldo. Por eso ves el score junto a la distancia, y no solo la distancia.
            </p>
          </>
        )}
        <div className="croom-box amber">
          <b>Cuando la ventana cierra</b>
          <p>El tablero se congela con tu última posición y la oferta ya no se puede corregir.</p>
        </div>
      </aside>
    </div>
  );
}
