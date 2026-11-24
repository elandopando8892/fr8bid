import { useState, type ReactNode } from "react";
import { listBidRoomChat, postBidRoomChatMessage, explainBidError } from "./bidroom.service";
import { useAsync } from "@/components/useAsync";
import { Spinner, ErrorBanner, dateShort } from "@/components/ui";
import * as I from "../../../ui/Iconos";
import { locale, useLang } from "@/i18n/language";
import { msg } from "@/i18n/bid-room-messages";

type Row = Record<string, unknown>;

/** Who reads each kind of thread; the carrier writes in its private one. */
const ORDER = ["carrier_private", "lane_group", "event_group"] as const;
type ThreadType = (typeof ORDER)[number];
const threadLabel = (type: string) => ((ORDER as readonly string[]).includes(type) ? msg(`thread.${type as ThreadType}`) : "");

const order = (type: unknown) => (ORDER as readonly string[]).indexOf(String(type));

const when = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : `${dateShort(value)} ${date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}`;
};

/**
 * The carrier's conversations with MARKSMAN about this event, so the
 * negotiation stays attached to the bid instead of scattering into loose
 * emails. rfx-bid-api returns threads (private, lane, event), each with its
 * messages; what the carrier writes goes to its private thread.
 */
export function BidRoomChat({ token, assistant }: { token: string; /** The room's assistant, on top. */ assistant?: ReactNode }) {
  useLang();
  const { data, loading, error, reload } = useAsync(() => listBidRoomChat(token), [token]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const threads = ((data as { rows?: Row[] } | null)?.rows ?? [])
    .filter((thread) => Array.isArray(thread.messages) && (thread.messages as Row[]).length)
    .sort((a, b) => order(a.thread_type) - order(b.thread_type));

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
        {assistant}
        {error && <ErrorBanner message={error} />}
        {sendError && <ErrorBanner message={sendError} />}
        <section className="croom-card">
          <header className="croom-card-head">
            <b className="grow">{msg("chat.title")}</b>
            <button type="button" className="link" disabled={loading} onClick={reload}>
              {loading ? msg("chat.loading") : msg("chat.refresh")}
            </button>
          </header>

          {loading && !data ? (
            <Spinner label={msg("chat.loadingMessages")} />
          ) : threads.length ? (
            threads.map((thread) => (
              <div key={String(thread.id)} className="croom-thread">
                <div className="croom-thread-name">
                  {threadLabel(String(thread.thread_type)) || String(thread.title ?? msg("chat.thread"))}
                </div>
                {(thread.messages as Row[]).map((m, i) => {
                  const mine = String(m.sender_role) === "carrier";
                  return (
                    <div key={String(m.id ?? i)} className={`croom-msg${mine ? " mine" : ""}`}>
                      <div className="croom-msg-head">
                        <b>{String(m.sender_name ?? (mine ? msg("chat.yourCompany") : "MARKSMAN"))}</b>
                        <span className="mono">{when(m.created_at)}</span>
                      </div>
                      <p>{String(m.body ?? "")}</p>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="croom-card-note">{msg("chat.empty")}</p>
          )}

          <div className="croom-compose">
            <textarea
              rows={2}
              value={text}
              placeholder={msg("chat.placeholder")}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="button" className="primary" disabled={!text.trim() || busy} onClick={send}>
              {busy ? msg("chat.sending") : msg("chat.send")}
            </button>
          </div>
        </section>
      </div>

      <aside className="croom-side">
        <div className="croom-eyebrow ayuda">{msg("chat.whoReads")}</div>
        <p className="croom-side-text croom-privado">
          <I.Candado size={15} /> <b>{msg("thread.carrier_private")}</b>
          <span className="ayuda">{msg("chat.privateText")}</span>
        </p>
        <p className="croom-side-text ayuda">
          <b>{msg("chat.groupBold")}</b>{msg("chat.groupText")}
        </p>
        <div className="croom-box ayuda">
          <b>{msg("chat.betterTitle")}</b>
          <p>{msg("chat.betterText")}</p>
        </div>
      </aside>
    </div>
  );
}
