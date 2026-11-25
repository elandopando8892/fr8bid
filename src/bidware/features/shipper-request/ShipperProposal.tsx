import { useState } from "react";
import { confirmAsync } from "@/components/confirm";
import { ErrorBanner } from "@/components/ui";
import type { Copy } from "./request.copy";
import type { Lang, ProposalLane, RequestProgress, RequestProposal } from "./request.model";
import { acceptLanes, afterAccept, canAccept, pendingLanes, reconcile } from "./proposal.flow";
import { acceptProposal, explainRequestError, loadRequest } from "./request.service";

const money = (value: number | null, currency: string, lang: Lang) =>
  value === null ? "—" : `${value.toLocaleString(lang === "es" ? "es-MX" : "en-US", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })} ${currency}`;

const dateShort = (value: string | null | undefined, lang: Lang) => {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { day: "2-digit", month: "short", year: "numeric" });
};

const route = (lane: ProposalLane) => `${lane.origin || "—"} → ${lane.destination || "—"}`;

/** Received, out to carriers, proposal, accepted: where the request is, in four steps. */
export function RequestSteps({ progress, copy, lang }: { progress: RequestProgress; copy: Copy; lang: Lang }) {
  const order = ["received", "bidding", "proposal", "accepted"] as const;
  const at = progress.stage === "evaluating" ? 1 : Math.max(0, order.indexOf(progress.stage as (typeof order)[number]));
  const bidding = progress.bidding;
  const steps = [
    { label: copy.stepReceived, note: dateShort(progress.submitted_at, lang) },
    {
      label: copy.stepBidding,
      note: bidding ? (progress.stage === "bidding" ? copy.biddingNow(bidding.carriers_quoted, bidding.lanes) : at === 1 ? copy.biddingClosed : "") : "",
    },
    { label: copy.stepProposal, note: dateShort(progress.proposal_published_at, lang) },
    { label: copy.stepAccepted, note: "" },
  ];
  return (
    <section className="card sr-steps" aria-label={copy.progressTitle}>
      <ol>
        {steps.map((step, index) => (
          <li key={step.label} className={index < at || progress.stage === "accepted" ? "done" : index === at ? "now" : ""} aria-current={index === at ? "step" : undefined}>
            <span className="sr-step-dot" aria-hidden="true">{index < at || progress.stage === "accepted" ? "✓" : index + 1}</span>
            <span>
              <b>{step.label}</b>
              {step.note && <small>{step.note}</small>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

async function downloadProposal(proposal: RequestProposal, copy: Copy, lang: Lang, title: string) {
  const XLSX = await import("xlsx");
  const accepted = new Set(proposal.accepted.map((row) => row.rfx_lane_id));
  const rows = [
    [copy.colLane, lang === "es" ? "Origen" : "Origin", lang === "es" ? "Destino" : "Destination", copy.colEquipment, copy.colVolume, copy.colRate, lang === "es" ? "Moneda" : "Currency", copy.accepted],
    ...proposal.lanes.map((lane, index) => [
      lane.lane_number ?? index + 1,
      lane.origin ?? "",
      lane.destination ?? "",
      [lane.equipment, lane.trailer].filter(Boolean).join(" · "),
      lane.weekly_volume ?? "",
      lane.sell_rate ?? "",
      proposal.currency,
      accepted.has(lane.rfx_lane_id) ? (lang === "es" ? "Sí" : "Yes") : "",
    ]),
  ];
  if (proposal.valid_through) rows.push([], [copy.validThrough, proposal.valid_through]);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 6 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 9 }, { wch: 10 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, lang === "es" ? "Propuesta" : "Proposal");
  const name = (title || "propuesta").replace(/[^\w-]+/g, "_").slice(0, 60);
  XLSX.writeFile(book, `${name}-${lang === "es" ? "propuesta" : "proposal"}-v${proposal.version}.xlsx`);
}

/**
 * The sell rate per lane the team published after awarding. The shipper
 * accepts lane by lane or all at once; nothing here names a carrier.
 */
export function ProposalTable({
  token,
  proposal,
  copy,
  lang,
  brand,
  title,
  onChange,
}: {
  token: string;
  proposal: RequestProposal;
  copy: Copy;
  lang: Lang;
  brand: string;
  title: string;
  /** `notice`: why the proposal went away (shown by the page in the table's place). */
  onChange: (proposal: RequestProposal | null, notice: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const accepted = new Map(proposal.accepted.map((row) => [row.rfx_lane_id, row]));
  const pending = pendingLanes(proposal);
  const locked = !canAccept(proposal, busy !== null, unresolved);
  const reload = async () => (await loadRequest(token)).proposal ?? null;

  async function retryRead() {
    if (busy) return;
    setBusy("reload");
    const result = await reconcile(proposal, null, { reload });
    setUnresolved(result.unresolved);
    setBusy(null);
    if (!result.unresolved) {
      setError(null);
      const next = afterAccept(result, (e) => explainRequestError(e, lang, brand), copy.proposalGone);
      onChange(next.proposal, next.notice);
    }
  }

  async function accept(lanes: ProposalLane[], key: string) {
    if (!lanes.length || busy) return;
    const total = lanes.length === 1 ? money(lanes[0].sell_rate, proposal.currency, lang) : "";
    const ok = await confirmAsync(copy.confirmAccept(lanes.length, total), { ok: copy.confirmAcceptOk, cancel: copy.confirmAcceptCancel });
    if (!ok) return;
    setBusy(key);
    setError(null);
    const result = await acceptLanes(proposal, lanes.map((lane) => lane.rfx_lane_id), {
      accept: (proposalId, laneIds) => acceptProposal(token, proposalId, laneIds),
      reload,
    });
    setUnresolved(result.unresolved);
    setBusy(null);
    const next = afterAccept(result, (e) => explainRequestError(e, lang, brand), copy.proposalGone);
    if (next.proposal && result.error) setError(explainRequestError(result.error, lang, brand));
    onChange(next.proposal, next.notice);
  }

  return (
    <section className="card sr-proposal" data-prueba="propuesta-shipper">
      <div className="sr-proposal-head">
        <div>
          <h2>{copy.proposalTitle}</h2>
          <p className="sr-muted">
            {copy.proposalSub}
            {proposal.valid_through && <> · {copy.validThrough} {dateShort(proposal.valid_through, lang)}</>}
          </p>
        </div>
        <button type="button" className="btn" onClick={() => void downloadProposal(proposal, copy, lang, title)}>
          {copy.downloadExcel}
        </button>
      </div>
      {proposal.expired && <ErrorBanner message={copy.expired} />}
      {error && !unresolved && <ErrorBanner message={error} />}
      {unresolved && (
        <div className="sr-proposal-foot" role="alert">
          <ErrorBanner message={copy.unresolved} />
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void retryRead()}>
            {busy === "reload" ? "…" : copy.reload}
          </button>
        </div>
      )}
      <div className="sr-proposal-table">
        <table>
          <thead>
            <tr>
              <th>{copy.colLane}</th>
              <th>{copy.colEquipment}</th>
              <th className="num">{copy.colVolume}</th>
              <th className="num">{copy.colRate}</th>
              <th aria-label={copy.accept} />
            </tr>
          </thead>
          <tbody>
            {proposal.lanes.map((lane, index) => {
              const done = accepted.get(lane.rfx_lane_id);
              return (
                <tr key={lane.rfx_lane_id} className={done ? "done" : ""}>
                  <td>
                    <span className="mono">L{lane.lane_number ?? index + 1}</span> {route(lane)}
                  </td>
                  <td>{[lane.equipment, lane.trailer, lane.service].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="num">
                    {lane.weekly_volume ?? "—"}
                    {lane.weekly_volume !== null && <span className="sr-phone-only"> {copy.volumeShort}</span>}
                  </td>
                  <td className="num mono">
                    <b>{money(lane.sell_rate, proposal.currency, lang)}</b>
                  </td>
                  <td className="sr-proposal-act">
                    {done ? (
                      <span className="pill green">✓ {copy.accepted}</span>
                    ) : (
                      <button type="button" className="btn" disabled={locked} onClick={() => void accept([lane], lane.rfx_lane_id)}>
                        {busy === lane.rfx_lane_id ? "…" : copy.accept}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pending.length > 1 && (
        <div className="sr-proposal-foot">
          <button type="button" className="btn primary" disabled={locked} onClick={() => void accept(pending, "all")}>
            {busy === "all" ? "…" : copy.acceptAll(pending.length)}
          </button>
        </div>
      )}
      {pending.length === 0 && <p className="sr-proposal-done">✓ {copy.allAccepted}</p>}
      <p className="sr-muted">{copy.questions}</p>
    </section>
  );
}
