import { callRatewareApi } from "@/lib/api-client";
import { parsePublishedClassification, type PublishedClassification } from "../../../../packages/carrier-classification/published-contract.mjs";

export const PUBLISHED_READ_TTL_MS = 5 * 60 * 1000;

export type PublishedReadState = {
  organizationId: string; status: "loading" | "ready" | "error"; checkedAt: number;
  result: PublishedClassification | null;
};
export function publishedReadIsCurrent(state: PublishedReadState, organizationId: string, now: number): boolean {
  return state.organizationId === organizationId && state.status === "ready" &&
    state.checkedAt > 0 && now >= state.checkedAt && now - state.checkedAt < PUBLISHED_READ_TTL_MS;
}
export async function readPublishedClassification(organizationId: string): Promise<PublishedClassification> {
  const value = await callRatewareApi("get_published_carrier_classification");
  return parsePublishedClassification(value, organizationId);
}

/** An account change, refresh or unmount makes prior responses unusable. No cache or retries. */
export function createPublishedReader(organizationId: string, publish: (state: PublishedReadState) => void,
  read = readPublishedClassification) {
  let generation = 0, disposed = false;
  return {
    async refresh() {
      if (disposed) return;
      const attempt = ++generation;
      publish({ organizationId, status: "loading", checkedAt: 0, result: null });
      try {
        if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
        const result = await read(organizationId);
        if (!disposed && generation === attempt) publish({ organizationId, status: "ready", checkedAt: Date.now(), result });
      } catch {
        if (!disposed && generation === attempt) publish({ organizationId, status: "error", checkedAt: 0, result: null });
      }
    },
    dispose() { disposed = true; generation++; },
  };
}
