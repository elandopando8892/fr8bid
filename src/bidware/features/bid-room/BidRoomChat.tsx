import { useState } from "react";
import { listBidRoomChat, postBidRoomChatMessage, explainBidError } from "./bidroom.service";
import { useAsync } from "@/components/useAsync";
import { Spinner, ErrorBanner, dateShort } from "@/components/ui";

type Row = Record<string, unknown>;

/** Who reads each kind of thread; the carrier writes in its private one. */
const THREAD_LABEL: Record<string, string> = {
  carrier_private: "Privado con MARKSMAN",
  lane_group: "Todos los carriers de tu lane",
  event_group: "Todos los carriers del evento",
};
const ORDER = ["carrier_private", "lane_group", "event_group"];

const when = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : `${dateShort(value)} ${date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
};

/**
 * The carrier's conversations with MARKSMAN about this event, so the
 * negotiation stays attached to the bid instead of scattering into loose
 * emails. rfx-bid-api returns threads (private, lane, event), each with its
 * messages; what the carrier writes goes to its private thread.
 */
export function BidRoomChat({ token }: { token: string }) {
  const { data, loading, error, reload } = useAsync(() => listBidRoomChat(token), [token]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const threads = ((data as { rows?: Row[] } | null)?.rows ?? [])
    .filter((thread) => Array.isArray(thread.messages) && (thread.messages as Row[]).length)
    .sort((a, b) => ORDER.indexOf(String(a.thread_type)) - ORDER.indexOf(String(b.thread_type)));

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setSendError(null);
    try {
      await postBidRoomChatMessage(token, { body });
      setText("");
      reload();
    } catch (e) {
      setSendError(explainBidError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="croom-body side-narrow">
      <div className="croom-main">
        {error && <ErrorBanner message={error} />}
        {sendError && <ErrorBanner message={sendError} />}
        <section className="croom-card">
          <header className="croom-card-head">
            <b className="grow">Conversación con MARKSMAN</b>
            <button type="button" className="link" disabled={loading} onClick={reload}>
              {loading ? "Cargando…" : "Actualizar"}
            </button>
          </header>

          {loading && !data ? (
            <Spinner label="Cargando mensajes…" />
          ) : threads.length ? (
            threads.map((thread) => (
              <div key={String(thread.id)} className="croom-thread">
                <div className="croom-thread-name">
                  {THREAD_LABEL[String(thread.thread_type)] ?? String(thread.title ?? "Conversación")}
                </div>
                {(thread.messages as Row[]).map((m, i) => {
                  const mine = String(m.sender_role) === "carrier";
                  return (
                    <div key={String(m.id ?? i)} className={`croom-msg${mine ? " mine" : ""}`}>
                      <div className="croom-msg-head">
                        <b>{String(m.sender_name ?? (mine ? "Tu empresa" : "MARKSMAN"))}</b>
                        <span className="mono">{when(m.created_at)}</span>
                      </div>
                      <p>{String(m.body ?? "")}</p>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="croom-card-note">Sin mensajes todavía. Escribe el primero si tienes dudas del evento.</p>
          )}

          <div className="croom-compose">
            <textarea
              rows={2}
              value={text}
              placeholder="Tu mensaje, privado con MARKSMAN"
              onChange={(e) => setText(e.target.value)}
            />
            <button type="button" className="primary" disabled={!text.trim() || busy} onClick={send}>
              {busy ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </section>
      </div>

      <aside className="croom-side">
        <div className="croom-eyebrow">Quién lee esto</div>
        <p className="croom-side-text">
          <b>Privado con MARKSMAN:</b> lo que escribas aquí solo lo ven tu empresa y el equipo de MARKSMAN, y queda
          ligado a tu invitación.
        </p>
        <p className="croom-side-text">
          <b>Carriers de tu lane o del evento:</b> avisos del equipo para todos los invitados. Lo que tú escribes no
          se publica ahí.
        </p>
        <div className="croom-box">
          <b>Mejor que un correo suelto</b>
          <p>Para dudas de precio o alcance, la respuesta queda junto a tu oferta.</p>
        </div>
      </aside>
    </div>
  );
}
