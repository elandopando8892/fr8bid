import { callQuotedeskApi } from "@/lib/api-client";

export interface ClientFeeInput {
  proposalId: string;
  evidenceId: string;
  customerContactId: string;
  customerAcceptedAt: string;
}
interface FeeTerms {
  model: "fee_plus";
  currency: string;
  basis: "fixed_amount" | "percentage_of_carrier_rate";
  value: number;
  validUntil: string;
}
export interface ClientFeeContext {
  contractVersion: "rateware.client-fee-context.v1";
  billingEnabled: false;
  acceptanceId: string;
  proposal: FeeTerms & { id: string; shipperId: string; rfxId: string; laneId: string; revision: string; termsFingerprint: string };
  evidence: { id: string; sourceType: "document"; sourceDigest: string; sourceVersion: string; customerContactId: string; customerAcceptedAt: string; sourceVerified: true; filename: string };
}
export interface ClientFeeRecord {
  contractVersion: "rateware.client-fee-record.v1";
  id: string;
  state: "accepted";
  scope: { ownerScope: string; organizationId: string; shipperId: string; rfxId: string; laneId: string; proposalId: string; revision: string };
  terms: FeeTerms;
  termsFingerprint: string;
  evidence: { id: string; sourceType: "document"; sourceDigest: string; sourceVersion: string };
  customerContactId: string;
  customerAcceptedAt: string;
  verifiedBy: string;
  verifiedAt: string;
}
export interface ClientFeeResult {
  contractVersion: "rateware.client-fee-acceptance.v1";
  state: "accepted" | "uncertain" | "not_found";
  record: ClientFeeRecord | null;
  billingEnabled: false;
  retryWrite: false;
  historyOnly?: true;
}

const binding = (input: ClientFeeInput): ClientFeeInput => ({
  proposalId: input.proposalId, evidenceId: input.evidenceId,
  customerContactId: input.customerContactId, customerAcceptedAt: input.customerAcceptedAt,
});

export class ClientFeeError extends Error {
  constructor(public readonly code: "invalid_input" | "invalid_response" | "scope_changed" | "locked" | "expired" | "verification_required" | "recovery_unavailable") {
    super(code);
    this.name = "ClientFeeError";
  }
}
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const hex = (value: unknown): value is string => typeof value === "string" && value.length===64 && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function isClientFeeTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const year = +match[1], month = +match[2], day = +match[3];
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= days && !/[+-]14:(?!00)/.test(value);
}
function validateInput(input: ClientFeeInput) {
  if (![input.proposalId, input.evidenceId, input.customerContactId].every(uuid) || !isClientFeeTimestamp(input.customerAcceptedAt)) throw new ClientFeeError("invalid_input");
}
function validTerms(terms: FeeTerms | undefined) {
  return terms && terms.model === "fee_plus" && ['USD','MXN','CAD'].includes(terms.currency)
    && ["fixed_amount", "percentage_of_carrier_rate"].includes(terms.basis)
    && typeof terms.value === "number" && Number.isFinite(terms.value) && terms.value >= 0 && terms.value<=1e9
    && (terms.basis!=='percentage_of_carrier_rate'||terms.value<=100) && isClientFeeTimestamp(terms.validUntil);
}
function validateContext(result: ClientFeeContext, input: ClientFeeInput) {
  const p = result?.proposal, e = result?.evidence;
  if (result?.contractVersion !== "rateware.client-fee-context.v1" || result.billingEnabled !== false || !/^[a-f0-9]{64}$/i.test(result.acceptanceId)
    || !validTerms(p) || p.id !== input.proposalId || ![p.shipperId, p.rfxId, p.laneId, p.termsFingerprint].every(text)
    || !hex(p.revision) || !hex(p.termsFingerprint)
    || !e || e.id !== input.evidenceId || e.sourceType !== "document" || e.sourceVerified !== true
    || !hex(e.sourceDigest) || !hex(e.sourceVersion) || !text(e.filename)
    || e.customerContactId !== input.customerContactId || !isClientFeeTimestamp(e.customerAcceptedAt)
    || Date.parse(e.customerAcceptedAt) !== Date.parse(input.customerAcceptedAt)) throw new ClientFeeError("invalid_response");
}

