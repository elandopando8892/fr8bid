import { useEffect, useMemo, useRef, useState } from "react";
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
import { nextPending, type AnswerKind, type SharedFields } from "./quick-quote";
import { ReloadRetry } from "./ReloadRetry";
import { BusinessOverview } from "./BusinessOverview";
import { BidRoomChat } from "./BidRoomChat";
import { BidSupportAssistant } from "./BidSupportAssistant";
import { MyRanking } from "./MyRanking";
import { useAsync } from "@/components/useAsync";
import { Spinner, ErrorBanner, Empty, InfoBanner, Pill, dateShort } from "@/components/ui";
import { BotonAyudas } from "../../../ui/BotonAyudas";
import { setLang, useLang, type Lang } from "@/i18n/language";
import { q } from "@/i18n/bid-room-quote";
import { o } from "@/i18n/bid-room-overview";

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
const PHASES: PrivateWorkspace[] = ["master", "bids", "award", "chat"];

/** What the carrier never sees of the others, per the event's mode (wireframe 27). */
const BANDS = ["anonymous_rank", "private", "open_leaderboard"] as const;
function bandOf(mode: string): { tag: string; text: string } {
  const key = BANDS.find((m) => m === mode) ?? "anonymous_rank";
  return { tag: o(`band.${key}.tag`), text: o(`band.${key}.text`) };
}

/** "cierra en 8 días": days_remaining counts the deadline's own day, so today is 1. */
function deadlineText(due: DueState): string {
  if (!due.due_date || due.status === "no_deadline") return q("due.none");
  if (due.status === "closed") return q("due.closed", dateShort(due.due_date));
  const days = Number(due.days_remaining) - 1;
  if (!Number.isFinite(days)) return q("due.on", dateShort(due.due_date));
  if (days <= 0) return q("due.today");
  if (days === 1) return q("due.tomorrow");
  return q("due.days", days);
}

