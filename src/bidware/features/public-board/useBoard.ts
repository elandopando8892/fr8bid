import { useCallback, useEffect, useRef, useState } from "react";
import { movement, movementLabel } from "@/i18n/public-board";
import { loadBoard, type BoardRow, type BoardSummary } from "./publicBoard.service";

export type MovementKind = "quote" | "new" | "closing" | "awarded" | "expired";

export interface Movement {
  key: string;
  kind: MovementKind;
  label: string;
  eventId: string;
  /** When it happened, if the server says so; otherwise when it was seen. */
  at: string;
}

const route = (row: BoardRow) => `${row.lane?.origin?.split(",")[0] ?? "—"} → ${row.lane?.destination?.split(",")[0] ?? "—"}`;

/** What moved between two reads of the board. Carrier identity never enters. */
function diff(previous: Map<string, BoardRow>, rows: BoardRow[]): Movement[] {
  const now = new Date().toISOString();
  const out: Movement[] = [];
  for (const row of rows) {
    const eventId = row.event_id;
    const before = previous.get(row.id);
    if (!before) {
      out.push({ key: `new-${row.id}`, kind: "new", label: `Nueva oportunidad · ${route(row)}`, eventId, at: now });
      continue;
    }
    if ((row.quote_count ?? 0) > (before.quote_count ?? 0)) {
      out.push({
        key: `quote-${row.id}-${row.quote_count}`,
        kind: "quote",
        label: `Nueva oferta · ${route(row)}`,
        eventId,
        at: row.last_quote_at ?? now,
      });
    }
    if (row.board_status !== before.board_status) {
      if (row.board_status === "closing") out.push({ key: `closing-${row.id}`, kind: "closing", label: `Cierra hoy · ${route(row)}`, eventId, at: now });
      if (row.board_status === "awarded") out.push({ key: `awarded-${row.id}`, kind: "awarded", label: `Adjudicada · ${route(row)}`, eventId, at: now });
      if (row.board_status === "expired") out.push({ key: `expired-${row.id}`, kind: "expired", label: `Cerró · ${route(row)}`, eventId, at: now });
    }
  }
  return out;
}

/** Before anything moves, the feed shows the latest offers the board already knows about. */
function recentQuotes(rows: BoardRow[]): Movement[] {
  return rows
    .filter((r) => r.last_quote_at)
    .sort((a, b) => String(b.last_quote_at).localeCompare(String(a.last_quote_at)))
    .slice(0, 6)
    .map((r) => ({
      key: `last-${r.id}`,
      kind: "quote" as const,
      label: `Oferta · ${route(r)}`,
      eventId: r.event_id,
      at: String(r.last_quote_at),
    }));
}

/** A short tone per kind of movement, when the viewer turned sound on. */
function chime(context: AudioContext, kind: MovementKind) {
  const tones: Record<MovementKind, number[]> = {
    quote: [880],
    new: [660, 880],
    closing: [520, 520],
    awarded: [660, 990],
    expired: [440],
  };
  tones[kind].forEach((frequency, i) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime + i * 0.16);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + i * 0.16 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + i * 0.16 + 0.14);
    osc.connect(gain).connect(context.destination);
    osc.start(context.currentTime + i * 0.16);
    osc.stop(context.currentTime + i * 0.16 + 0.15);
  });
}

/** While the tab is hidden the board is read at most this often, and only to send notifications. */
const HIDDEN_EVERY_MS = 60000;

/**
 * The live board: reads it, re-reads it every `refresh_seconds` (with `since`,
 * so an unchanged board costs almost nothing), and turns the differences into
 * the movement feed, a flash on the cards that moved, a chime and, when the
 * viewer asked, a browser notification while the tab is in the background.
 */
export function useBoard({
  autoRefresh,
  sound,
  notify,
  watched,
}: {
  autoRefresh: boolean;
  sound: boolean;
  /** Browser notifications while the tab is hidden (the viewer granted them). */
  notify: boolean;
  /** Events the viewer follows: their movements notify even when others don't. */
  watched: Set<string>;
}) {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [summary, setSummary] = useState<BoardSummary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshSeconds, setRefreshSeconds] = useState(15);
  const since = useRef<string | undefined>(undefined);
  const previous = useRef<Map<string, BoardRow> | null>(null);
  const lastRead = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const live = useRef({ sound, notify, watched });
  live.current = { sound, notify, watched };

  const read = useCallback(async (full = false) => {
    lastRead.current = Date.now();
    try {
      const res = await loadBoard(full ? undefined : since.current);
      setCheckedAt(new Date());
      setError(null);
      if (res.refresh_seconds) setRefreshSeconds(Math.max(10, res.refresh_seconds));
      if (res.not_modified) return;
      const next = res.rows ?? [];
      since.current = res.generated_at;
      if (previous.current) {
        const moved = diff(previous.current, next);
        if (moved.length) {
          setMovements((list) => [...moved, ...list.filter((m) => !m.key.startsWith("last-"))].slice(0, 12));
          const now = Date.now();
          setPulses((p) => ({ ...p, ...Object.fromEntries(moved.map((m) => [m.eventId, now])) }));
          const { sound: withSound, notify: withNotice, watched: followed } = live.current;
          if (withSound && audio.current) chime(audio.current, moved[0].kind);
          if (withNotice && document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
            const mine = moved.filter((m) => followed.has(m.eventId));
            const lead = movementLabel((mine[0] ?? moved[0]).label);
            new Notification(mine.length ? movement("followedTitle") : movement("title"), {
              body: moved.length > 1 ? movement("more", lead, moved.length - 1) : lead,
              tag: "bidware-board",
            });
          }
        }
      } else {
        setMovements(recentQuotes(next));
      }
      previous.current = new Map(next.map((r) => [r.id, r]));
      setRows(next);
      setSummary(res.summary ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    read(true);
  }, [read]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") read();
      // In the background only notifications need the board, and not every 15 s.
      else if (live.current.notify && Date.now() - lastRead.current >= HIDDEN_EVERY_MS) read();
    }, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refreshSeconds, read]);

  /**
   * Browsers only play sound after a click, so this runs from the "Sonido"
   * button (with a test tone) or, silently, from the viewer's first click.
   */
  const armSound = useCallback((silent = false) => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio.current ??= new Ctx();
    audio.current.resume().catch(() => undefined);
    if (!silent) chime(audio.current, "quote");
  }, []);

  return { rows, summary, movements, pulses, loading, error, checkedAt, refreshSeconds, reload: () => read(true), armSound };
}
