import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBanner, Pill, dateShort } from "@/components/ui";
import {
  COMMERCIAL_MODELS,
  modelKeyOf,
  isLockedBrokerage,
  explainBidError,
  requestLaneAccess,
  segmentProgress,
  segmentsOf,
  type Answer,
  type BookEvent,
  type BookLane,
} from "./bidroom.service";

export const MODE_COPY: Record<string, { label: string; text: string }> = {
  private: { label: "Privado", text: "solo ves tu propia oferta; MARKSMAN compara todas." },
  anonymous_rank: {
    label: "Ranking anónimo",
    text: "ves tu lugar, tu score y tu distancia a la mejor oferta; nunca quién cotizó ni a cuánto.",
  },
  open_leaderboard: { label: "Tablero abierto", text: "ves la posición y la oferta de todos los carriers de cada ruta." },
};

const route = (lane: BookLane) => `${String(lane.origin ?? "—")} → ${String(lane.destination ?? "—")}`;

/** How many open lanes to list before pointing to the rest. */
const OPEN_LIMIT = 15;

/**
 * "El negocio" — understand the scope before pricing (wireframe 11, step 1):
 * what the invitation is, how quoting works, what each commercial model means,
 * plus the carrier's other open invitations and the owner's open lanes it can
 * ask to join.
 */
