import { tr } from "@/i18n/common";
import { useLang } from "@/i18n/language";
import { useEffect, useState } from "react";

/**
 * In-app replacements for window.confirm / window.prompt.
 *
 * Native dialogs can be suppressed: Chrome offers "prevent this page from
 * creating additional dialogs", and embedded browsers block them outright. When
 * that happens confirm() silently returns false, and every guarded write in the
 * app — send, award, merge, archive — becomes a button that does nothing, with
 * no message. These cannot be suppressed.
 */

/** Button wording; defaults to "Continuar" / "Cancelar". */
export interface ConfirmLabels {
  ok?: string;
  cancel?: string;
}

type Request =
  | { kind: "confirm"; message: string; labels?: ConfirmLabels; resolve: (v: boolean) => void }
  | { kind: "prompt"; message: string; value: string; resolve: (v: string | null) => void };

let push: ((r: Request) => void) | null = null;

export function confirmAsync(message: string, labels?: ConfirmLabels): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(false);
    push({ kind: "confirm", message, labels, resolve });
  });
}

export function promptAsync(message: string, value = ""): Promise<string | null> {
  return new Promise((resolve) => {
    if (!push) return resolve(null);
    push({ kind: "prompt", message, value, resolve });
  });
}

/** Mount once, at the root. */
export function ConfirmHost() {
  useLang();
  const [req, setReq] = useState<Request | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    push = (r) => {
      setReq(r);
      if (r.kind === "prompt") setText(r.value);
    };
    return () => {
      push = null;
    };
  }, []);

  if (!req) return null;

  const close = (ok: boolean) => {
    if (req.kind === "confirm") req.resolve(ok);
    else req.resolve(ok ? text : null);
    setReq(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => e.key === "Escape" && close(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(30,30,30,0.55)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        zIndex: 100,
      }}
    >
      <div className="card" style={{ width: "min(520px,100%)", padding: 22, borderColor: "var(--ink)" }}>
        <p style={{ whiteSpace: "pre-line", margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.5 }}>
          {req.message}
        </p>
        {req.kind === "prompt" && (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && close(true)}
            style={{ width: "100%", marginBottom: 16 }}
          />
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button onClick={() => close(false)}>{(req.kind === "confirm" && req.labels?.cancel) || tr("text040")}</button>
          <button className="primary" autoFocus={req.kind === "confirm"} onClick={() => close(true)}>
            {(req.kind === "confirm" && req.labels?.ok) || tr("text041")}
          </button>
        </div>
      </div>
    </div>
  );
}
