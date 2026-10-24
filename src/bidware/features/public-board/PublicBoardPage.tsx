import { words, tr, movementLabel } from "@/i18n/public-board";
import { useAuth } from "@/auth/AuthContext";
import { useTeamBoardLanguage, useLang, getLang } from "@/i18n/language";
import { useEffect, useMemo, useState } from "react";
import { ErrorBanner, Empty, InfoBanner, Spinner } from "@/components/ui";
import { useBoard, type Movement } from "./useBoard";
import { EventCards, Pipeline, Sheet, ago, clock, type Actions } from "./BoardViews";
import { BoardSide } from "./BoardSide";
import { FindInvitationsDialog, RequestAccessDialog, readAccess, type Access } from "./AccessDialogs";
import { equipmentOf, groupByEvent, loads, matches, weeklyLoads, type BoardEvent } from "./publicBoard.service";

/**
 * Public Bid Room board (wireframe 10, pushed further so carriers stay and
 * come back): every open, closing, awarded and expired opportunity, live,
 * with no carrier identity. Anyone can look; to quote, a carrier needs its
 * private invitation or asks for one here.
 *
 * Served at /board and at /bid-room-board.html, the address rateware's pages
 * link to.
 */

type View = "cards" | "pipeline" | "sheet";
const VIEWS: { key: View; label: string }[] = [
  { key: "cards", label: "Cards" },
  { key: "pipeline", label: "Pipeline" },
  { key: "sheet", label: "Spreadsheet" },
];

/** Per-browser preferences; a private window just starts from the defaults. */
function pref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function keep(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered */
  }
}
function readWatched(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem("bidware.board.watch") || "[]");
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}

const MOVEMENT_TONE: Record<Movement["kind"], string> = {
  quote: "blue",
  new: "orange",
  closing: "amber",
  awarded: "green",
  expired: "",
};

/** Quick filters: an equipment, the quiet lanes, the followed events. */
type Chip = { key: string; label: string };
const QUIET = "__quiet";
const FOLLOWED = "__followed";

