import { tr } from "@/i18n/quotedesk";
import { useLang } from "@/i18n/language";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "@/components/ui";
import { VISIBILITY_MODES, createEvent, importLanes, type LaneDraft } from "@/features/rfx-admin/newEvent.service";
import { linkBidRoomEvent, type Quote, type QuoteLane } from "./quotedesk.service";

const KINDS = [
  { key: "spot", label: "Spot", get hint() { return tr("text107"); } },
  { key: "bid", label: "Mini-bid", get hint() { return tr("text108"); } },
] as const;

function laneDraft(lane: QuoteLane, quote: Quote): LaneDraft {
  return {
    lane_number: lane.lane_number,
    origin: lane.origin ?? undefined,
    origin_city: lane.origin_city,
    origin_state: lane.origin_state,
    origin_country: lane.origin_country,
    origin_market: lane.origin_market,
    origin_region: lane.origin_region,
    destination: lane.destination ?? undefined,
    destination_city: lane.destination_city,
    destination_state: lane.destination_state,
    destination_country: lane.destination_country,
    destination_market: lane.destination_market,
    destination_region: lane.destination_region,
    equipment: lane.equipment ?? undefined,
    trailer: lane.trailer ?? undefined,
    config: lane.config,
    operation: lane.operation ?? undefined,
    service: lane.service ?? undefined,
    weekly_volume: lane.weekly_volume === null ? null : Number(lane.weekly_volume),
    currency: quote.currency,
    // Our cost estimate is not a target for carriers: target_rate stays empty.
    notes: [lane.notes, tr("text109", quote.folio, lane.lane_number)].filter(Boolean).join(" · "),
  };
}

/**
 * Creates the Bid Room event from the quote in three retry-safe steps (event,
 * routes, link). Nothing is sent to carriers here: invitations still go through
 * Carrier Fit, Message and the Delivery queue of the new event.
 */
export function LaunchBidRoomDialog({
  quote,
  lanes,
  initialKind,
  onClose,
  onLaunched,
}: {
  quote: Quote;
  lanes: QuoteLane[];
  /** Which kind the button that opened this asked for; otherwise guessed from the routes. */
  initialKind?: "spot" | "bid";
  onClose: () => void;
  onLaunched: () => void;
}) {
  useLang();
  const [kind, setKind] = useState<"spot" | "bid">(initialKind ?? (lanes.length > 1 ? "bid" : "spot"));
  const [name, setName] = useState(`${quote.shipper_name ?? "Shipper"} · ${quote.folio}`);
  const [dueDate, setDueDate] = useState("");
  const [visibility, setVisibility] = useState("anonymous_rank");
  const [eventId, setEventId] = useState<string | null>(quote.rfx_event_id);
  const [rfxLanes, setRfxLanes] = useState<{ id: string; lane_number: number }[] | null>(null);
  const [step, setStep] = useState<"form" | "working" | "done">("form");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setStep("working");
    setError(null);
    try {
      let id = eventId;
      if (!id) {
        setProgress(tr("text110"));
        const event = await createEvent({
          name: name.trim() || quote.folio,
          customer: quote.shipper_name ?? undefined,
          customer_id: quote.shipper_id,
          event_type: kind,
          bid_visibility_mode: visibility,
          due_date: dueDate || null,
          notes: tr("text111", quote.folio),
        });
        id = event.id;
        setEventId(id);
      }
      let created = rfxLanes;
      if (!created) {
        setProgress(tr("text112", lanes.length));
        const result = await importLanes(id, lanes.map((lane) => laneDraft(lane, quote)));
        created = ((result.rows ?? []) as { id: string; lane_number: number }[]).map((r) => ({
          id: r.id,
          lane_number: Number(r.lane_number),
        }));
        if (created.length !== lanes.length) {
          throw new Error(
            tr("text113", created.length, lanes.length),
          );
        }
        setRfxLanes(created);
      }
      setProgress(tr("text114"));
      const byNumber = new Map(created.map((r) => [r.lane_number, r.id]));
      await linkBidRoomEvent({
        quote_id: quote.id,
        rfx_event_id: id,
        lane_links: lanes
          .filter((lane) => byNumber.has(lane.lane_number))
          .map((lane) => ({ quote_lane_id: lane.id, rfx_lane_id: byNumber.get(lane.lane_number) as string })),
      });
      setStep("done");
      onLaunched();
    } catch (e) {
      setError((e as Error).message);
      setStep("form");
    }
  }

  if (step === "done" && eventId) {
    return (
      <Dialog title={tr("text115")} onClose={onClose} footer={<button onClick={onClose}>{tr("text116")}</button>}>
        <p>
          {tr("text117")}{lanes.length} {tr("text118")}</p>
        <Link to={`/rfx/${eventId}`} className="btn primary">
          {tr("text119")}</Link>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={tr("text120")}
      onClose={step === "working" ? () => undefined : onClose}
      footer={
        <>
          <button onClick={onClose} disabled={step === "working"}>
            {tr("text002")}</button>
          <button className="primary" disabled={step === "working" || !lanes.length} onClick={launch}>
            {step === "working" ? progress || tr("text121") : eventId ? tr("text122") : tr("text123")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <p className="qd-muted" style={{ margin: 0 }}>
          {tr("text124")}{lanes.length} {tr("text125")}{quote.folio}{tr("text126")}</p>
        <div className="qd-segmented">
          {KINDS.map((k) => (
            <button key={k.key} className={kind === k.key ? "active" : undefined} disabled={Boolean(eventId)} onClick={() => setKind(k.key)}>
              {k.label}
            </button>
          ))}
        </div>
        <p className="qd-muted qd-small" style={{ margin: 0 }}>
          {KINDS.find((k) => k.key === kind)?.hint}
        </p>
        <label className="field">
          <span>{tr("text127")}</span>
          <input value={name} disabled={Boolean(eventId)} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="qd-two">
          <label className="field">
            <span>{tr("text128")}</span>
            <input type="date" value={dueDate} disabled={Boolean(eventId)} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="field">
            <span>{tr("text129")}</span>
            <select value={visibility} disabled={Boolean(eventId)} onChange={(e) => setVisibility(e.target.value)}>
              {VISIBILITY_MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {eventId && !error && <p className="qd-muted qd-small">{tr("text130")}</p>}
        {error && <p className="qd-error">{error}</p>}
      </div>
    </Dialog>
  );
}