export async function getClientFeeContext(input: ClientFeeInput): Promise<ClientFeeContext> {
  validateInput(input);
  const result = await callQuotedeskApi<ClientFeeContext>("client_fee_context", { ...binding(input) });
  validateContext(result, input);
  return result;
}

export interface ClientFeeView {
  phase: "idle" | "loading" | "ready" | "recording" | "uncertain" | "looking_up" | "accepted";
  input: ClientFeeInput | null;
  context: ClientFeeContext | null;
  result: ClientFeeResult | null;
  error: unknown;
  locked: boolean;
}
export interface ClientFeeRecovery { input: ClientFeeInput; context: ClientFeeContext }

function validateResult(result: ClientFeeResult, input: ClientFeeInput, context: ClientFeeContext | null) {
  const fail = () => { throw new ClientFeeError("invalid_response"); };
  if (result?.contractVersion !== "rateware.client-fee-acceptance.v1" || result.billingEnabled !== false || result.retryWrite !== false
    || !["accepted", "uncertain", "not_found"].includes(result.state)) return fail();
  if (result.state !== "accepted") {
    if (result.record !== null) fail();
    return;
  }
  const r = result.record;
  if (!r || r.contractVersion !== "rateware.client-fee-record.v1" || r.state !== "accepted" || !hex(r.id)
    || !r.scope || !text(r.scope.ownerScope) || !text(r.scope.organizationId)
    || r.scope.proposalId !== input.proposalId || ![r.scope.shipperId, r.scope.rfxId, r.scope.laneId, r.termsFingerprint].every(text)
    || !hex(r.scope.revision) || !hex(r.termsFingerprint) || !validTerms(r.terms)
    || !r.evidence || r.evidence.id !== input.evidenceId || r.evidence.sourceType !== "document"
    || !hex(r.evidence.sourceDigest) || !hex(r.evidence.sourceVersion)
    || r.customerContactId !== input.customerContactId || !isClientFeeTimestamp(r.customerAcceptedAt)
    || Date.parse(r.customerAcceptedAt) !== Date.parse(input.customerAcceptedAt)
    || !text(r.verifiedBy) || !isClientFeeTimestamp(r.verifiedAt)) fail();
  if (context && r) {
    const p = context.proposal, e = context.evidence;
    if (r.id!==context.acceptanceId || r.scope.shipperId !== p.shipperId || r.scope.rfxId !== p.rfxId || r.scope.laneId !== p.laneId || r.scope.revision !== p.revision
      || r.termsFingerprint !== p.termsFingerprint || r.terms.model !== p.model || r.terms.currency !== p.currency || r.terms.basis !== p.basis
      || r.terms.value !== p.value || Date.parse(r.terms.validUntil) !== Date.parse(p.validUntil)
      || r.evidence.sourceDigest !== e.sourceDigest || r.evidence.sourceVersion !== e.sourceVersion) fail();
  }
}

