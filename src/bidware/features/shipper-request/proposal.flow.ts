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

/**
 * `unresolved`: the answer was not a success and the link could not be read again, so
 * nobody knows whether the acceptance went in. Accepting stays locked until a read works.
 */
export type AcceptResult = { proposal: RequestProposal | null; error: string | null; unresolved: boolean };

/**
 * Accept lanes and come back with what is true now. A refusal (replaced, expired) or an
 * uncertain answer (no connection, server error) may leave the page showing a stale
 * proposal or a write that did happen, so the link is read again before anything is
 * offered twice. If that read also fails, the page keeps what it had, locked.
 */
export async function acceptLanes(current: RequestProposal, laneIds: string[], deps: AcceptDeps): Promise<AcceptResult> {
  try {
    const res = await deps.accept(current.id, laneIds);
    if (res.proposal) return { proposal: res.proposal, error: null, unresolved: false };
    return await reconcile(current, null, deps);
  } catch (e) {
    return await reconcile(current, (e as Error).message || "Error", deps);
  }
}

/** Reads the link again; if that fails too, the page keeps what it had, locked. */
export async function reconcile(current: RequestProposal, error: string | null, deps: Pick<AcceptDeps, "reload">): Promise<AcceptResult> {
  try {
    return { proposal: await deps.reload(), error, unresolved: false };
  } catch (e) {
    return { proposal: current, error: error ?? ((e as Error).message || "Error"), unresolved: true };
  }
}

/** Accept buttons are live only with a current, unexpired proposal and nothing in doubt. */
export const canAccept = (proposal: RequestProposal, busy: boolean, unresolved: boolean) => !proposal.expired && !busy && !unresolved;
