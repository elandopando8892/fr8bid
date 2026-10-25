import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  answersOf,
  canQuote,
  dueOf,
  eventLanes,
  getInvitation,
  laneState,
  otherOpenEvents,
  type Answer,
  type BookEvent,
  type BookLane,
  type DueState,
  type PrivateWorkspace,
} from "./bidroom.service";
import { QuoteLanes, wide } from "./QuoteLanes";
import { BusinessOverview, MODE_COPY } from "./BusinessOverview";
import { BidRoomChat } from "./BidRoomChat";
import { BidSupportAssistant } from "./BidSupportAssistant";
import { MyRanking } from "./MyRanking";
import { useAsync } from "@/components/useAsync";
import { Spinner, ErrorBanner, Empty, InfoBanner, Pill, dateShort } from "@/components/ui";

/**
 * Carrier private Bid Room (wireframes 11, 24 and 27). The token is the
 * credential — there is no login.
 *
 * Two entry shapes are served on purpose:
 *  - /bid/:token            — Bidware's own, clean link;
 *  - /rfx-bid.html?token=   — the shape the shared backend composes for
 *    invitations. Bidware must answer it, otherwise every carrier it invites
 *    lands on a 404 or, worse, back in rateware.
 *
 * Four tabs mirror how a carrier moves: understand the business, price the
 * lanes, see where it stands, talk to MARKSMAN.
 */
const PHASES: { key: PrivateWorkspace; label: string }[] = [
  { key: "master", label: "El negocio" },
  { key: "bids", label: "Cotizar lanes" },
  { key: "award", label: "Mi ranking" },
  { key: "chat", label: "Mensajes" },
];

/** What the carrier never sees of the others, per the event's mode (wireframe 27). */
const BAND: Record<string, { tag: string; text: string }> = {
  anonymous_rank: {
    tag: "LO QUE NUNCA VERÁS",
    text: "Ni quién más cotizó ni sus tarifas. Solo tu lugar, tu score y tu distancia a la mejor oferta, en rango.",
  },
  private: {
    tag: "EVENTO PRIVADO",
    text: "Solo ves tu propia oferta. MARKSMAN ve todas, pero no se comparte ninguna posición.",
  },
  open_leaderboard: {
    tag: "TABLERO ABIERTO",
    text: "Ves la posición, el nombre y la oferta de los carriers de cada lane, y ellos ven la tuya.",
  },
};

/** "cierra en 8 días": days_remaining counts the deadline's own day, so today is 1. */
function deadlineText(due: DueState): string {
  if (!due.due_date || due.status === "no_deadline") return "sin fecha de cierre";
  if (due.status === "closed") return `cerró el ${dateShort(due.due_date)}`;
  const days = Number(due.days_remaining) - 1;
  if (!Number.isFinite(days)) return `cierra el ${dateShort(due.due_date)}`;
  if (days <= 0) return "cierra hoy a las 23:59";
  if (days === 1) return "cierra mañana";
  return `cierra en ${days} días`;
}

export function BidRoomPage() {
  const { token: routeToken } = useParams();
  const [search] = useSearchParams();
  const token = routeToken || search.get("token") || "";
  return <BidRoomContent key={token} token={token} />;
}

