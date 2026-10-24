import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/language";
import { getProviderAdvisory, type ProviderAdvisory as Advisory } from "./provider-advisory.service";

/** Explicit, independent read. This component exposes no eligibility or selection callbacks. */
export function ProviderAdvisory({ vendorId }: { vendorId: string }) {
  const { user, role } = useAuth();
  const org = user?.app_metadata?.rateware_organization_id || user?.app_metadata?.organization_id || "";
  return <ProviderAdvisoryContent key={`${vendorId}:${user?.id}:${role}:${org}`} vendorId={vendorId} />;
}
function ProviderAdvisoryContent({ vendorId }: { vendorId: string }) {
  const lang = useLang(), es = lang === "es";
  const [result, setResult] = useState<Advisory | null>(null), [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function load() {
    if (busy) return;
    setBusy(true); setResult(null);
    const value = await getProviderAdvisory(vendorId);
    if (alive.current) { setResult(value); setBusy(false); }
  }
  const labels = es ? { NOT_ASSESSED: "Sin evaluar", PENDING: "Pendiente", OBSERVED: "Con observaciones", EXPIRED: "Documentos vencidos", REJECTED: "Relación rechazada", UNAVAILABLE: "No disponible" }
    : { NOT_ASSESSED: "Not assessed", PENDING: "Pending", OBSERVED: "Observations", EXPIRED: "Expired documents", REJECTED: "Relationship rejected", UNAVAILABLE: "Unavailable" };
  return <div className="provider-advisory" onClick={e => e.stopPropagation()}>
    <button className="link" type="button" onClick={load} disabled={busy} aria-label={`${es ? "Consultar Provider Service" : "Read Provider Service"} ${vendorId}`}>
      {busy ? (es ? "Consultando…" : "Loading…") : "Provider Service"}
    </button>
    {result && <div role="status" className="cell-sub">
      <b>{labels[result.status]}</b>
      <p>{es ? "Información consultiva. No condiciona RFQ ni adjudicación; no autoriza contacto ni transporte." : "Advisory only. Does not gate RFQ or award; does not authorize contact or transport."}</p>
      {result.reason === "FEATURE_DISABLED" && <p>{es ? "Consulta aún desactivada." : "Advisory lookup is disabled."}</p>}
    </div>}
  </div>;
}
