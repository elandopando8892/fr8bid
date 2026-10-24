import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthContext";
import { onAuthStateChange } from "@/lib/auth";
import { InfoBanner, ErrorBanner, Pill } from "@/components/ui";
import { useLang, translator, formatCurrency } from "@/i18n/language";
import { ClientFeeError, createClientFeeAcceptanceSession, type ClientFeeInput } from "./client-fee-acceptance.service";
import { ClientFeeRevocationPanel } from './ClientFeeRevocationPanel';

const tr = translator({
  title: { es: "Aceptación del fee por el cliente", en: "Customer fee acceptance" },
  off: { es: "Facturación deshabilitada", en: "Billing disabled" },
  intro: { es: "Relaciona la invitación RFx con el archivo donde el cliente aceptó el fee. El servidor valida el contacto CRM, el alcance, los términos y el archivo original.", en: "Link the RFx invitation to the file where the customer accepted the fee. The server validates the CRM contact, scope, terms and original file." },
  proposal: { es: "Invitación RFx (UUID)", en: "RFx invitation (UUID)" },
  evidence: { es: "Archivo de evidencia raw_upload (UUID)", en: "Evidence file raw_upload (UUID)" },
  contact: { es: "Contacto del cliente en CRM (UUID)", en: "CRM customer contact (UUID)" },
  time: { es: "Fecha de aceptación del cliente (ISO con zona horaria)", en: "Customer acceptance time (ISO with time zone)" },
  consult: { es: "Consultar términos y evidencia", en: "Read terms and evidence" },
  inspect: { es: "Inspecciona el archivo original por separado antes de registrar. Estos datos verifican el vínculo y los términos; no prueban que el cliente haya aceptado.", en: "Inspect the original file separately before recording. These details verify the binding and terms; they do not prove customer acceptance." },
  verified: { es: "Inspeccioné el documento original y comprobé que el cliente aceptó estos términos y este alcance.", en: "I inspected the original document and verified that the customer accepted these terms and this scope." },
  record: { es: "Registrar aceptación verificada", en: "Record verified acceptance" },
  lookup: { es: "Consultar estado original", en: "Read original status" },
  uncertain: { es: "El resultado no está confirmado. Conservamos los datos originales: consulta su estado para recuperar el recibo. No vuelvas a registrar.", en: "The result is unconfirmed. Original inputs are preserved: read their status to recover the receipt. Do not record again." },
  missing: { es: "No se encontró un recibo confirmado. Esto no habilita otro registro; consulta el estado original más adelante.", en: "No confirmed receipt was found. This does not allow another record; read the original status later." },
  accepted: { es: "Aceptación registrada", en: "Acceptance recorded" },
  receipt: { es: "Recibo", en: "Receipt" },
  source: { es: "Documento", en: "Document" },
  revision: { es: "Revisión", en: "Revision" },
  expires: { es: "Vigencia", en: "Valid until" },
  fixed: { es: "Fee fijo", en: "Fixed fee" },
  percent: { es: "Porcentaje de la tarifa del carrier", en: "Percentage of carrier rate" },
  loading: { es: "Consultando…", en: "Reading…" },
  saving: { es: "Registrando…", en: "Recording…" },
  invalid: { es: "Usa UUID válidos y una fecha ISO completa con Z o una zona como -06:00.", en: "Use valid UUIDs and a complete ISO timestamp with Z or an offset such as -06:00." },
  response: { es: "La respuesta no coincide con el vínculo o contrato esperado. Retiramos los datos de la vista.", en: "The response does not match the expected binding or contract. Its data has been withdrawn." },
  expired: { es: "Los términos vencieron. Consulta el contexto vigente antes de registrar.", en: "The terms expired. Read the current context before recording." },
  verification: { es: "Consulta los términos e inspecciona el documento antes de confirmar la verificación humana.", en: "Read the terms and inspect the document before confirming human verification." },
  disabled: { es: "Esta función está deshabilitada en el servidor (503).", en: "This feature is disabled on the server (503)." },
  recovery: { es: "No se pudo recuperar o conservar la referencia original en esta sesión del navegador. No se habilita otro registro; conserva estos datos para consultar el estado original.", en: "The original reference could not be recovered or retained in this browser session. Another record is not enabled; keep these details to read the original status." },
  denied: { es: "La sesión o los permisos no permiten esta operación. Retiramos los datos de la vista.", en: "The session or permissions do not allow this operation. Its data has been withdrawn." },
  failure: { es: "No se pudo confirmar la respuesta del servidor.", en: "The server response could not be confirmed." },
  verifiedBy: { es: "Verificado por", en: "Verified by" },
});