function BidRoomContent({ token }: { token: string }) {
  const { data, loading, error, reload } = useAsync(() => getInvitation(token), [token]);
  const [phase, setPhase] = useState<PrivateWorkspace>("bids");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [extras, setExtras] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const invitation = (data?.invitation ?? {}) as Record<string, unknown>;
  const event = (invitation.rfx_events ?? {}) as BookEvent;
  const eventId = String(invitation.rfx_event_id ?? event.id ?? "");
  const lanes = useMemo(() => eventLanes(data?.carrier_book, eventId), [data, eventId]);
  const serverAnswers = useMemo(() => answersOf(data?.segment_confirmations ?? [], lanes), [data, lanes]);
  // Answers picked here save in place, without reloading the page (that would reset a half-typed quote).
  const [picks, setPicks] = useState<Map<string, Answer>>(new Map());
  const answers = useMemo(() => new Map([...serverAnswers, ...picks]), [serverAnswers, picks]);

  // Another link (another event) starts over.
  useEffect(() => {
    setPhase("bids");
    setPickedId(null);
    setExtras(false);
    setNotice(null);
    setPicks(new Map());
  }, [token]);

  // On a wide screen the panel opens on the first lane still waiting for a quote
  // (also after switching links, when the previous pick belongs to another event).
  useEffect(() => {
    if ((pickedId && lanes.some((l) => l.rfx_lane_id === pickedId)) || !lanes.length || !wide()) return;
    const first = lanes.find((l) => laneState(l) === "pending" && canQuote(l)) ?? lanes[0];
    setPickedId(first.rfx_lane_id);
  }, [lanes, pickedId]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(id);
  }, [notice]);

  if (loading && !data) {
    return (
      <div className="center-screen">
        <Spinner label="Abriendo tu Bid Room…" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="croom">
        <header className="croom-head closed">
          <div className="croom-crumb">Acceso privado de carrier · Marksman</div>
          <h1>No pudimos abrir tu Bid Room</h1>
        </header>
        <main className="croom-page">
          <ErrorBanner message={error || "El enlace no es válido."} />
          <p className="croom-side-text" style={{ marginTop: 12 }}>
            Si el enlace viene de un correo anterior, pide uno nuevo al equipo de MARKSMAN.
          </p>
        </main>
      </div>
    );
  }

  const carrier = String(
    data.carrier_book?.carrier?.vendor_name || (invitation.vendors as Record<string, unknown> | undefined)?.vendor_name || "",
  );
  const mode = String(event.bid_visibility_mode || "anonymous_rank");
  const due = dueOf(lanes, event.due_date);
  const deadline = deadlineText(due);
  const picked = lanes.find((l) => l.rfx_lane_id === pickedId) ?? null;
  const band = BAND[mode] ?? BAND.anonymous_rank;
  /** The link's own lane, for the assistant's "details of this route" prompt. */
  const linkLane = (invitation.rfx_lanes ?? {}) as Record<string, unknown>;
  const linkRoute =
    linkLane.origin && linkLane.destination ? `${String(linkLane.origin)} → ${String(linkLane.destination)}` : undefined;

  function afterWrite(lane: BookLane, message: string) {
    setNotice(message);
    setExtras(false);
    // A first answer on a lane moves on to the next one still waiting; a revision stays put.
    if (lane.bid_rate == null && wide()) {
      const next = lanes.find((l) => l.rfx_lane_id !== lane.rfx_lane_id && laneState(l) === "pending" && canQuote(l));
      if (next) setPickedId(next.rfx_lane_id);
    }
    reload();
  }

  return (
    <div className="croom">
      <header className="croom-head">
        <div className="croom-crumb">
          Acceso privado de carrier · Marksman{event.rfx_id ? ` · ${event.rfx_id}` : ""}
        </div>
        <h1>{event.name || "Bid Room privado"}</h1>
        <div className="croom-meta">
          {carrier && <Pill tone="amber">{carrier.toUpperCase()}</Pill>}
          <Pill>{(MODE_COPY[mode] ?? MODE_COPY.anonymous_rank).label.toUpperCase()}</Pill>
          <span>
            {lanes.length} lane{lanes.length === 1 ? "" : "s"} en tu invitación ·{" "}
            <span className={due.status === "closing" ? "croom-closing" : undefined}>{deadline}</span>
            {event.operation_start_date ? ` · arranca el ${dateShort(event.operation_start_date)}` : ""}
          </span>
        </div>
        <nav className="croom-tabs">
          {PHASES.map((p) => (
            <button
              key={p.key}
              type="button"
              className={phase === p.key ? "active" : undefined}
              onClick={() => setPhase(p.key)}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </header>

      {phase === "award" && (
        <div className="croom-band">
          <Pill tone="indigo">{band.tag}</Pill>
          <span>{band.text}</span>
        </div>
      )}

      <main className="croom-page">
        {error && <ErrorBanner message={error} />}
        {linkLane.no_award === true && (
          <InfoBanner title="La ruta de esta liga se cerró sin adjudicar.">
            {linkRoute ? `${linkRoute} ya no recibe ofertas. ` : "Ya no recibe ofertas. "}
            {lanes.length ? "Las demás rutas de tu invitación siguen abiertas." : ""}
          </InfoBanner>
        )}

        {phase === "master" && (
          <BusinessOverview
            token={token}
            event={event}
            lanes={lanes}
            openLanes={data.carrier_book?.open_not_invited ?? []}
            others={otherOpenEvents(data.carrier_book, eventId)}
            answers={answers}
            deadline={deadline}
            closing={due.status === "closing"}
            mode={mode}
            onQuote={() => setPhase("bids")}
          />
        )}

        {phase === "bids" &&
          (lanes.length ? (
            <QuoteLanes
              token={token}
              eventId={eventId}
              onReload={reload}
              lanes={lanes}
              answers={answers}
              onAnswer={(key, answer) => setPicks((m) => new Map(m).set(key, answer))}
              picked={picked}
              extras={extras}
              notice={notice}
              onPick={(lane) => {
                setPickedId(lane.rfx_lane_id);
                setExtras(false);
              }}
              onDone={afterWrite}
              onAsk={() => setPhase("chat")}
            />
          ) : (
            <Empty
              title="Sin lanes en tu invitación"
              hint="Si crees que falta un lane, pide acceso en El negocio o escribe al equipo en Mensajes."
            />
          ))}

        {phase === "award" && (
          <MyRanking
            lanes={lanes}
            mode={mode}
            onComplete={(lane) => {
              setPickedId(lane.rfx_lane_id);
              setExtras(lane.bid_rate != null);
              setPhase("bids");
            }}
          />
        )}

        {phase === "chat" && <BidRoomChat token={token} />}

        <BidSupportAssistant token={token} route={linkRoute} />
      </main>
    </div>
  );
}
