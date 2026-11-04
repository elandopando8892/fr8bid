import type { DraftChannel } from "./outreach.service";

export interface DraftReceipt {
  prepared: number;
  skipped: { reason?: string; reason_code?: string }[];
}
export interface DraftStep {
  channel: DraftChannel;
  state: "waiting" | "running" | "confirmed" | "unconfirmed" | "rejected";
  receipt?: DraftReceipt;
}
export interface DraftPreparation {
  phase: "campaign" | "running" | "complete" | "stopped";
  steps: DraftStep[];
  issue?: "audience" | "unconfirmed";
}

/** A missing/malformed receipt is not evidence of zero writes. API720 returns
 * generated with rows:[]; older successful responses may return rows alone. */
export function draftReceipt(value: unknown, scope?: { campaignId: string; channel: DraftChannel }): DraftReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid draft receipt");
  const row = value as Record<string, unknown>;
  if (scope && ((row.campaign_id !== undefined && row.campaign_id !== scope.campaignId)
    || (row.requested_channels !== undefined && (!Array.isArray(row.requested_channels)
      || row.requested_channels.length !== 1 || row.requested_channels[0] !== scope.channel)))) throw new Error("Draft receipt scope mismatch");
  const count = row.generated === undefined && Array.isArray(row.rows) ? row.rows.length : row.generated;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0
    || (row.skipped !== undefined && !Array.isArray(row.skipped))) throw new Error("Invalid draft receipt");
  const skipped = ((row.skipped ?? []) as unknown[]).map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid draft receipt");
    const entry = item as Record<string, unknown>;
    return { reason: typeof entry.reason === "string" ? entry.reason : undefined,
      reason_code: typeof entry.reason_code === "string" ? entry.reason_code : undefined };
  });
  return { prepared: count, skipped };
}

/** One Message-page attempt. No retries, persistence, sends or new API actions.
 * Leaving the scope stops unstarted requests; an in-flight write cannot be undone. */
export async function prepareDraftChannels(input: {
  channels: DraftChannel[];
  campaign: () => Promise<string>;
  prepare: (campaignId: string, channel: DraftChannel) => Promise<unknown>;
  isCurrent: () => boolean;
  progress: (value: DraftPreparation) => void;
  confirmed: (channel: DraftChannel) => void;
}): Promise<DraftPreparation | null> {
  let state: DraftPreparation = { phase: "campaign", steps: input.channels.map(channel => ({ channel, state: "waiting" })) };
  let active = -1;
  const publish = () => input.progress(state);
  if (!input.isCurrent()) return null;
  publish();
  try {
    const campaignId = await input.campaign();
    if (!input.isCurrent()) return null;
    if (!campaignId || typeof campaignId !== "string") throw new Error("Missing campaign receipt");
    for (let index = 0; index < state.steps.length; index++) {
      if (!input.isCurrent()) return null;
      active = index;
      const channel = state.steps[index].channel;
      state = { ...state, phase: "running", steps: state.steps.map((step, i) => i === index ? { ...step, state: "running" } : step) };
      publish();
      const response = await input.prepare(campaignId, channel);
      if (!input.isCurrent()) return null;
      const receipt = draftReceipt(response, { campaignId, channel });
      state = { ...state, steps: state.steps.map((step, i) => i === index ? { ...step, state: "confirmed", receipt } : step) };
      input.confirmed(channel);
      publish();
    }
    state = { ...state, phase: "complete" };
  } catch (error) {
    if (!input.isCurrent()) return null;
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const rejected = active >= 0 && (code === "reviewed_audience_changed" || code === "reviewed_audience_required");
    state = { ...state, phase: "stopped", issue: rejected ? "audience" : "unconfirmed",
      steps: state.steps.map((step, i) => i === active ? { ...step, state: rejected ? "rejected" : "unconfirmed" } : step) };
  }
  publish();
  return state;
}