function errorMessage(error: unknown): string {
  if (error instanceof ClientFeeError) {
    if (error.code === "invalid_input") return tr("invalid");
    if (error.code === "invalid_response") return tr("response");
    if (error.code === "expired") return tr("expired");
    if (error.code === "verification_required") return tr("verification");
    if (error.code === "scope_changed") return tr("denied");
    if (error.code === "recovery_unavailable") return tr("recovery");
  }
  const status = (error as { status?: number } | null)?.status;
  return status === 503 ? tr("disabled") : status === 401 || status === 403 ? tr("denied") : tr("failure");
}

export interface ClientFeeAcceptancePanelProps {
  canOperate: boolean;
  /** Pass quote/RFx identity here, or mount with key={quote.id}. No API calls on mount. */
  scopeKey?: string;
}

export function ClientFeeAcceptancePanel({ canOperate, scopeKey = "" }: ClientFeeAcceptancePanelProps) {
  useLang();
  const auth = useAuth();
  const allowed = canOperate && auth.authenticated && auth.roleLoaded && auth.can("operate");
  const scope = scopeKey || (typeof location === "undefined" ? "" : location.pathname);
  const organization=String(auth.user?.app_metadata?.rateware_organization_id??auth.user?.app_metadata?.organization_id??'');
  const identity = `${auth.user?.id ?? ""}:${organization}:${scope}:${allowed}`;
  const recoveryKey = `bidware.client-fee-original.v1:${auth.user?.id ?? ""}:${organization}:${scope}`;
  const permission = useRef(allowed);
  permission.current = allowed;
  const current = useRef<object | null>(null);
  const previous = useRef<ReturnType<typeof createClientFeeAcceptanceSession> | null>(null);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [, redraw] = useState(0);
  const [humanVerified, setHumanVerified] = useState(false);
  const [inputs, setInputs] = useState<ClientFeeInput>({ proposalId: "", evidenceId: "", customerContactId: "", customerAcceptedAt: "" });
  const [localError, setLocalError] = useState<unknown>(null);
  const [inputOwner, setInputOwner] = useState(`${identity}:${authEpoch}`);
  const bundle = useMemo(() => {
    const token = {};
    return { token, session: createClientFeeAcceptanceSession(() => current.current === token && permission.current, recovery => {
      try { sessionStorage.setItem(recoveryKey, JSON.stringify(recovery)); }
      catch { throw new ClientFeeError("recovery_unavailable"); }
    }) };
  }, [identity, authEpoch, recoveryKey]);
  if (previous.current !== bundle.session) {
    previous.current?.invalidate();
    previous.current = bundle.session;
    current.current = bundle.token;
  }
  const { session } = bundle;
  useEffect(() => {
    current.current = bundle.token;
    setInputOwner(`${identity}:${authEpoch}`);
    setInputs({ proposalId: "", evidenceId: "", customerContactId: "", customerAcceptedAt: "" });
    setHumanVerified(false);
    setLocalError(null);
    if (allowed) {
      try {
        const saved = sessionStorage.getItem(recoveryKey);
        if (saved) { session.restore(JSON.parse(saved)); redraw(value => value + 1); }
      } catch { setLocalError(new ClientFeeError("recovery_unavailable")); }
    }
    return () => { if (current.current === bundle.token) current.current = null; };
  }, [session, bundle.token, identity, authEpoch, allowed, recoveryKey]);
  useEffect(() => onAuthStateChange(() => {
    current.current = null;
    previous.current?.invalidate();
    setAuthEpoch(value => value + 1);
  }), []);
  if (!allowed) return null;
  const view = session.view();
  const busy = ["loading", "recording", "looking_up"].includes(view.phase);
  const sameOwner = inputOwner === `${identity}:${authEpoch}`;
  const shownInputs = view.locked && view.input ? view.input : sameOwner ? inputs : { proposalId: "", evidenceId: "", customerContactId: "", customerAcceptedAt: "" };
  const context = view.context;
  const receipt = view.result?.record;

  function change(key: keyof ClientFeeInput, value: string) {
    if (busy || view.locked) return;
    session.clearContext();
    setLocalError(null);
    setHumanVerified(false);
    setInputs(old => ({ ...old, [key]: value }));
  }
  async function run(action: "load" | "record" | "lookup") {
    const token = bundle.token;
    setLocalError(null);
    try {
      const promise = action === "load" ? session.load(inputs) : action === "record" ? session.record(humanVerified) : session.lookup();
      redraw(value => value + 1);
      await promise;
    } catch (error) {
      if (current.current === token) setLocalError(error);
    } finally {
      if (current.current === token) { setHumanVerified(false); redraw(value => value + 1); }
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (!busy && !view.locked) void run("load"); }

  return <section className="card" aria-label={tr("title")} aria-busy={busy}>
    <div className="qd-card-head"><h2>{tr("title")}</h2><Pill>{tr("off")}</Pill></div>
    <p className="qd-muted">{tr("intro")}</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy || view.locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="qd-two">
          {([ ["proposalId", "proposal"], ["evidenceId", "evidence"], ["customerContactId", "contact"], ["customerAcceptedAt", "time"] ] as const).map(([key, label]) =>
            <label className="field" key={key}><span>{tr(label)}</span><input required type="text" value={shownInputs[key]} onChange={event => change(key, event.target.value)} autoComplete="off" spellCheck={false} /></label>)}
        </div>
        {!view.locked && <button type="submit" disabled={busy}>{busy ? tr("loading") : tr("consult")}</button>}
      </fieldset>
    </form>
    {Boolean(view.error || (sameOwner && localError)) && <div role="alert"><ErrorBanner message={errorMessage(view.error || localError)} /></div>}
    {context && <div>
      <InfoBanner>{tr("inspect")}</InfoBanner>
      <dl style={{ overflowWrap: "anywhere" }}>
        <dt>{context.proposal.basis === "fixed_amount" ? tr("fixed") : tr("percent")}</dt>
        <dd>{context.proposal.basis === "fixed_amount" ? formatCurrency(context.proposal.value, context.proposal.currency) : `${context.proposal.value}% (${context.proposal.currency})`}</dd>
        <dt>{tr("revision")}</dt><dd>{context.proposal.revision}</dd>
        <dt>RFx / Lane / Shipper</dt><dd>{context.proposal.rfxId} / {context.proposal.laneId} / {context.proposal.shipperId}</dd>
        <dt>{tr("expires")}</dt><dd>{context.proposal.validUntil}</dd>
        <dt>{tr("source")}</dt><dd>{context.evidence.filename}</dd>
        <dt>Digest / Version</dt><dd>{context.evidence.sourceDigest} / {context.evidence.sourceVersion}</dd>
      </dl>
    </div>}
    {!view.locked && <div>
      <label className="row"><input type="checkbox" checked={humanVerified && !!context} disabled={!context || busy} onChange={event => setHumanVerified(event.target.checked)} /><span>{tr("verified")}</span></label>
      <button type="button" className="primary" disabled={!context || !humanVerified || busy} onClick={() => void run("record")}>{tr("record")}</button>
    </div>}
    {view.locked && !receipt && <div role="status" aria-live="polite">
      <InfoBanner>{view.result?.state === "not_found" ? tr("missing") : tr("uncertain")}</InfoBanner>
      <button type="button" disabled={busy} onClick={() => void run("lookup")}>{view.phase === "recording" ? tr("saving") : busy ? tr("loading") : tr("lookup")}</button>
    </div>}
    {receipt && <div role="status" aria-live="polite" style={{ overflowWrap: "anywhere" }}>
      <Pill tone="green">{tr("accepted")}</Pill>
      <p>{tr("receipt")}: {receipt.id}</p>
      <p>{tr("verifiedBy")}: {receipt.verifiedBy} · {receipt.verifiedAt}</p>
      <p className="qd-muted">{tr("off")}</p>
    </div>}
    {receipt && <ClientFeeRevocationPanel key={`${identity}:${authEpoch}:${receipt.id}`} reference={{proposalId:receipt.scope.proposalId,acceptanceId:receipt.id}}
      recoveryKey={`bidware.client-fee-revocation.v1:${identity}:${receipt.id}`} isCurrent={()=>current.current===bundle.token&&permission.current}/>}
  </section>;
}

export default ClientFeeAcceptancePanel;
