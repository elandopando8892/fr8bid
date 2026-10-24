import { useMemo, useRef, useState } from "react";
import {
  ANSWERS,
  RUBRICS,
  confirmSegment,
  explainBidError,
  rubricText,
  segmentProgress,
  segmentsOf,
  windowClosed,
  type Answer,
  type AnswerKey,
  type BookLane,
  type RubricKey,
} from "./bidroom.service";
import { ErrorBanner, Pill } from "@/components/ui";

type SaveState = "saving" | "saved" | "error";
const SAVE_LABEL: Record<SaveState, string> = { saving: "Guardando…", saved: "Autoguardado", error: "No se guardó" };

/**
 * The business terms of each segment and what the carrier says about each
 * rubro (wireframe 24, under the lanes). Answers save as they are picked, like
 * rateware's lane fit, and go to every lane of the segment. The answers live
 * in the page, which also counts them in "El negocio".
 */
export function SegmentTerms({
  lanes,
  answers,
  onAnswer,
}: {
  lanes: BookLane[];
  /** By `${segment}::${rubro}`: what the server has, overlaid with what was picked here. */
  answers: Map<string, Answer>;
  onAnswer: (key: string, answer: Answer) => void;
}) {
  const segments = useMemo(() => segmentsOf(lanes), [lanes]);
  const [state, setState] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState<string | null>(null);
  // One save at a time per segment, so a quick change of mind can't land first.
  const chains = useRef(new Map<string, Promise<void>>());
  const inFlight = useRef(new Map<string, number>());

  const answerOf = (segment: string, rubric: RubricKey): Answer =>
    answers.get(`${segment}::${rubric}`) ?? { answer: "pending", comment: "" };

  function save(segment: { key: string; lanes: BookLane[] }, rows: { rubric_key: RubricKey; answer: AnswerKey; comment: string }[]) {
    inFlight.current.set(segment.key, (inFlight.current.get(segment.key) ?? 0) + 1);
    setState((s) => ({ ...s, [segment.key]: "saving" }));
    setError(null);
    const settle = (outcome: SaveState) => {
      const left = (inFlight.current.get(segment.key) ?? 1) - 1;
      inFlight.current.set(segment.key, left);
      // "Autoguardado" only once the last pending answer is in.
      if (outcome === "error" || left === 0) setState((s) => ({ ...s, [segment.key]: outcome }));
    };
    const previous = chains.current.get(segment.key) ?? Promise.resolve();
    const next = previous
      .then(() => confirmSegment(segment.lanes, segment.key, rows))
      .then(
        () => settle("saved"),
        (e) => {
          settle("error");
          setError(explainBidError(e));
        },
      );
    chains.current.set(segment.key, next);
  }

  function put(segment: string, rubric: RubricKey, answer: Answer) {
    onAnswer(`${segment}::${rubric}`, answer);
  }

  function choose(segment: { key: string; lanes: BookLane[] }, rubric: RubricKey, answer: AnswerKey) {
    const keepsNote = answer === "exception" || answer === "disagree";
    const next = { answer, comment: keepsNote ? answerOf(segment.key, rubric).comment : "" };
    put(segment.key, rubric, next);
    save(segment, [{ rubric_key: rubric, ...next }]);
  }

  if (!segments.length) return null;

  return (
    <>
      {error && <ErrorBanner message={`No se guardó tu respuesta: ${error}`} />}
      {segments.map((segment) => {
        const progress = segmentProgress(segment.key, answers);
        const closed = segment.lanes.every(windowClosed);
        const rubros = RUBRICS.map((r) => ({ ...r, text: rubricText(segment.lanes[0], r.key) }));
        const written = rubros.filter((r) => r.text);
        const blank = rubros.filter((r) => !r.text);
        const blankOpen = blank.filter((r) => answerOf(segment.key, r.key).answer === "pending");
        return (
          <section key={segment.key} className="croom-card">
            <header className="croom-card-head">
              <b className="grow">Términos del segmento · {segment.name}</b>
              {state[segment.key] && (
                <span className={`croom-save ${state[segment.key]}`}>{SAVE_LABEL[state[segment.key]]}</span>
              )}
              <Pill tone={progress.done === progress.total ? "green" : "amber"}>
                {progress.done} DE {progress.total} RUBROS
              </Pill>
            </header>
            <p className="croom-card-note">
              {segment.lanes.length > 1 ? `Aplica a tus ${segment.lanes.length} lanes de este segmento. ` : ""}
              Decir «con excepción» o «no puedo» no te saca del bid: nos dice dónde negociar.
            </p>

            {written.map((rubric) => {
              const current = answerOf(segment.key, rubric.key);
              return (
                <div key={rubric.key} className="croom-rubro">
                  <b>{rubric.label}</b>
                  <p>{rubric.text}</p>
                  <div className="croom-seg" role="group" aria-label={rubric.label}>
                    {ANSWERS.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        disabled={closed}
                        className={current.answer === a.key ? "on" : undefined}
                        aria-pressed={current.answer === a.key}
                        onClick={() => choose(segment, rubric.key, a.key)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  {(current.answer === "exception" || current.answer === "disagree") && (
                    <textarea
                      rows={2}
                      disabled={closed}
                      value={current.comment}
                      placeholder={current.answer === "exception" ? "¿Cuál es la excepción?" : "¿Qué te lo impide?"}
                      onChange={(e) => put(segment.key, rubric.key, { ...current, comment: e.target.value })}
                      onBlur={() =>
                        save(segment, [{ rubric_key: rubric.key, answer: current.answer, comment: current.comment }])
                      }
                    />
                  )}
                </div>
              );
            })}

            {blank.length > 0 && (
              <div className="croom-rubro blank">
                <span>
                  Sin requisitos declarados: {blank.map((r) => r.label).join(", ")}.
                </span>
                {blankOpen.length > 0 ? (
                  <button
                    type="button"
                    disabled={closed}
                    onClick={() => {
                      const rows = blankOpen.map((r) => ({ rubric_key: r.key, answer: "not_applicable" as const, comment: "" }));
                      rows.forEach((r) => put(segment.key, r.rubric_key, { answer: r.answer, comment: "" }));
                      save(segment, rows);
                    }}
                  >
                    Marcar como no aplica
                  </button>
                ) : (
                  <Pill>
                    {blank.every((r) => answerOf(segment.key, r.key).answer === "not_applicable") ? "NO APLICAN" : "RESPONDIDOS"}
                  </Pill>
                )}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