/** One in-memory attempt. Only an explicit lookup can follow a write. */
export function createClientFeeAcceptanceSession(isCurrent: () => boolean, rememberOriginal?: (recovery: ClientFeeRecovery) => void) {
  let generation = 0;
  let state: ClientFeeView = { phase: "idle", input: null, context: null, result: null, error: null, locked: false };
  // Context is retained privately for receipt comparison, never shown after an error.
  let originalContext: ClientFeeContext | null = null;
  const requireCurrent = (version = generation) => {
    if (!isCurrent() || version !== generation) throw new ClientFeeError("scope_changed");
  };
  const requireIdle = () => {
    requireCurrent();
    if (state.locked || ["loading", "recording", "looking_up"].includes(state.phase)) throw new ClientFeeError("locked");
  };
  return {
    view: (): ClientFeeView => ({ ...state, input: state.input && { ...state.input }, context: state.context && structuredClone(state.context), result: state.result && structuredClone(state.result) }),
    invalidate() {
      generation++;
      originalContext = null;
      state = { phase: "idle", input: null, context: null, result: null, error: null, locked: false };
    },
    clearContext() {
      requireIdle();
      originalContext = null;
      state = { phase: "idle", input: null, context: null, result: null, error: null, locked: false };
    },
    restore(recovery: ClientFeeRecovery) {
      requireIdle();
      state = { phase: "uncertain", input: null, context: null, result: null, error: new ClientFeeError("invalid_response"), locked: true };
      validateInput(recovery.input);
      validateContext(recovery.context, recovery.input);
      originalContext = structuredClone(recovery.context);
      state = { phase: "uncertain", input: binding(recovery.input), context: null, result: null, error: null, locked: true };
    },
    async load(input: ClientFeeInput) {
      requireIdle();
      const version = generation;
      const frozen = binding(input);
      originalContext = null;
      state = { phase: "loading", input: frozen, context: null, result: null, error: null, locked: false };
      try {
        const result = await getClientFeeContext(frozen);
        requireCurrent(version);
        originalContext = structuredClone(result);
        state = { ...state, phase: "ready", context: structuredClone(result) };
      } catch (error) {
        if (version === generation && isCurrent()) state = { ...state, phase: "idle", context: null, error };
        throw error;
      }
    },
    async record(humanVerified: boolean) {
      requireIdle();
      if (humanVerified !== true || state.phase !== "ready" || !state.input || !originalContext) throw new ClientFeeError("verification_required");
      if (Date.parse(originalContext.proposal.validUntil) <= Date.now()) {
        state = { ...state, phase: "idle", context: null, error: new ClientFeeError("expired") };
        throw state.error;
      }
      const version = generation;
      const frozen = { ...state.input };
      state = { ...state, phase: "recording", locked: true, context: null, result: null, error: null };
      try {
        rememberOriginal?.({ input: frozen, context: structuredClone(originalContext) });
        requireCurrent(version);
        const result = await callQuotedeskApi<ClientFeeResult>("record_client_fee_acceptance", { ...frozen, humanVerified: true,
          reviewedTermsFingerprint: originalContext.proposal.termsFingerprint, reviewedSourceVersion: originalContext.evidence.sourceVersion,
          acceptanceId: originalContext.acceptanceId });
        requireCurrent(version);
        validateResult(result, frozen, originalContext);
        state = { ...state, phase: result.state === "accepted" ? "accepted" : "uncertain", result };
      } catch (error) {
        if (version === generation && isCurrent()) state = { ...state, phase: "uncertain", context: null, result: null, error };
      }
    },
    async lookup() {
      requireCurrent();
      if (!state.locked || !state.input || state.phase !== "uncertain") throw new ClientFeeError("locked");
      if (!originalContext) throw new ClientFeeError("locked");
      const originalInput = { ...state.input };
      const version = generation;
      state = { ...state, phase: "looking_up", context: null, result: null, error: null };
      try {
        const result = await callQuotedeskApi<ClientFeeResult>("read_client_fee_acceptance", { proposalId: originalInput.proposalId, acceptanceId: originalContext.acceptanceId });
        requireCurrent(version);
        if (result?.historyOnly !== true) throw new ClientFeeError("invalid_response");
        validateResult(result, originalInput, originalContext);
        state = { ...state, phase: result.state === "accepted" ? "accepted" : "uncertain", result };
      } catch (error) {
        if (version === generation && isCurrent()) state = { ...state, phase: "uncertain", context: null, result: null, error };
      }
    },
  };
}