export function PublicBoardPage() {
  useLang();
  const { authenticated } = useAuth();
  useTeamBoardLanguage(authenticated);
  const [view, setView] = useState<View>(() => pref("bidware.board.view", "cards", ["cards", "pipeline", "sheet"]));
  const [sound, setSound] = useState(() => pref("bidware.board.sound", "off", ["on", "off"]) === "on");
  const [notify, setNotify] = useState(
    () => pref("bidware.board.notify", "off", ["on", "off"]) === "on" && "Notification" in window && Notification.permission === "granted",
  );
  const [auto, setAuto] = useState(() => pref("bidware.board.auto", "on", ["on", "off"]) === "on");
  const [watched, setWatched] = useState<Set<string>>(readWatched);
  const [query, setQuery] = useState("");
  const [chips, setChips] = useState<Set<string>>(new Set());
  const [access, setAccess] = useState<Access | null>(readAccess);
  const [requesting, setRequesting] = useState<{ event: BoardEvent; laneId?: string } | null>(null);
  const [finding, setFinding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const board = useBoard({ autoRefresh: auto, sound, notify, watched });
  const { armSound } = board;

  // The countdowns tick to the second while the page is in view.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Sound left on from a previous visit starts with the viewer's first click.
  useEffect(() => {
    if (!sound) return;
    const arm = () => armSound(true);
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, [sound, armSound]);

  const equipment: Chip[] = useMemo(
    () => [...new Set(board.rows.map(equipmentOf).filter(Boolean))].sort().map((e) => ({ key: e, label: e })),
    [board.rows],
  );

  const rows = useMemo(() => {
    const picked = [...chips].filter((c) => c !== QUIET && c !== FOLLOWED);
    return board.rows.filter(
      (r) =>
        matches(r, query) &&
        (!picked.length || picked.includes(equipmentOf(r))) &&
        (!chips.has(QUIET) || (r.quote_count != null && r.quote_count <= 2 && r.is_bid_available)) &&
        (!chips.has(FOLLOWED) || watched.has(r.event_id)),
    );
  }, [board.rows, query, chips, watched]);

  // Followed events go first; within each group the board's own order.
  const events = useMemo(() => {
    const all = groupByEvent(rows);
    return [...all.filter((e) => watched.has(e.id)), ...all.filter((e) => !watched.has(e.id))];
  }, [rows, watched]);

  const liveRows = board.rows.filter((r) => r.board_status === "live" || r.board_status === "closing");
  const liveEvents = new Set(liveRows.map((r) => r.event_id)).size;
  const weekly = weeklyLoads(liveRows);
  const summary = board.summary;
  const seconds = board.checkedAt ? Math.max(0, Math.round((now - board.checkedAt.getTime()) / 1000)) : null;

  // The ticker: what moved, plus the live events closing within three days.
  const ticker = useMemo(() => {
    const closing = groupByEvent(liveRows)
      .map((e) => ({ e, t: clock(e.status, e.due_date, now) }))
      .filter(({ t }) => t.urgency === "hot" || t.urgency === "warm")
      .slice(0, 4)
      .map(({ e, t }) => ({ key: `due-${e.id}`, tone: "amber", text: `⏱ ${t.text} · ${e.name}` }));
    const moved = board.movements.map((m) => ({ key: m.key, tone: MOVEMENT_TONE[m.kind], text: `${movementLabel(m.label)} · ${ago(m.at)}` }));
    return [...moved, ...closing];
    // The clock text is refreshed with the board, not every second: a marquee that re-renders each tick restarts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getLang(), board.movements, board.rows]);

  function toggleWatch(id: string) {
    setWatched((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      keep("bidware.board.watch", JSON.stringify([...next]));
      return next;
    });
  }

  async function toggleNotify() {
    if (notify) {
      setNotify(false);
      keep("bidware.board.notify", "off");
      return;
    }
    if (!("Notification" in window)) {
      setNotice(tr("text101"));
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") {
      setNotify(true);
      keep("bidware.board.notify", "on");
      setNotice(tr("text102"));
    } else {
      setNotice(tr("text103"));
    }
  }

  const actions: Actions = {
    invitedEvents: new Set(access?.eventIds ?? []),
    invitedLanes: new Set(access?.laneIds ?? []),
    watched,
    pulses: board.pulses,
    now,
    onRequest: (event, laneId) => setRequesting({ event, laneId }),
    onRecover: () => setFinding(true),
    onWatch: toggleWatch,
  };

  const chipList: Chip[] = [
    ...equipment,
    { key: QUIET, label: tr("text104") },
    ...(watched.size ? [{ key: FOLLOWED, label: tr("text105", watched.size) }] : []),
  ];

  return (
    <div className="pb">
      <header className="pb-top">
        <div>
          <div className="pb-brand">
            <span className="dot" />
            BIDWARE
          </div>
          <p>{tr("text106")}</p>
        </div>
        <div className="spacer" />
        <span className={`pb-live${auto ? "" : " paused"}`} title={tr("text107")}>
          <i />
          {auto ? tr("text108") : tr("text109")}
          {seconds !== null && <small>{seconds < 5 ? words("word2") : tr("text110", seconds)}</small>}
        </span>
        <button
          type="button"
          className="pb-ghost"
          aria-pressed={sound}
          title={tr("text111")}
          onClick={() => {
            const next = !sound;
            setSound(next);
            keep("bidware.board.sound", next ? "on" : "off");
            if (next) armSound();
          }}
        >
          {sound ? tr("text112") : tr("text113")}
        </button>
        <button type="button" className="pb-ghost" aria-pressed={notify} onClick={toggleNotify}>
          {notify ? tr("text114") : tr("text115")}
        </button>
        <button type="button" className="primary" onClick={() => setFinding(true)}>
          {access ? tr("text116", access.email) : tr("text020")}
        </button>
      </header>

      <section className="pb-hero">
        <div className="pb-hero-main">
          <span className="pb-eyebrow">{tr("text117")}</span>
          <strong>
            {weekly ? loads(weekly) : summary?.live ?? "—"}
            <small>{weekly ? tr("text118") : tr("text119")}</small>
          </strong>
          <p>
            {summary?.live ?? "—"}{tr("text120")}{liveEvents}{tr("text121")}{liveEvents === 1 ? "" : "s"} ·{" "}
            {summary?.total_quotes ?? "—"}{tr("text122")}</p>
        </div>
        <div className="pb-hero-tiles">
          <div className="accent">
            <span>{tr("text123")}</span>
            <b>{summary?.live ?? "—"}</b>
          </div>
          <div>
            <span>{tr("text086")}</span>
            <b>{summary?.total_quotes ?? "—"}</b>
          </div>
          <div>
            <span>{tr("text060")}</span>
            <b>{summary?.closing ?? "—"}</b>
          </div>
          <div>
            <span>{tr("text062")}</span>
            <b>{summary?.awarded ?? "—"}</b>
          </div>
          <div>
            <span>{tr("text064")}</span>
            <b>{summary?.expired ?? "—"}</b>
          </div>
        </div>
      </section>

      <div className="pb-ticker" aria-label={tr("text124")}>
        <span className="pb-ticker-label">{tr("text125")}</span>
        <div className="pb-ticker-window">
          {ticker.length ? (
            <div className={`pb-ticker-track${ticker.length > 2 ? " run" : ""}`} key={ticker.map((t) => t.key).join("|")}>
              {[...ticker, ...(ticker.length > 2 ? ticker : [])].map((t, i) => (
                <span key={`${t.key}-${i}`} className={`pb-chip ${t.tone}`}>
                  {t.text}
                </span>
              ))}
            </div>
          ) : (
            <span className="pb-empty">{tr("text126")}</span>
          )}
        </div>
      </div>

      <main className="pb-page">
        {notice && <InfoBanner>{notice}</InfoBanner>}
        <div className="pb-toolbar">
          <input
            className="pb-search"
            type="search"
            value={query}
            placeholder={tr("text127")}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="pb-chips">
            {chipList.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`pb-filter${chips.has(c.key) ? " on" : ""}${c.key === QUIET ? " quiet" : ""}`}
                aria-pressed={chips.has(c.key)}
                onClick={() =>
                  setChips((s) => {
                    const next = new Set(s);
                    if (next.has(c.key)) next.delete(c.key);
                    else next.add(c.key);
                    return next;
                  })
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <label className="pb-check">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked);
                keep("bidware.board.auto", e.target.checked ? "on" : "off");
              }}
            />
            Auto-refresh
          </label>
          <div className="pb-seg" role="group" aria-label={tr("text128")}>
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                className={view === v.key ? "on" : undefined}
                aria-pressed={view === v.key}
                onClick={() => {
                  setView(v.key);
                  keep("bidware.board.view", v.key);
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {board.error && <ErrorBanner message={board.error} />}

        {/* The spreadsheet is the power view: it takes the whole width. */}
        <div className={`pb-layout${view === "sheet" ? " wide" : ""}`}>
          <div className="pb-main">
            {board.loading ? (
              <Spinner label={tr("text129")} />
            ) : events.length ? (
              view === "pipeline" ? (
                <Pipeline events={events} actions={actions} />
              ) : view === "sheet" ? (
                <Sheet rows={rows} events={events} actions={actions} />
              ) : (
                <EventCards events={events} actions={actions} />
              )
            ) : (
              <Empty
                title={query || chips.size ? tr("text130") : tr("text131")}
                hint={query || chips.size ? tr("text132") : undefined}
              />
            )}
          </div>
          {view !== "sheet" && (
            <BoardSide
              rows={board.rows}
              events={groupByEvent(board.rows)}
              access={access}
              notify={notify}
              onFind={() => setFinding(true)}
              onNotify={toggleNotify}
            />
          )}
        </div>

        <InfoBanner title={tr("text133")}>
          {tr("text134")}</InfoBanner>
      </main>

      {requesting && (
        <RequestAccessDialog
          event={requesting.event}
          laneId={requesting.laneId}
          onClose={() => setRequesting(null)}
          onFind={() => {
            setRequesting(null);
            setFinding(true);
          }}
        />
      )}
      {finding && <FindInvitationsDialog onClose={() => setFinding(false)} onFound={setAccess} />}
    </div>
  );
}