export function BusinessOverview({
  token,
  event,
  lanes,
  openLanes,
  others,
  answers,
  deadline,
  closing,
  mode,
  onQuote,
}: {
  token: string;
  event: BookEvent;
  lanes: BookLane[];
  openLanes: BookLane[];
  others: { event: BookEvent; lanes: BookLane[] }[];
  answers: Map<string, Answer>;
  deadline: string;
  closing: boolean;
  mode: string;
  onQuote: () => void;
}) {
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const lockedCommercialModel = lanes.length > 0 && lanes.every(isLockedBrokerage);
  const segments = segmentsOf(lanes);
  const quoted = lanes.filter((l) => l.bid_rate != null).length;
  const terms = segments.reduce(
    (acc, s) => {
      const p = segmentProgress(s.key, answers);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 },
  );
  const modeCopy = MODE_COPY[mode] ?? MODE_COPY.anonymous_rank;
  // Solo los modelos de sus rutas (decisión de Jose, 6-nov); sin modelo guardado, los que puede elegir.
  const ownModels = new Set(lanes.filter((l) => l.commercial_model).map((l) => modelKeyOf(l.commercial_model)));
  const models = ownModels.size ? COMMERCIAL_MODELS.filter((m) => ownModels.has(m.key)) : COMMERCIAL_MODELS.filter((m) => m.key !== "xbf_buy_sell");

  async function askAccess(laneId: string) {
    setError(null);
    try {
      await requestLaneAccess(token, laneId);
      setRequested((prev) => new Set(prev).add(laneId));
    } catch (e) {
      setError(explainBidError(e));
    }
  }

  return (
    <div className="croom-body side-narrow">
      <div className="croom-main">
        {error && <ErrorBanner message={error} />}

        <section className="croom-card">
          <header className="croom-card-head">
            <b className="grow">Tu invitación</b>
          </header>
          <dl className="croom-facts pad">
            <div>
              <dt>Cierre</dt>
              <dd>
                {event.due_date ? `${dateShort(event.due_date)} · ` : ""}
                {deadline}
              </dd>
            </div>
            {event.operation_start_date && (
              <div>
                <dt>Arranque</dt>
                <dd>{dateShort(event.operation_start_date)} · inicio estimado de la operación</dd>
              </div>
            )}
            <div>
              <dt>Rutas</dt>
              <dd>
                {lanes.length} en tu invitación · {segments.length} segmento{segments.length === 1 ? "" : "s"}
              </dd>
            </div>
            <div>
              <dt>Qué ves de los demás</dt>
              <dd>
                <b>{modeCopy.label}:</b> {modeCopy.text}
              </dd>
            </div>
          </dl>
        </section>

        <section className="croom-card">
          <header className="croom-card-head">
            <b className="grow">Cómo se cotiza</b>
          </header>
          <ol className="croom-steps">
            <li>
              <b>Cotiza cada ruta</b> con su tarifa all-in, en el orden que quieras. Cada ruta se guarda sola y la
              puedes corregir mientras la ventana siga abierta; cotizar una no te compromete con las demás.
            </li>
            <li>
              <b>Confirma los términos</b> de cada segmento, debajo de tus rutas. Decir «con excepción» o «no puedo» no
              te saca del bid: nos dice dónde negociar.
            </li>
            <li>
              <b>Sigue tu posición</b> en Mi ranking: se actualiza sola mientras otros cotizan.
            </li>
          </ol>
        </section>

        {lockedCommercialModel ? <section className="croom-card">
          <header className="croom-card-head"><b>XBF compra-venta · Modelo fijo</b></header>
          <p className="pad">Cotiza tu tarifa de venta a XBF. Las demás modalidades no aplican en esta etapa.</p>
        </section> : (        <section className="croom-card">
          <header className="croom-card-head">
            <b className="grow">{models.length === 1 ? "Tu modelo comercial" : "Modelos comerciales"}</b>
          </header>
          <div className="croom-table flat">
            <table className="data fixed">
              <colgroup>
                <col style={{ width: 190 }} />
                <col />
                <col style={{ width: 170 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th>Qué capturas y qué pasa</th>
                  <th>Porcentaje</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.key}>
                    <td>
                      <b>{m.label}</b>
                    </td>
                    <td className="croom-wrap">
                      {m.enter} {m.effect}
                    </td>
                    <td className="mono">
                      {m.min}–{m.max} % · vacío {m.blank} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>) }

        {others.length > 0 && (
          <section className="croom-card">
            <header className="croom-card-head">
              <b className="grow">Tus otras invitaciones abiertas</b>
              <Pill tone="blue">{others.length}</Pill>
            </header>
            <div className="croom-table flat">
              <table className="data fixed">
                <colgroup>
                  <col />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 90 }} />
                </colgroup>
                <tbody>
                  {others.map(({ event: other, lanes: rows }) => (
                    <tr key={String(other.id ?? rows[0]?.rfx_event_id)}>
                      <td className="ellipsis" title={String(other.name ?? "")}>
                        <span className="croom-num">{String(other.rfx_id ?? "")}</span>
                        {String(other.name ?? "Evento")}
                      </td>
                      <td className="mono">
                        {rows.length} ruta{rows.length === 1 ? "" : "s"}
                      </td>
                      <td className="mono">{other.due_date ? dateShort(other.due_date) : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link className="btn" to={`/bid/${encodeURIComponent(String(rows[0].invitation_token))}`}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {openLanes.length > 0 && (
          <section className="croom-card">
            <header className="croom-card-head">
              <b className="grow">Rutas abiertas a las que no te invitaron</b>
              <Pill>{openLanes.length}</Pill>
            </header>
            <p className="croom-card-note">Si los cubres, pide acceso: el equipo revisa y te invita.</p>
            <div className="croom-table flat">
              <table className="data fixed">
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 120 }} />
                </colgroup>
                <tbody>
                  {openLanes.slice(0, OPEN_LIMIT).map((lane) => {
                    const id = String(lane.rfx_lane_id ?? "");
                    return (
                      <tr key={id}>
                        <td className="mono croom-soft ellipsis">{String(lane.event?.rfx_id ?? "")}</td>
                        <td className="ellipsis" title={route(lane)}>
                          {route(lane)}
                        </td>
                        <td className="ellipsis croom-soft">{String(lane.equipment ?? "—")}</td>
                        <td style={{ textAlign: "right" }}>
                          {requested.has(id) ? (
                            <Pill tone="green">SOLICITADO</Pill>
                          ) : (
                            <button type="button" onClick={() => askAccess(id)}>
                              Pedir acceso
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {openLanes.length > OPEN_LIMIT && (
              <p className="croom-card-note">
                Y {openLanes.length - OPEN_LIMIT} más. Pregunta al equipo en Mensajes si buscas una ruta en particular.
              </p>
            )}
          </section>
        )}
      </div>

      <aside className="croom-side">
        <div className="croom-eyebrow">Tu avance</div>
        <div className="croom-meter">
          <div>
            <b>
              {quoted} de {lanes.length}
            </b>{" "}
            rutas cotizadas
          </div>
          <span>
            <i style={{ width: `${lanes.length ? (quoted / lanes.length) * 100 : 0}%` }} />
          </span>
        </div>
        <div className="croom-meter">
          <div>
            <b>
              {terms.done} de {terms.total}
            </b>{" "}
            rubros confirmados
          </div>
          <span>
            <i style={{ width: `${terms.total ? (terms.done / terms.total) * 100 : 0}%` }} />
          </span>
        </div>
        <div className={`croom-box${closing ? " amber" : ""}`}>
          <b>{deadline.charAt(0).toUpperCase() + deadline.slice(1)}</b>
          <p>
            {event.due_date
              ? `La ventana cierra el ${dateShort(event.due_date)} a las 23:59, hora del centro de México.`
              : "Este evento no tiene fecha de cierre."}
          </p>
        </div>
        <button type="button" className="primary" onClick={onQuote}>
          Ir a cotizar
        </button>
      </aside>
    </div>
  );
}