/** La barra de marca: el carrier llega desde un correo y ve primero quién lo invita. */
function MarcaCarrier({ onPerson }: { onPerson?: () => void }) {
  const lang = useLang();
  // El documento declara el idioma que se ve: lectores de pantalla y traductores del navegador lo usan.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <div className="croom-bar">
      <span className="croom-logo">
        MARKS<b>MAN</b>
      </span>
      <span className="croom-bar-note">{q("bar.note")}</span>
      {onPerson && (
        <button type="button" className="croom-persona" onClick={onPerson} aria-label={q("bar.person")}>
          <span className="croom-persona-largo">{q("bar.person")}</span>
          <span className="croom-persona-corto" aria-hidden>{q("bar.personShort")}</span>
        </button>
      )}
      <BotonAyudas en={lang === "en"} className="boton-ayudas-publica" />
      <div className="profile-lang sr-lang" role="group" aria-label={q("bar.language")}>
        {(["es", "en"] as Lang[]).map((l) => (
          <button key={l} type="button" className={lang === l ? "active" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BidRoomPage() {
  const { token: routeToken } = useParams();
  const [search] = useSearchParams();
  const token = routeToken || search.get("token") || "";
  return <BidRoomContent key={token} token={token} />;
}

function BidRoomContent({ token }: { token: string }) {
  useLang();
  const { data, loading, error, reload } = useAsync(() => getInvitation(token), [token]);
  const [phase, setPhase] = useState<PrivateWorkspace>("bids");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [extras, setExtras] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Capacity, transit and validity the carrier chose to reuse on the lanes not quoted yet.
  const [shared, setShared] = useState<SharedFields | null>(null);
  // Lanes answered here, each with the server copy that was on screen when it was answered. Until a newer
  // copy arrives (the reload, which useAsync only accepts from the latest request), the list still shows them
  // pending, so they are never offered again as "next"; once it arrives the server's own state decides.
  const [answeredOn, setAnsweredOn] = useState<Map<string, { copy: unknown; kind: AnswerKind }>>(new Map());
  const answeredRef = useRef(answeredOn);
  answeredRef.current = answeredOn;
  const dataRef = useRef<unknown>(null);
  dataRef.current = data;
  const answered = useMemo(
    () => new Map([...answeredOn].filter(([, a]) => a.copy === data).map(([id, a]) => [id, a.kind] as const)),
    [answeredOn, data],
  );
  const pickedRef = useRef<string | null>(null);
  const lanesRef = useRef<BookLane[]>([]);

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
    setShared(null);
    setAnsweredOn(new Map());
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
        <Spinner label={q("page.opening")} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="croom">
        <MarcaCarrier />
        <header className="croom-head closed">
          <h1>{q("page.failed")}</h1>
        </header>
        <main className="croom-page">
          {/* El servidor redacta el rechazo de un enlace vencido solo en inglés; aquí va en el idioma del carrier. */}
          <ErrorBanner message={/invitation link is invalid/i.test(error ?? "") ? q("page.expiredLink") : error || q("page.invalidLink")} />
          <p className="croom-side-text" style={{ marginTop: 12 }}>
            {q("page.oldLink")}
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
  // Read by a send that finishes later: the selection and lanes as they are then, not as they were when it started.
  pickedRef.current = pickedId;
  lanesRef.current = lanes;
  const canQuoteAny = lanes.some(canQuote);
  const quotedCount = lanes.filter((l) => l.bid_rate != null).length;
  const band = bandOf(mode);
  /** The link's own lane, for the assistant's "details of this route" prompt. */
  const linkLane = (invitation.rfx_lanes ?? {}) as Record<string, unknown>;
  const linkRoute =
    linkLane.origin && linkLane.destination ? `${String(linkLane.origin)} → ${String(linkLane.destination)}` : undefined;

  function afterWrite(lane: BookLane, message: string, kind?: AnswerKind) {
    setNotice(message);
    setExtras(false);
    // A first answer on a lane moves on to the next one still waiting (the button said so); a revision stays put.
    // On a phone, with nothing left to quote, the sheet closes and the list shows the progress.
    if (lane.bid_rate == null && kind) {
      const map = new Map(answeredRef.current).set(lane.rfx_lane_id, { copy: dataRef.current, kind });
      answeredRef.current = map;
      setAnsweredOn(map);
      const done = new Set([...map].filter(([, a]) => a.copy === dataRef.current).map(([id]) => id));
      // If the carrier closed the sheet or moved to another lane while this one was sending, the late answer leaves the choice alone.
      if (pickedRef.current === lane.rfx_lane_id) {
        const next = nextPending(lanesRef.current, lane, done);
        if (next) setPickedId(next.rfx_lane_id);
        else if (!wide()) setPickedId(null);
      }
    }
    reload();
  }

  return (
    <div className="croom">
      <MarcaCarrier onPerson={() => setPhase("chat")} />
      <header className="croom-head">
        <h1>{event.name || q("page.private")}</h1>
        {/* Una línea, sin chips (decisión de Jose, 6-nov). */}
        <div className="croom-meta">
          <span>
            {/* Lo que se le pide y cuándo cierra, en palabras de despachador (C2, C5). */}
            {[carrier, `${lanes.length} ${lanes.length === 1 ? q("page.laneOne") : q("page.laneMany")}`, canQuoteAny ? q("page.onlyRate") : ""]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
            <span className={due.status === "closing" ? "croom-closing" : undefined}>
              {deadline}
              {due.due_date && due.status !== "closed" && due.status !== "no_deadline" ? ` (${dateShort(due.due_date)})` : ""}
            </span>
            {event.rfx_id ? ` · ${event.rfx_id}` : ""}
            {event.operation_start_date ? ` · ${q("page.starts", dateShort(event.operation_start_date))}` : ""}
          </span>
        </div>
        <nav className="croom-tabs">
          {PHASES.map((p) => (
            <button
              key={p}
              type="button"
              className={phase === p ? "active" : undefined}
              onClick={() => setPhase(p)}
            >
              {p === "bids" && lanes.length ? q("tab.bidsCount", quotedCount, lanes.length) : q(`tab.${p}`)}
            </button>
          ))}
        </nav>
      </header>

      {phase === "award" && (
        <div className="croom-band ayuda">
          <Pill tone="indigo">{band.tag}</Pill>
          <span>{band.text}</span>
        </div>
      )}

      <main className="croom-page">
        {error && <ErrorBanner message={error} />}
        {/* A reload that failed after an answer: the list keeps the answer as sent until it can be read again. */}
        {error && answered.size > 0 && <ReloadRetry onRetry={reload} />}
        {linkLane.no_award === true && (
          <InfoBanner title={q("page.noAwardTitle")}>
            {linkRoute ? q("page.noAwardRoute", linkRoute) : q("page.noAwardNoRoute")}
            {lanes.length ? q("page.noAwardOthers") : ""}
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
              onClose={() => setPickedId(null)}
              shared={shared}
              onShare={setShared}
              answered={answered}
              reloadFailed={Boolean(error)}
              onRetry={reload}
            />
          ) : (
            <Empty
              title={q("page.emptyTitle")}
              hint={q("page.emptyHint")}
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

        {phase === "chat" && (
          <BidRoomChat token={token} assistant={<BidSupportAssistant token={token} route={linkRoute} inline />} />
        )}
      </main>
    </div>
  );
}
