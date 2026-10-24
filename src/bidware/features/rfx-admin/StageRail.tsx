import { tr } from "@/i18n/rfx-admin";
import { useLang } from "@/i18n/language";
import type { Stage, StageKey } from "./stages";

const TONE: Record<string, { dot: string; label: string }> = {
  done: { dot: "var(--green)", label: "var(--panel)" },
  current: { dot: "var(--orange)", label: "var(--panel)" },
  locked: { dot: "#3d3d3d", label: "var(--muted2)" },
};

/**
 * The spine. Without it the app is a sidebar of pages and the operator has to
 * remember the sequence; with it the event says where it stands and what is
 * missing before the next step.
 */
export function StageRail({
  stages,
  active,
  onPick,
}: {
  stages: Stage[];
  active: StageKey;
  onPick: (key: StageKey) => void;
}) {
  useLang();
  return (
    <div className="stage-rail">
      {stages.map((s, i) => {
        const tone = TONE[s.state];
        const isActive = s.key === active;
        return (
          <button
            key={s.key}
            className={`stage-cell${isActive ? " active" : ""}`}
            onClick={() => onPick(s.key)}
            title={s.state === "locked" ? tr("text739") : undefined}
          >
            <span className="stage-head">
              <span className="stage-badge" style={{ background: tone.dot }}>
                {s.state === "done" ? "✓" : String(i + 1)}
              </span>
              <span className="stage-label" style={{ color: tone.label }}>
                {s.label}
              </span>
            </span>
            <span className="stage-state">
              {s.state === "done" ? tr("text740") : s.state === "current" ? tr("text517") : tr("text741")}
            </span>
            <span className="stage-note">{s.note}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The same check as GatePanel in one line, for the stages that take the full
 * width (wireframes 08 and 03).
 */
export function GateStrip({ stage, next }: { stage: Stage; next?: Stage }) {
  useLang();
  const pending = stage.gates.filter((g) => !g.ok).length;
  return (
    <div className={`gate-strip${pending ? "" : " ready"}`}>
      <span className="gate-strip-title">{next ? tr("text742", next.label.toUpperCase()) : tr("text743")}</span>
      {stage.gates.map((g) => (
        <span key={g.label} className={g.ok ? "ok" : "missing"}>
          <b>{g.ok ? "✓" : "✕"}</b> {g.label}
        </span>
      ))}
      <span className="gate-strip-verdict">
        {pending ? tr("text744", pending === 1 ? "" : "n", pending) : tr("text745", next?.label ?? "cerrar")}
      </span>
    </div>
  );
}

/**
 * What is missing before the next stage (wireframe 19). Never blocks a write,
 * it informs one: the stage moves on by itself once its conditions are met.
 */
export function GatePanel({ stage, next }: { stage: Stage; next?: Stage }) {
  useLang();
  const pending = stage.gates.filter((g) => !g.ok).length;
  const goal = next ? tr("text746", next.label.toUpperCase()) : tr("text747");
  return (
    <aside className="gate">
      <div className="gate-title">{tr("text748")}{goal}</div>
      {stage.gates.map((g) => (
        <div key={g.label} className="gate-row">
          <span style={{ color: g.ok ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
            {g.ok ? "✓" : "✕"}
          </span>
          <span style={{ color: g.ok ? "var(--ink)" : "var(--grey)" }}>{g.label}</span>
        </div>
      ))}
      <div className={`gate-status${pending ? "" : " ready"}`}>
        {pending
          ? tr("text749", next ? tr("text750", next.label) : tr("text399"), pending === 1 ? "" : "n", pending)
          : next
            ? tr("text745", next.label)
            : tr("text751")}
      </div>
      <p className="gate-foot">
        {pending
          ? tr("text752")
          : tr("text753")}
      </p>
    </aside>
  );
}
