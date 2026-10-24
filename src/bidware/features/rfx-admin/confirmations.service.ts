import { domainLabel } from "@/i18n/domain";
import { tr } from "@/i18n/rfx-admin";
import { callRatewareApi } from "@/lib/api-client";
import { ANSWERS, RUBRICS, type AnswerKey } from "@/features/bid-room/bidroom.service";

/** Confirmaciones por rubro; la API comprueba el propietario del evento. */
export interface ConfirmationRow {
  rfx_lane_vendor_id: string | null;
  vendor_id: string | null;
  segment_key: string;
  rubric_key: string;
  answer: string;
  comment: string | null;
  updated_at: string;
}

export async function listEventConfirmations(eventId: string): Promise<ConfirmationRow[]> {
  try {
    const data = await callRatewareApi<{ rows: ConfirmationRow[] }>("list_rfx_segment_confirmations", { event_id: eventId });
    return [...(data.rows ?? [])].sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0));
  } catch (error) {
    throw new Error(tr("text216", error instanceof Error ? error.message : String(error)));
  }
}

export interface CarrierTerms {
  /** Rubros with an answer other than pending. */
  answered: number;
  total: number;
  exceptions: number;
  /** "No puedo": the carrier refused a rubro outright. */
  refused: number;
  /** "Modelo Logístico: con excepción — solo reporte diario", one per flagged rubro. */
  notes: string[];
}

const ANSWER_LABEL = Object.fromEntries(ANSWERS.map((a) => [a.key, a.label])) as Record<string, string>;

/**
 * rateware's laneSegmentKey for a lane row of list_rfx_detail (the same
 * `segmentKeyOf` the carrier's Bid Room uses): confirmations are stored under
 * this key.
 */
export function laneSegmentKey(lane: Record<string, unknown>): string {
  return (
    String(
      lane.rfx_segment_key ||
        [lane.operation, lane.service, lane.equipment, lane.trailer].filter(Boolean).join("-") ||
        "general",
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "general"
  );
}

/**
 * The latest answer per rubro for one invitation (a lane of the carrier), or,
 * when that invitation has none, what the carrier answered for the same
 * segment on its other lanes: the carrier confirms per segment and rateware
 * stores one row per lane invitation. Another segment's answers never count.
 */
export function termsOf(
  rows: ConfirmationRow[],
  invitationId?: string | null,
  vendorId?: string | null,
  segmentKey?: string | null,
): CarrierTerms {
  const own = invitationId ? rows.filter((r) => r.rfx_lane_vendor_id === invitationId) : [];
  const source = own.length
    ? own
    : vendorId && segmentKey
      ? rows.filter((r) => r.vendor_id === vendorId && r.segment_key === segmentKey)
      : [];
  const latest = new Map<string, ConfirmationRow>();
  for (const row of source) if (!latest.has(row.rubric_key)) latest.set(row.rubric_key, row);
  const terms: CarrierTerms = { answered: 0, total: RUBRICS.length, exceptions: 0, refused: 0, notes: [] };
  for (const rubric of RUBRICS) {
    const row = latest.get(rubric.key);
    const answer = (row?.answer || "pending") as AnswerKey;
    if (answer === "pending") continue;
    terms.answered += 1;
    if (answer === "exception") terms.exceptions += 1;
    if (answer === "disagree") terms.refused += 1;
    if (answer === "exception" || answer === "disagree") {
      terms.notes.push(`${domainLabel(rubric.label)}: ${domainLabel(ANSWER_LABEL[answer]).toLowerCase()}${row?.comment ? ` — ${row.comment}` : ""}`);
    }
  }
  return terms;
}

/** "6/6 rubros · 1 excepción", the way the stages show it. */
export function termsLabel(t: CarrierTerms): string {
  const parts = [tr("text217", t.answered, t.total)];
  if (t.exceptions) parts.push(tr("text218", t.exceptions, t.exceptions === 1 ? "ón" : "ones"));
  if (t.refused) parts.push(tr("text219", t.refused));
  return parts.join(" · ");
}

export type TermsTone = "green" | "amber" | "red" | "";

/** Green when everything is agreed, amber with exceptions or gaps, red when a rubro was refused, grey when nothing was answered. */
export function termsTone(t: CarrierTerms): TermsTone {
  if (t.refused) return "red";
  if (!t.answered) return "";
  if (t.exceptions || t.answered < t.total) return "amber";
  return "green";
}
