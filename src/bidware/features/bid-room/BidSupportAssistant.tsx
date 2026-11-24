import { useEffect, useRef, useState } from "react";
import { askBidSupport, explainBidError, type SupportReply } from "./bidroom.service";
import { confirmAsync } from "@/components/confirm";
import { useLang } from "@/i18n/language";
import { msg } from "@/i18n/bid-room-messages";

/**
 * Bid Room assistant — the carrier's "ask about this opportunity" box.
 *
 * Asking answers from the event, invited lanes, visible rules and ranking;
 * nothing reaches MARKSMAN. "Enviar al equipo" turns the same question into a
 * support ticket: it is posted to the team's Google Chat and appears in the
 * carrier's profile support log. Before this, carriers invited through Bidware
 * had no way to open a ticket — only rateware's Bid Room had the box.
 */
/**
 * `inline`: inside Mensajes, always open and without the floating bar (decision of Jose, 6-nov:
 * one place to ask, the assistant on top and the conversation with the team below).
 */
export function BidSupportAssistant({ token, route, inline = false }: { token: string; route?: string; inline?: boolean }) {
  useLang();
  const [openState, setOpen] = useState(false);
  const open = inline || openState;
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [reply, setReply] = useState<SupportReply | null>(null);
  const [busy, setBusy] = useState<"ask" | "ticket" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && !inline) window.setTimeout(() => input.current?.focus(), 40);
  }, [open, inline]);

  const starters = [
    msg("ai.starterSummary"),
    route ? msg("ai.starterRoute", route) : msg("ai.starterThisRoute"),
    msg("ai.starterRanking"),
    msg("ai.starterModel"),
    msg("ai.starterAlternative"),
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
    const ok = await confirmAsync(msg("ai.ticketConfirm", asked), { ok: msg("ai.sendToTeam") });
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
      {!inline && <div className="croom-assist">
        <div className="grow">
          <b>{msg("ai.barTitle")}</b>
          <span>{msg("ai.barText")}</span>
        </div>
        <button type="button" className="primary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? msg("ai.close") : msg("ai.ask")}
        </button>
      </div>}
      {open && (
        <div className={`support-assistant ${inline ? "inline" : "open"}`}>
          <section className="support-panel" role="dialog" aria-label={msg("ai.dialog")}>
            <header className="support-head">
              <div>
                <p className="support-eyebrow">{msg("ai.eyebrow")}</p>
                <h3>{msg("ai.heading")}</h3>
                <p className="support-help ayuda">{msg("ai.help")}</p>
              </div>
              {!inline && (
                <button type="button" onClick={() => setOpen(false)} aria-label={msg("ai.closeAria")}>
                  ✕
                </button>
              )}
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
                      <span>{msg("ai.yourQuestion")}</span>
                      <p>{asked}</p>
                    </div>
                  )}
                  <article className={`support-answer${reply.needs_ticket ? " needs-person" : ""}`}>
                    <strong>
                      {reply.intent_label ||
                        (reply.needs_ticket ? msg("ai.needsPerson") : msg("ai.answer"))}
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
                      <p className="support-sent">{msg("ai.sent")}</p>
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
                        {reply.needs_ticket ? msg("ai.needsTeam") : msg("ai.notSolved")}
                      </span>
                      <button
                        type="button"
                        className={reply.needs_ticket ? "primary" : undefined}
                        disabled={busy !== null}
                        onClick={sendToTeam}
                      >
                        {busy === "ticket" ? msg("ai.sending") : msg("ai.sendToTeam")}
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
                placeholder={msg("ai.placeholder")}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
              />
              <button type="submit" className="primary" disabled={!draft.trim() || busy !== null}>
                {busy === "ask" ? "…" : msg("ai.ask")}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
