// Cotización rápida (rediseño 25-nov, prioridad 4): qué ruta sigue y qué datos
// se reutilizan en las rutas que el carrier aún no cotiza.
import { canQuote, isRevision, laneState, offerForm, type BookLane, type OfferForm } from "./bidroom.service";

/** What a carrier usually repeats on every lane: typed once, reused on the lanes not quoted yet. */
export type SharedFields = Pick<OfferForm, "weekly_capacity" | "transit_days" | "valid_through">;
export const SHARED_KEYS = ["weekly_capacity", "transit_days", "valid_through"] as const;

export const sharedOf = (form: OfferForm): SharedFields => ({
  weekly_capacity: form.weekly_capacity,
  transit_days: form.transit_days,
  valid_through: form.valid_through,
});

/** A lane's form, with the shared values filling only what that lane left blank, and only before its first quote. */
export function startForm(lane: BookLane, shared: SharedFields | null | undefined): { form: OfferForm; filled: boolean } {
  const form = offerForm(lane);
  if (!shared || isRevision(lane) || !canQuote(lane)) return { form, filled: false };
  let filled = false;
  for (const key of SHARED_KEYS) {
    if (!form[key] && shared[key]) {
      form[key] = shared[key];
      filled = true;
    }
  }
  return { form, filled };
}

/** The next lane still waiting for a quote after this one (wrapping to the start). */
/**
 * `answered` holds the lanes answered here whose reload has not arrived yet:
 * the list still shows them pending, but they are never offered again.
 */
export function nextPending(lanes: BookLane[], from: BookLane, answered: ReadonlySet<string> = new Set()): BookLane | null {
  const i = lanes.findIndex((l) => l.rfx_lane_id === from.rfx_lane_id);
  const order = [...lanes.slice(i + 1), ...lanes.slice(0, Math.max(i, 0))];
  return (
    order.find(
      (l) => l.rfx_lane_id !== from.rfx_lane_id && !answered.has(l.rfx_lane_id) && laneState(l) === "pending" && canQuote(l),
    ) ?? null
  );
}
