import { tr } from "@/i18n/common";
import { useLang, locale, formatCurrency } from "@/i18n/language";
import type { ReactNode } from "react";

export function Spinner({ label }: { label?: string }) {
  useLang();
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 12, padding: 40 }}>
      <div className="spinner" />
      {label && <span style={{ color: "var(--muted)" }}>{label}</span>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  useLang();
  return (
    <div className="banner error">
      <b>Error</b>
      <span>{message}</span>
    </div>
  );
}

export function InfoBanner({ title, children }: { title?: string; children: ReactNode }) {
  useLang();
  return (
    <div className="banner info">
      {title && <b>{title}</b>}
      <span>{children}</span>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  useLang();
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint && <p style={{ margin: "6px 0 0" }}>{hint}</p>}
    </div>
  );
}

type Tone = "" | "green" | "orange" | "blue" | "amber" | "red" | "violet" | "indigo" | "dark";

export function Pill({ tone = "", children }: { tone?: Tone; children: ReactNode }) {
  useLang();
  return <span className={tone ? `pill ${tone}` : "pill"}>{children}</span>;
}

/** Event/lane status -> brand tone. Keeps colour meaning consistent app-wide. */
const STATUS_TONE: Record<string, Tone> = {
  draft: "amber",
  borrador: "amber",
  open: "green",
  live: "green",
  operate: "green",
  active: "green",
  launch: "blue",
  closed: "",
  cerrado: "",
  awarded: "indigo",
  archived: "",
  expired: "red",
};

/** An event's own statuses, in the team's words (the event list says the same). */
const STATUS_LABEL: Record<string, string> = {
  get draft() { return tr("text033"); },
  get open() { return tr("text034"); },
  get closed() { return tr("text035"); },
  get awarded() { return tr("text036"); },
  get archived() { return tr("text037"); },
};

export function StatusPill({ status }: { status?: string }) {
  useLang();
  const key = String(status || "").toLowerCase();
  return <Pill tone={STATUS_TONE[key] ?? ""}>{STATUS_LABEL[key] ?? (status || "—").toUpperCase()}</Pill>;
}

/**
 * Where a bid event came from, as quotedesk-api's event_origins reports it.
 * rateware's Ratebook sync stamps a project and a package on every event, so
 * the event's own source_* columns can't tell the origins apart.
 */
export function OriginPill({ origin, folio }: { origin?: string | null; folio?: string | null }) {
  useLang();
  if (origin === "quotedesk") return <Pill tone="orange">{folio ? `QUOTEDESK · ${folio}` : "QUOTEDESK"}</Pill>;
  if (origin === "magic") return <Pill tone="blue">MAGIC LINK</Pill>;
  if (origin === "manual") return <Pill tone="violet">{tr("text038")}</Pill>;
  return <Pill>…</Pill>;
}

export function Kpis({ items }: { items: { label: string; value: ReactNode; accent?: boolean }[] }) {
  useLang();
  return (
    <div className="kpis">
      {items.map((k) => (
        <div key={k.label}>
          <span>{k.label}</span>
          <strong className={k.accent ? "accent" : undefined}>{k.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function TopBar({
  crumb,
  title,
  sub,
  actions,
}: {
  crumb?: string;
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  useLang();
  // Signing out lives with the account at the foot of the sidebar (wireframe 01).
  return (
    <header className="topbar">
      <div>
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="spacer" />
      {actions}
    </header>
  );
}

export function Dialog({
  title,
  ariaLabel,
  onClose,
  children,
  footer,
  width = 640,
}: {
  title: string;
  ariaLabel?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useLang();
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(32,36,43,0.65)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        zIndex: 50,
      }}
    >
      <div
        className="card"
        role={ariaLabel ? "dialog" : undefined}
        aria-label={ariaLabel}
        aria-modal={ariaLabel ? true : undefined}
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px,100%)`, maxHeight: "90vh", overflow: "auto", padding: 24 }}
      >
        <div className="row" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2>
          <div className="spacer" />
          <button onClick={onClose}>{tr("text039")}</button>
        </div>
        {children}
        {footer && (
          <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function money(n: unknown, currency = "USD"): string {
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  return formatCurrency(value, currency, {
    maximumFractionDigits: 0,
  });
}

export function dateShort(v: unknown): string {
  if (!v) return "—";
  // A calendar date ("2026-10-15", or that date at UTC midnight) is not an
  // instant: parsed as UTC it renders a day early west of Greenwich.
  const day = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00(?::?00)?)?)?$/.exec(String(v));
  const d = day ? new Date(+day[1], +day[2] - 1, +day[3]) : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(locale(), { day: "2-digit", month: "short", year: "numeric" });
}
