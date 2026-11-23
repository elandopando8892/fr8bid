import { tr } from "@/i18n/rfx-admin";
import { useLang, getLang } from "@/i18n/language";
import { useMemo, useRef, useState } from "react";
import { confirmAsync } from "@/components/confirm";
import { Dialog, ErrorBanner, InfoBanner } from "@/components/ui";
import { captureManualBid, draftCarrierQuestion, updateRfxLane } from "./rfx.service";
import type { LaneWithInvitations } from "./stages";

type Invitation = Record<string, unknown>;
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const carrierName = (invitation: Invitation) => {
  const vendor = (invitation.vendors ?? {}) as Record<string, unknown>;
  return str(vendor.vendor_name || vendor.domain || invitation.vendor_id) || "Carrier";
};
const laneLabel = (lane: LaneWithInvitations) =>
  `${lane.lane_number ? `#${str(lane.lane_number)} · ` : ""}${str(lane.origin) || "—"} → ${str(lane.destination) || "—"}`;
const statusOf = (invitation: Invitation) => str(invitation.invitation_status).toLowerCase();

/**
 * Lane and carrier, when the action didn't start from a row. Archived
 * invitations are left out; a carrier that declined can still send a bid.
 */
function useInvitationPicker(lanes: LaneWithInvitations[], preset?: { lane: LaneWithInvitations; invitation: Invitation }) {
  const [laneId, setLaneId] = useState(preset ? str(preset.lane.id) : "");
  const [invitationId, setInvitationId] = useState(preset ? str(preset.invitation.id) : "");
  const lane = lanes.find((l) => str(l.id) === laneId) ?? null;
  const choices = (lane?.invitations ?? []).filter((i) => statusOf(i) !== "archived");
  const invitation = choices.find((i) => str(i.id) === invitationId) ?? (preset?.invitation && str(preset.invitation.id) === invitationId ? preset.invitation : null);
  const fields = preset ? null : (
    <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
      <label className="field" style={{ flex: 1 }}>
        <span>Lane</span>
        <select
          value={laneId}
          onChange={(e) => {
            setLaneId(e.target.value);
            setInvitationId("");
          }}
        >
          <option value="">{tr("text262")}</option>
          {lanes.map((l) => (
            <option key={str(l.id)} value={str(l.id)}>
              {laneLabel(l)}
            </option>
          ))}
        </select>
      </label>
      <label className="field" style={{ flex: 1 }}>
        <span>Carrier</span>
        <select value={invitationId} disabled={!lane} onChange={(e) => setInvitationId(e.target.value)}>
          <option value="">{lane ? (choices.length ? tr("text263") : tr("text564")) : tr("text264")}</option>
          {choices.map((i) => (
            <option key={str(i.id)} value={str(i.id)}>
              {carrierName(i)} ({statusOf(i) || tr("text565")})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
  return { lane, invitation, fields };
}

const num = (value: string) => {
  const text = value.trim().replace(/,/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * A bid that reached the team by email, phone or WhatsApp, recorded on the
 * carrier's invitation. It goes in whole: the server rewrites every field.
 */
export function ManualBidDialog({
  lanes,
  preset,
  onClose,
  onSaved,
}: {
  lanes: LaneWithInvitations[];
  preset?: { lane: LaneWithInvitations; invitation: Invitation };
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  useLang();
  const picker = useInvitationPicker(lanes, preset);
  const start = preset?.invitation ?? {};
  const [rate, setRate] = useState(str(start.bid_rate));
  const [currency, setCurrency] = useState(str(start.currency) || str(preset?.lane.currency) || "USD");
  const [capacity, setCapacity] = useState(str(start.weekly_capacity));
  const [transit, setTransit] = useState(str(start.transit_days));
  const [validThrough, setValidThrough] = useState(str(start.valid_through).slice(0, 10));
  const [notes, setNotes] = useState(str(start.notes));
  const [channel, setChannel] = useState("email");
  const [sourceNote, setSourceNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bid = num(rate);
  const numbersOk = [num(capacity), num(transit)].every((n) => n === null || (!Number.isNaN(n) && n >= 0));
  const canSave = Boolean(picker.invitation) && bid !== null && !Number.isNaN(bid) && bid > 0 && numbersOk && !busy;

  async function save() {
    if (!canSave || !picker.invitation) return;
    setBusy(true);
    setError(null);
    try {
      await captureManualBid(str(picker.invitation.id), {
        bid_rate: bid!,
        currency,
        weekly_capacity: num(capacity),
        transit_days: num(transit),
        valid_through: validThrough || null,
        notes: notes.trim() || null,
        manual_source_channel: channel,
        source_note: sourceNote.trim() || null,
      });
      onSaved(tr("text566", carrierName(picker.invitation)));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={preset?.invitation.bid_rate != null ? tr("text567") : tr("text568")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            {tr("text258")}</button>
          <div className="spacer" />
          <button className="primary" disabled={!canSave} onClick={save}>
            {busy ? tr("text268") : tr("text569")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <ErrorBanner message={error} />}
        {picker.fields ?? (
          <div className="cell-sub">
            {carrierName(start)} · {laneLabel(preset!.lane)}
          </div>
        )}
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text269")}</span>
            <input value={rate} inputMode="decimal" onChange={(e) => setRate(e.target.value)} />
          </label>
          <label className="field" style={{ width: 110 }}>
            <span>{tr("text057")}</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
              <option value="CAD">CAD</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text270")}</span>
            <input value={capacity} inputMode="numeric" onChange={(e) => setCapacity(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text271")}</span>
            <input value={transit} inputMode="numeric" onChange={(e) => setTransit(e.target.value)} />
          </label>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text570")}</span>
            <input type="date" value={validThrough} onChange={(e) => setValidThrough(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tr("text571")}</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">{tr("text030")}</option>
              <option value="phone">{tr("text572")}</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="other">{tr("text573")}</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>{tr("text574")}</span>
          <input value={sourceNote} placeholder={tr("text575")} onChange={(e) => setSourceNote(e.target.value)} />
        </label>
        <label className="field">
          <span>{tr("text576")}</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {!numbersOk && <p style={{ color: "var(--red)", fontSize: 12, margin: 0 }}>{tr("text577")}</p>}
      </div>
    </Dialog>
  );
}

/**
 * Prepares one email draft in Delivery Queue. A fixed request key protects
 * retries; no carrier is contacted from this dialog.
 */
export function QuestionDialog({
  eventId,
  lanes,
  preset,
  onClose,
  onSent,
}: {
  eventId: string;
  lanes: LaneWithInvitations[];
  preset?: { lane: LaneWithInvitations; invitation: Invitation };
  onClose: () => void;
  onSent: (message: string, messageId?: string) => void;
}) {
  useLang();
  const picker = useInvitationPicker(lanes, preset);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const operationId = useRef(crypto.randomUUID());
  const text = body.trim();
  const canSend = Boolean(picker.invitation && picker.lane) && text.length > 0 && text.length <= 600 && !busy;

  async function send() {
    if (!canSend || !picker.invitation || !picker.lane) return;
    if (!(await confirmAsync(tr("text578", carrierName(picker.invitation))))) return;
    setBusy(true);
    setError(null);
    try {
      const result = await draftCarrierQuestion({
        eventId,
        invitationId: str(picker.invitation.id),
        laneId: str(picker.lane.id),
        body: text,
        requestKey: requestKey.current,
        operationId: operationId.current,
      });
      const status = result.outreach_message.status;
      onSent(status === "sent" ? tr("questionAlreadySent") : status === "drafted" ? tr("text579", carrierName(picker.invitation)) : tr("questionReviewExisting"), result.outreach_message.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={tr("text580")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            {tr("text258")}</button>
          <div className="spacer" />
          <button className="primary" disabled={!canSend} onClick={send}>
            {busy ? tr("questionPreparing") : tr("text581")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <ErrorBanner message={error} />}
        {picker.fields ?? (
          <div className="cell-sub">
            {carrierName(preset!.invitation)} · {laneLabel(preset!.lane)}
          </div>
        )}
        <label className="field">
          <span>{tr("text582")}</span>
          <textarea rows={4} value={body} maxLength={600} placeholder={tr("text583")} onChange={(e) => setBody(e.target.value)} />
          <span className="cell-sub" style={{ textAlign: "right" }}>{text.length}/600</span>
        </label>
        <InfoBanner>{tr("text584")}</InfoBanner>
      </div>
    </Dialog>
  );
}

const LANE_FIELDS: { key: string; label: string; numeric?: boolean; wide?: boolean }[] = [
  { key: "origin", get label() { return tr("text585"); } },
  { key: "destination", get label() { return tr("text586"); } },
  { key: "origin_city", get label() { return tr("text587"); } },
  { key: "origin_state", get label() { return tr("text588"); } },
  { key: "origin_country", get label() { return tr("text589"); } },
  { key: "destination_city", get label() { return tr("text590"); } },
  { key: "destination_state", get label() { return tr("text591"); } },
  { key: "destination_country", get label() { return tr("text592"); } },
  { key: "equipment", get label() { return tr("text278"); } },
  { key: "trailer", get label() { return tr("text279"); } },
  { key: "config", get label() { return tr("text593"); } },
  { key: "operation", get label() { return tr("text080"); } },
  { key: "service", get label() { return tr("text081"); } },
  { key: "weekly_volume", get label() { return tr("text594"); }, numeric: true },
  { key: "annual_volume", get label() { return tr("text595"); }, numeric: true },
  { key: "target_rate", get label() { return tr("text281"); }, numeric: true },
  { key: "currency", get label() { return tr("text057"); } },
  { key: "incumbent_vendor", get label() { return tr("text596"); } },
  { key: "carrier_requirements", get label() { return tr("text597"); }, wide: true },
  { key: "notes", get label() { return tr("text272"); }, wide: true },
];

/** Corrects one lane; only the fields that changed go to update_rfx_lane. */
export function LaneEditDialog({ lane, onClose, onSaved }: { lane: LaneWithInvitations; onClose: () => void; onSaved: (message: string) => void }) {
  useLang();
  const initial = useMemo(() => Object.fromEntries(LANE_FIELDS.map((f) => [f.key, str(lane[f.key])])), [getLang(), lane]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = LANE_FIELDS.filter((f) => values[f.key].trim() !== initial[f.key].trim());
  const badNumber = changed.find((f) => f.numeric && values[f.key].trim() && Number.isNaN(num(values[f.key]) ?? 0));
  const canSave = changed.length > 0 && Boolean(values.origin.trim()) && Boolean(values.destination.trim()) && !badNumber && !busy;

  async function save() {
    if (!canSave) return;
    const patch: Record<string, unknown> = {};
    for (const field of changed) {
      const value = values[field.key].trim();
      patch[field.key] = field.numeric ? num(value) : value || null;
    }
    setBusy(true);
    setError(null);
    try {
      await updateRfxLane(str(lane.id), patch);
      onSaved(tr("text598", laneLabel(lane)));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={tr("text599")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            {tr("text258")}</button>
          <div className="spacer" />
          <button className="primary" disabled={!canSave} onClick={save}>
            {busy ? tr("text268") : changed.length ? tr("text600", changed.length) : tr("text601")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 10 }}>
        {error && <ErrorBanner message={error} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
          {LANE_FIELDS.map((field) => (
            <label key={field.key} className="field" style={field.wide ? { gridColumn: "1 / -1" } : undefined}>
              <span>{field.label}</span>
              {field.wide ? (
                <textarea rows={3} value={values[field.key]} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} />
              ) : (
                <input
                  value={values[field.key]}
                  inputMode={field.numeric ? "decimal" : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
        {badNumber && <p style={{ color: "var(--red)", fontSize: 12, margin: 0 }}>«{badNumber.label}{tr("text602")}</p>}
        <p className="cell-sub" style={{ margin: 0 }}>{tr("text603")}</p>
      </div>
    </Dialog>
  );
}
