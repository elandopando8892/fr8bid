import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Dialog, ErrorBanner, InfoBanner, Pill, Spinner, TopBar } from "@/components/ui";
import { confirmAsync } from "@/components/confirm";
import { useLang } from "@/i18n/language";
import { tr, queueError } from "@/i18n/quote-queue";
import { listQuoteQueue, sendQuoteQueueMessage, type QuoteQueueMessage } from "./quotedesk.service";

type Queue = Awaited<ReturnType<typeof listQuoteQueue>>;
function state(row: QuoteQueueMessage) {
  const key = row.status;
  return tr(key === "drafted" || key === "sending" || key === "sent" || key === "failed" || key === "delivery_unknown" || key === "archived" ? key : "blocked");
}

/** The existing delivery queue's quote scope. No RFx event is fabricated. */
export function QuoteDeliveryQueuePage() {
  const { id = "" } = useParams();
  const { user, role } = useAuth();
  return <QuoteDeliveryQueueContent key={`${user?.id ?? "anonymous"}:${role}:${id}`} />;
}

function QuoteDeliveryQueueContent() {
  useLang();
  const { id = "" } = useParams();
  const { user, can, roleLoaded } = useAuth();
  const scope = `${user?.id}:${id}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const active = useRef(true);
  const allowed = useRef(false);
  allowed.current = roleLoaded && can("operate");
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const live = () => active.current && currentScope.current === scope;
  const [data, setData] = useState<Queue | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const failure = actionError || error;
  const refresh = () => { setActionError(null); setTick(value => value + 1); };
  const [notice, setNotice] = useState(false);
  const [selected, setSelected] = useState<QuoteQueueMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => { setSelected(null); setData(null); setOffset(0); setError(null); setActionError(null); setNotice(false); }, [scope]);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setError(null); setData(null); setSelected(null);
    listQuoteQueue(id, offset).then(result => { if (!disposed) { setData(result); setSelected(null); } })
      .catch(e => { if (!disposed) setError(queueError(e)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [scope, id, offset, tick]);
  async function send() {
    if (!live() || !selected || inFlight.current || !allowed.current || loading || failure || !["drafted", "failed"].includes(selected.status)) return;
    inFlight.current = true;
    const message = selected;
    setBusy(true); setActionError(null);
    try {
      const approved = await confirmAsync(tr("confirm", data?.quote.folio, message.recipient_email,
        message.metadata.cc.length ? tr("confirmCc", message.metadata.cc.join(", ")) : "", message.metadata.from), { ok: tr("approve") });
      if (!approved || !live() || !allowed.current) return;
      await sendQuoteQueueMessage(id, message);
      if (live()) { setNotice(true); setSelected(null); }
    } catch (e) { if (live()) setActionError(queueError(e)); }
    finally { inFlight.current = false; if (live()) { setBusy(false); setTick(value => value + 1); } }
  }
  return <>
    <TopBar crumb="QuoteDesk" title={tr("title", data?.quote.folio || "Spot")} actions={<>
      <Link className="btn" to={`/quotedesk/${id}`}>← {tr("back")}</Link>
      <button onClick={refresh} disabled={busy || loading}>{tr("refresh")}</button>
    </>} />
    <main className="main launch-main">
      <InfoBanner>{tr("gate")}</InfoBanner>
      {notice && <InfoBanner>{tr("success")}</InfoBanner>}
      {failure && <ErrorBanner message={failure} />}
      {loading && <Spinner />}
      {!loading && data && <section className="card">
        {!data.rows.length ? <p>{tr("empty")}</p> : <div className="table-wrap"><table>
          <thead><tr><th>{tr("recipient")}</th><th>{tr("subject")}</th><th>{tr("state")}</th><th>{tr("review")}</th></tr></thead>
          <tbody>{data.rows.map(row => <tr key={row.id}>
            <td>{row.recipient_email}<div className="cell-sub">{row.metadata.cc.join(", ")}</div></td>
            <td>{row.subject}</td><td><Pill tone={row.status === "sent" ? "green" : row.status === "failed" ? "red" : ""}>{state(row)}</Pill></td>
            <td><button onClick={() => setSelected(row)} disabled={busy || Boolean(failure)}>{tr("review")}</button></td>
          </tr>)}</tbody>
        </table></div>}
        {data.total > 20 && <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <span>{tr("page", data.total ? offset + 1 : 0, Math.min(offset + data.rows.length, data.total), data.total)}</span>
          <button disabled={offset === 0 || busy} onClick={() => setOffset(value => Math.max(0, value - 20))}>{tr("previous")}</button>
          <button disabled={offset + data.rows.length >= data.total || busy} onClick={() => setOffset(value => value + 20)}>{tr("next")}</button>
        </div>}
      </section>}
      {selected && <Dialog title={tr("snapshot")} ariaLabel={tr("snapshot")} onClose={busy ? () => undefined : () => setSelected(null)} footer={<>
        <button className="primary" onClick={send} disabled={busy || loading || Boolean(failure) || !roleLoaded || !can("operate") || !["drafted", "failed"].includes(selected.status)}>{busy ? tr("sending") : tr("approve")}</button>
      </>}>
        <p>{tr("from")}: {selected.metadata.from}<br />{tr("recipient")}: {selected.recipient_email}<br />{tr("cc")}: {selected.metadata.cc.join(", ") || "—"}<br />{tr("subject")}: {selected.subject}</p>
        <Pill>{state(selected)}</Pill>
        {selected.receipt && <p>{tr("receipt", selected.receipt.id, selected.receipt.attempt)}</p>}
        {["sending", "delivery_unknown"].includes(selected.status) && <InfoBanner>{tr("unknown")}</InfoBanner>}
        {selected.status === "failed" && <InfoBanner>{tr("retry")}</InfoBanner>}
        <iframe className="qd-email-preview" sandbox="" title={tr("preview")} srcDoc={selected.html_body} />
      </Dialog>}
    </main>
  </>;
}
