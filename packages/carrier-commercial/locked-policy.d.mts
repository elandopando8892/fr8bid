export function lockedBrokeragePolicy(value: unknown): {model: "brokerage"; locked: true} | null;
export const INTERNAL_COMMERCIAL_FIELDS: Set<string>;
export function lockedCommercialViolation(input: unknown, context: unknown): {code: string; error: string} | null;
export function projectLockedCarrierPayload(payload: unknown, scope?: {eventId: string; policy: unknown} | null): unknown;

