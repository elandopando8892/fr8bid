import { useEffect, useRef, useState } from "react";
import { askBidSupport, explainBidError, type SupportReply } from "./bidroom.service";
import { confirmAsync } from "@/components/confirm";

/**
 * Bid Room assistant — the carrier's "ask about this opportunity" box.
 *
 * Asking answers from the event, invited lanes, visible rules and ranking;
 * nothing reaches MARKSMAN. "Enviar al equipo" turns the same question into a
 * support ticket: it is posted to the team's Google Chat and appears in the
 * carrier's profile support log. Before this, carriers invited through Bidware
 * had no way to open a ticket — only rateware's Bid Room had the box.
 */
export function BidSupportAssistant({ token, route }: { token: string; route?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [reply, setReply] = useState<SupportReply | null>(null);
  const [busy, setBusy] = useState<"ask" | "ticket" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 40);
  }, [open]);

  const starters = [
    "Resumen de la oportunidad",
    route ? `¿Qué detalles tiene ${route}?` : "¿Qué detalles tiene esta ruta?",
    "¿Cómo mejoro mi ranking?",
    "¿Qué modelo comercial debo elegir?",
    "¿Cómo subo una alternativa?",
  ];

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy("ask");
    setError(null);
    try {
      const res = await askBidSupport(token, q);
      setAsked(q);
      setReply(res);
      setDraft("");
    } catch (e) {
      setError(explainBidError(e));
    } finally {
      setBusy(null);
    }
  }

  /** Escalation notifies people, so it is always a deliberate, confirmed step. */
  async function sendToTeam() {
    if (!asked || busy || reply?.ticket?.id) return;
    const ok = await confirmAsync(
      `Tu pregunta se enviará al equipo de MARKSMAN como ticket de soporte:\n\n"${asked}"\n\n` +
        "Te darán seguimiento y podrás verlo en la bitácora de tu perfil de carrier. ¿Enviar?",
    );
    if (!ok) return;
    setBusy("ticket");
    setError(null);
    try {
      const res = await askBidSupport(token, asked, { createTicket: true });
      setReply(res);
    } catch (e) {
      setError(explainBidError(e));
    } finally {
      setBusy(null);
    }
  }

  const sent = Boolean(reply?.ticket?.id);

  return (
    <>
      {/* The room's assistant bar (wireframe 11); the panel floats over the page. */}
      <div className="croom-assist">
        <div className="grow">
          <b>Asistente de la sala</b>
          <span>
            Dudas de acceso, fechas, alcance de lanes o cómo cotizar. Si hace falta una persona, envía tu pregunta al
            equipo.
          </span>
        </div>
        <button type="button" className="primary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : "Preguntar"}
        </button>
      </div>
      {open && (
        <div className="support-assistant open">
          <section className="support-panel" role="dialog" aria-label="Asistente del Bid Room">
            <header className="support-head">
              <div>
                <p className="support-eyebrow">Asistente de puja</p>
                <h3>Pregunta sobre esta oportunidad</h3>
                <p className="support-help">
                  Responde con el evento, tus rutas, las reglas visibles y tu ranking. Si hace falta una
                  persona, envía tu pregunta al equipo.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente">
                ✕
              </button>
            </header>

            <div className="support-body">
              {!reply && (
                <div className="support-chips">
                  {starters.map((s) => (
                    <button key={s} type="button" disabled={busy !== null} onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {reply && (
                <>
                  {asked && (
                    <div className="support-bubble you">
                      <span>Tu pregunta</span>
                      <p>{asked}</p>
                    </div>
                  )}
                  <article className={`support-answer${reply.needs_ticket ? " needs-person" : ""}`}>
                    <strong>
                      {reply.intent_label ||
                        (reply.needs_ticket ? "Requiere seguimiento de una persona" : "Respuesta")}
                    </strong>
                    {(reply.support_highlights ?? []).filter((h) => h.label).length > 0 && (
                      <dl className="support-facts">
                        {(reply.support_highlights ?? [])
                          .filter((h) => h.label)
                          .map((h, i) => (
                            <div key={`${h.label}-${i}`}>
                              <dt>{h.label}</dt>
                              <dd>{h.value || "—"}</dd>
                            </div>
                          ))}
                      </dl>
                    )}
                    {reply.answer && <p className="support-text">{reply.answer}</p>}
                    {(reply.next_steps ?? []).length > 0 && (
                      <ol className="support-steps">
                        {reply.next_steps!.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    )}
                    {sent && (
                      <p className="support-sent">
                        Enviado al equipo de MARKSMAN. Verás su seguimiento en la bitácora de tu perfil de
                        carrier.
                      </p>
                    )}
                  </article>

                  {(reply.suggested_prompts ?? []).length > 0 && (
                    <div className="support-chips">
                      {reply.suggested_prompts!.slice(0, 4).map((s) => (
                        <button key={s} type="button" disabled={busy !== null} onClick={() => ask(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {!sent && (
                    <div className="support-escalate">
                      <span>
                        {reply.needs_ticket
                          ? "Esta pregunta necesita a una persona del equipo."
                          : "¿No resolvió tu duda?"}
                      </span>
                      <button
                        type="button"
                        className={reply.needs_ticket ? "primary" : undefined}
                        disabled={busy !== null}
                        onClick={sendToTeam}
                      >
                        {busy === "ticket" ? "Enviando…" : "Enviar al equipo"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {error && <p className="support-error">{error}</p>}
            </div>

            <form
              className="support-form"
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
            >
              <textarea
                ref={input}
                rows={2}
                value={draft}
                placeholder="Escribe tu pregunta…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
              />
              <button type="submit" className="primary" disabled={!draft.trim() || busy !== null}>
                {busy === "ask" ? "…" : "Preguntar"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
