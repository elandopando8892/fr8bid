import type { WorkBook } from "xlsx";
import { offerText as t } from "@/i18n/offer-detail";
import { domainLabel } from "@/i18n/domain";
import { ANSWERS, RUBRICS } from "@/features/bid-room/bidroom.service";
import { laneSegmentKey, type ConfirmationRow } from "./confirmations.service";
import type { LaneWithInvitations } from "./stages";
import { comparisonOffers, formatOfferValue, latestOfferResponses, offerFields, offerValidity } from "./offer-presentation";

export function comparisonName(offer: Record<string, unknown>, index: number, anonymous: boolean, displayName?: (offer: Record<string, unknown>) => string): string {
  // Never fall back to a real name/ID when the anonymous caller has no label.
  return displayName?.(offer) || (!anonymous && String((offer.vendors as Record<string, unknown> | undefined)?.vendor_name || "")) || t("exportCarrier", index + 1);
}

export function comparisonStatus(offer: Record<string, unknown>): string {
  const status = String(offer.invitation_status || "").toLowerCase();
  if (status === "quoted") return t("statusQuoted");
  if (status === "declined") return t("statusDeclined");
  if (status === "archived") return t("statusArchived");
  if (status === "rejected") return t("statusRejected");
  if (status === "withdrawn") return t("statusWithdrawn");
  return domainLabel(status) || t("missing");
}

export async function buildComparisonWorkbook({ lane, confirmations, anonymous = false, displayName, evaluatedAt = Date.now() }: {
  lane: LaneWithInvitations; confirmations: ConfirmationRow[]; anonymous?: boolean;
  displayName?: (offer: Record<string, unknown>) => string; evaluatedAt?: number;
}): Promise<WorkBook> {
  // Snapshot the allowlisted presentation before loading the writer. No API reads.
  const offers = comparisonOffers(lane);
  const validityLabels = { valid: "validityValid", expired: "validityExpired", invalid: "validityInvalid", unknown: "validityUnknown" } as const;
  const rows: string[][] = [
    [t("comparisonField"), ...offers.map((offer, index) => comparisonName(offer, index, anonymous, displayName))],
    [t("comparisonStatus"), ...offers.map(comparisonStatus)],
    ...offerFields.map(key => [t(key), ...offers.map(offer => formatOfferValue(offer, key, t, anonymous))]),
    [t("exportValidity"), ...offers.map(offer => t(validityLabels[offerValidity(offer, evaluatedAt)]))],
    [t("final"), ...offers.map(offer => typeof offer.best_final === "boolean" ? t(offer.best_final ? "yes" : "no") : t("pending"))],
    ...RUBRICS.map(rubric => [domainLabel(rubric.label), ...offers.map(offer => {
      const row = latestOfferResponses(confirmations, offer, laneSegmentKey(lane)).get(rubric.key);
      const answer = ANSWERS.find(a => a.key === row?.answer);
      return (answer ? domainLabel(answer.label) : t("pending")) + (row?.comment ? `\n${anonymous ? t("hidden") : row.comment}` : "");
    })]),
  ];
  const context: string[][] = [
    [t("comparisonTitle")], [t("exportLane"), `${String(lane.origin || "—")} → ${String(lane.destination || "—")}`],
    [t("exportAt"), new Date(evaluatedAt).toISOString()], [t("exportAnonymous"), t(anonymous ? "yes" : "no")],
    [t("comparisonOffers"), String(offers.length)], [t("comparisonNote")], [t("exportSnapshotNote")],
  ];
  if ([...rows, ...context].some(row => row.some(cell => cell.length > 32767))) throw new Error(t("exportTooLarge"));
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 30 }, ...offers.map(() => ({ wch: 34 }))];
  XLSX.utils.book_append_sheet(book, sheet, t("exportSheet"));
  const notes = XLSX.utils.aoa_to_sheet(context); notes["!cols"] = [{ wch: 42 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(book, notes, t("exportContextSheet"));
  return book;
}
