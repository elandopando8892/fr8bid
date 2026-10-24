import type { CarrierReview } from "./review.service";

export interface DraftAudiencePolicy {
  mode?: string;
  vendor_ids?: string[];
  saved_segment_id?: string | null;
}

/** Participation selection and contact review are independent requirements. */
export function reviewedDraftAudience(
  all: { id: string; name: string }[],
  reviews: CarrierReview[],
  policy?: DraftAudiencePolicy,
  segments: { id: string; vendor_ids?: string[] }[] = [],
) {
  const mode = policy?.mode || "all_eligible";
  const segment = mode === "saved_segment" ? segments.find((s) => s.id === policy?.saved_segment_id) : undefined;
  const selection = mode === "saved_segment" ? segment?.vendor_ids ?? [] : policy?.vendor_ids ?? [];
  const unresolved = !["all_eligible", "selected_carriers", "saved_segment"].includes(mode)
    || (mode === "saved_segment" && !segment);
  const selected = unresolved ? [] : all.filter((v) =>
    selection.length ? selection.includes(v.id) : mode === "all_eligible",
  );
  const reviewed = new Set(reviews.filter((r) => r.reviewed).map((r) => r.vendor_id));
  return { total: all.length, selected: selected.length, unresolved, audience: selected.filter((v) => reviewed.has(v.id)) };
}
