import type { ProposalLane, RequestProgress, RequestProposal } from "./request.model";

/** Lanes of the proposal the shipper has not accepted yet. */
export const pendingLanes = (proposal: RequestProposal): ProposalLane[] => {
  const accepted = new Set(proposal.accepted.map((row) => row.rfx_lane_id));
  return proposal.lanes.filter((lane) => !accepted.has(lane.rfx_lane_id));
};

/**
 * The last two steps follow the proposal on screen: every lane accepted lights up
 * «accepted»; a newer proposal with pending lanes (after a full acceptance) goes back
 * to «proposal».
 */
export function progressAfter(progress: RequestProgress | null | undefined, proposal: RequestProposal | null): RequestProgress | null {
  if (!progress) return null;
  if (!proposal || proposal.lanes.length === 0) return progress.stage === "accepted" ? { ...progress, stage: "proposal" } : progress;
  if (pendingLanes(proposal).length === 0) return { ...progress, stage: "accepted" };
  return progress.stage === "accepted" ? { ...progress, stage: "proposal" } : progress;
}

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
 *
 * A read can still come back before an in-flight acceptance lands. Offering the lanes
 * again is safe because accepting is idempotent per proposal and lane in Rateware
 * (accept_rfx_shipper_proposal: on conflict (proposal_id, rfx_lane_id) do nothing,
 * and only the published proposal it names): a repeat records nothing new.
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

/**
 * What the page keeps after accepting or reading again. When no proposal comes back,
 * the table goes away, so the explanation travels with the change and the page shows it
 * in its place (the shipper never loses what happened).
 */
export function afterAccept(result: AcceptResult, explain: (error: string) => string, gone: string): { proposal: RequestProposal | null; notice: string | null } {
  const message = result.error ? explain(result.error) : null;
  if (!result.proposal) return { proposal: null, notice: message ? `${message} ${gone}` : gone };
  return { proposal: result.proposal, notice: null };
}

/** What the foot of the table says: nothing to accept, everything accepted, or lanes pending. */
export const proposalState = (proposal: RequestProposal): "empty" | "all" | "pending" =>
  proposal.lanes.length === 0 ? "empty" : pendingLanes(proposal).length === 0 ? "all" : "pending";
