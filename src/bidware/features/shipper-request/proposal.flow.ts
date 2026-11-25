import type { ProposalLane, RequestProgress, RequestProposal } from "./request.model";

/** Lanes of the proposal the shipper has not accepted yet. */
export const pendingLanes = (proposal: RequestProposal): ProposalLane[] => {
  const accepted = new Set(proposal.accepted.map((row) => row.rfx_lane_id));
  return proposal.lanes.filter((lane) => !accepted.has(lane.rfx_lane_id));
};

/** Once every lane is accepted the last step lights up. */
export const progressAfter = (progress: RequestProgress | null | undefined, proposal: RequestProposal | null) =>
  progress && proposal && proposal.lanes.length > 0 && pendingLanes(proposal).length === 0 ? { ...progress, stage: "accepted" as const } : progress ?? null;

export interface AcceptDeps {
  accept: (proposalId: string, laneIds: string[]) => Promise<{ proposal: RequestProposal | null }>;
  /** Reads the link again: the published proposal as it stands now. */
  reload: () => Promise<RequestProposal | null>;
}

export type AcceptResult = { proposal: RequestProposal | null; error: string | null };

/**
 * Accept lanes and come back with what is true now. A refusal (replaced, expired) or an
 * uncertain answer (no connection, server error) may leave the page showing a stale
 * proposal or a write that did happen, so the link is read again before anything is
 * offered twice. If that read also fails, the page keeps what it had and shows the error.
 */
export async function acceptLanes(current: RequestProposal, laneIds: string[], deps: AcceptDeps): Promise<AcceptResult> {
  try {
    const res = await deps.accept(current.id, laneIds);
    if (res.proposal) return { proposal: res.proposal, error: null };
    return { proposal: await deps.reload(), error: null };
  } catch (e) {
    const error = (e as Error).message || "Error";
    try {
      return { proposal: await deps.reload(), error };
    } catch {
      return { proposal: current, error };
    }
  }
}
