import { useCallback, useEffect, useRef, useState } from "react";

export interface SaveState {
  status: "idle" | "saving" | "saved" | "error";
  savedAt: number | null;
  error: string | null;
}

/**
 * Saves a short while after the last change, strictly one save at a time:
 * every save replaces the whole request on the server, and two in flight can
 * interleave there. `flush` saves now and resolves once nothing is pending or
 * on the wire; `close` stops all saving (while a submit runs, and after it).
 */
export function useAutosave(save: () => Promise<unknown>, version: number, enabled: boolean, delay = 1200) {
  const [state, setState] = useState<SaveState>({ status: "idle", savedAt: null, error: null });
  const saveRef = useRef(save);
  const versionRef = useRef(version);
  const savedVersion = useRef(version);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const closed = useRef(false);
  const timer = useRef<number | null>(null);

  saveRef.current = save;
  versionRef.current = version;

  const run = useCallback(async (): Promise<boolean> => {
    // Several callers can wait on one save; each re-checks after it lands.
    while (inFlight.current) await inFlight.current;
    if (closed.current) return false;
    if (versionRef.current === savedVersion.current) return true;
    const target = versionRef.current;
    const attempt = (async () => {
      setState((prev) => ({ ...prev, status: "saving", error: null }));
      try {
        await saveRef.current();
        savedVersion.current = target;
        setState({ status: "saved", savedAt: Date.now(), error: null });
        return true;
      } catch (error) {
        setState((prev) => ({ ...prev, status: "error", error: (error as Error).message }));
        return false;
      }
    })();
    inFlight.current = attempt;
    try {
      return await attempt;
    } finally {
      if (inFlight.current === attempt) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || version === savedVersion.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void run();
    }, delay);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [version, enabled, delay, run]);

  // Closing the tab with unsaved edits asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (enabled && !closed.current && versionRef.current !== savedVersion.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [enabled]);

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    // A save can finish while newer edits arrived; keep going until caught up.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!(await run())) return false;
      if (versionRef.current === savedVersion.current && !inFlight.current) return true;
    }
    return versionRef.current === savedVersion.current;
  }, [run]);

  /** Stop saving; resolves once any save on the wire has landed. */
  const close = useCallback(async () => {
    closed.current = true;
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    while (inFlight.current) await inFlight.current;
  }, []);

  const reopen = useCallback(() => {
    closed.current = false;
  }, []);

  return { state, flush, retry: run, close, reopen };
}

/** "Saved 5 s ago", refreshed every few seconds. */
export function useSecondsSince(timestamp: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timestamp) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [timestamp]);
  return timestamp ? Math.max(0, Math.round((now - timestamp) / 1000)) : null;
}
