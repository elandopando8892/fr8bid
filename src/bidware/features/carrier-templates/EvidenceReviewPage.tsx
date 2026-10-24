import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/language";
import { ErrorBanner, InfoBanner } from "@/components/ui";
import { ProviderAdvisory } from "./ProviderAdvisory";
import { PublishedClassification } from "./PublishedClassification";
import { downloadJSON, MAX_REVIEW_BYTES, parseReview, readCurrentCut, REVIEW_TTL_MS, verifyAgainstCut,
  type EvidenceCut, type ReviewBundle, type PlanEntry } from "./evidence-review";
import "./evidence-review.css";

export function EvidenceReviewPage() {
  const { user, role } = useAuth();
  const org = String(user?.app_metadata?.rateware_organization_id || user?.app_metadata?.organization_id || "");
  return <EvidenceReviewContent key={`${user?.id}:${role}:${org}`} org={org} />;
}
function EvidenceReviewContent({ org }: { org: string }) {
  const es = useLang() === "es";
  const text = (a: string, b: string) => es ? a : b;
  const [cut, setCut] = useState<EvidenceCut | null>(null), [bundle, setBundle] = useState<ReviewBundle | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(0), [now, setNow] = useState(Date.now()), [focus, setFocus] = useState("");
  const serial = useRef(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => { serial.current++; clearInterval(timer); }; }, []);
  const current = Boolean(bundle && checkedAt && now - checkedAt < REVIEW_TTL_MS);
  const ready = current && bundle?.plan.status === "ready_for_host_review";
  function explain(e: unknown): string {
    const code = e instanceof Error ? e.message : "";
    const messages: Record<string, [string, string]> = {
      REVIEW_CHANGED: ["Cambió la versión o membresía de las plantillas. Exporta otro corte y vuelve a ejecutar el clasificador.", "Template versions or members changed. Export a new cut and run the classifier again."],
      REVIEW_ORGANIZATION: ["El archivo o el catálogo no pertenece a la organización de esta sesión.", "The file or catalog does not belong to this session's organization."],
      REVIEW_TAXONOMY: ["Se requieren las 25 plantillas originales, sin duplicados. El catálogo actual no cumple ese alcance.", "Exactly the 25 original templates are required. The current catalog does not match that scope."],
      REVIEW_SIZE: ["El archivo excede el límite de 16 MB.", "The file exceeds the 16 MB limit."],
    };
    return messages[code]?.[es ? 0 : 1] ?? text("No se pudo verificar el paquete. Comprueba formato, integridad y conexión; no se cambió ninguna membresía.", "The package could not be verified. Check its format, integrity and connection; no memberships were changed.");
  }
  async function exportCut() {
    const turn = ++serial.current; setBusy(true); setError(null); setCheckedAt(0);
    try {
      const value = await readCurrentCut(org);
      if (turn !== serial.current) return;
      setCut(value); downloadJSON("bidware-carrier-cut.json", value);
    } catch (e) { if (turn === serial.current) { setCut(null); setError(explain(e)); } }
    finally { if (turn === serial.current) setBusy(false); }
  }
  async function check(input: ReviewBundle, turn: number) {
    if (input.plan.org_id !== org) throw new Error("REVIEW_ORGANIZATION");
    const live = await readCurrentCut(org);
    await verifyAgainstCut(input, live);
    if (turn !== serial.current) return;
    setCut(live); setBundle(input); setCheckedAt(Date.now()); setNow(Date.now());
    setFocus(input.plan.templates[0]?.template_id ?? "");
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    const turn = ++serial.current; setBusy(true); setError(null); setBundle(null); setCheckedAt(0); setFocus("");
    try {
      if (file.size > MAX_REVIEW_BYTES) throw new Error("REVIEW_SIZE");
      const input = await parseReview(await file.text());
      if (turn === serial.current) await check(input, turn);
    } catch (e) { if (turn === serial.current) setError(explain(e)); }
    finally { if (turn === serial.current) setBusy(false); }
  }
  async function revalidate() {
    if (!bundle) return;
    const turn = ++serial.current; setBusy(true); setError(null); setCheckedAt(0);
    try { await check(bundle, turn); }
    catch (e) { if (turn === serial.current) { setBundle(null); setError(explain(e)); } }
    finally { if (turn === serial.current) setBusy(false); }
  }
  const selected = bundle?.plan.templates.find(t => t.template_id === focus);
  const groups: [string, PlanEntry[]][] = selected ? [
    [text("Altas propuestas", "Proposed additions"), selected.proposed_additions],
    [text("Retiros propuestos", "Proposed removals"), selected.proposed_removals],
    [text("Miembros conservados con pendientes", "Members retained with pending evidence"), selected.pending_keeps],
    [text("Candidatos pendientes", "Held candidates"), selected.held_candidates],
  ] : [];
  return <>
    <header className="identity crm-head"><div className="crm-head-main">
      <div className="crumb"><Link to="/templates">Carrier list templates</Link></div>
      <h1>{text("Revisión de evidencia", "Evidence review")}</h1>
      <p className="sub">{text("Clasificador de ChatGPT · 25 plantillas originales", "ChatGPT classifier · 25 original templates")}</p>
    </div></header>
    <div className="evidence-review tpl-body">
      <InfoBanner>{text("Las propuestas conservan sus fuentes y pendientes de identidad. Esta revisión no aplica cambios ni autoriza operación o contacto.", "Proposals retain their sources and identity issues. This review does not apply changes or authorize operations or contact.")}</InfoBanner>
      <PublishedClassification org={org} />
      <h2>{text("Revisión local del clasificador (opcional)", "Local classifier review (optional)")}</h2>
      <section className="evidence-steps" aria-label={text("Preparar revisión", "Prepare review")}>
        <div><h2>1. {text("Corte actual", "Current cut")}</h2>
          <p>{text("Descarga versiones y miembros desde tu organización en Rateware.", "Download versions and members from your organization in Rateware.")}</p>
          <button disabled={busy || !org} onClick={exportCut}>{text("Exportar corte", "Export cut")}</button>
        </div>
        <div><h2>2. {text("Clasificador original", "Original classifier")}</h2>
          <p>{text("Ejecuta el motor local con ese corte y el archivo de evidencia existente. Conserva el catálogo aprobado y sus referencias.", "Run the local engine with that cut and the existing evidence file. Keep the approved catalog and its references.")}</p>
          <details><summary>{text("Comando local", "Local command")}</summary><pre>python tools/carrier-evidence/review.py build --input evidencia.json --snapshot bidware-carrier-cut.json --output revision-nueva</pre></details>
        </div>
        <div><h2>3. {text("Revisar propuestas", "Review proposals")}</h2>
          <p>{text("Importa review.json. Se verificará contra una lectura nueva; puedes guardar el archivo y abrirlo de nuevo después.", "Import review.json. It will be checked against a fresh read; save the file to reopen it later.")}</p>
          <label className="evidence-file">{text("Importar revisión", "Import review")}
            <input type="file" accept=".json,application/json" disabled={busy || !org} onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; void importFile(f); }} />
          </label>
        </div>
      </section>
      {!org && <ErrorBanner message={text("La sesión debe pertenecer a una organización.", "This session must belong to an organization.")} />}
      {error && <ErrorBanner message={error} />}
      {busy && <p role="status">{text("Verificando…", "Verifying…")}</p>}
      {cut && <p>{text(`Corte: 25 plantillas. ${cut.outside_scope} listas vigentes fuera del alcance de este motor.`, `Cut: 25 templates. ${cut.outside_scope} current lists outside this engine's scope.`)}</p>}
      {bundle && <section aria-label={text("Resultado de revisión", "Review result")}>
        <div className="evidence-toolbar">
          <b role="status">{!current ? text("Verificación vencida · vuelve a verificar", "Verification expired · verify again") : ready
            ? text("Versiones y miembros coinciden", "Versions and members match") : text("Plan bloqueado por evidencia", "Plan blocked by evidence")}</b>
          <button disabled={busy} onClick={revalidate}>{text("Volver a verificar", "Verify again")}</button>
          <button disabled={!current || busy} onClick={() => downloadJSON("bidware-carrier-review-verified.json", {
            ...bundle, verification: { checked_at: new Date(checkedAt).toISOString(), cut, changes_applied: 0, evidence_authenticity_certified: false },
          })}>{text("Guardar revisión", "Save review")}</button>
        </div>
        <p>{text("La coincidencia acredita el corte de membresías. Las fuentes y la aprobación del catálogo son las declaradas en el archivo; no constituyen certificación de producción.", "The match verifies the membership cut. Evidence sources and catalog approval are supplied by the file; this is not production certification.")}</p>
        <p>{text("Catálogo", "Catalog")}: <b>{bundle.plan.catalog_version}</b> · {text("Referencia", "Reference")}: {bundle.audit.catalog_approval_ref || "—"}</p>
        <details><summary>{text("Trazabilidad", "Traceability")}</summary><div className="evidence-hashes">
          <p>Plan SHA-256: {bundle.plan.plan_hash}</p><p>Input SHA-256: {bundle.plan.input_hash}</p>
          <p>Source SHA-256: {bundle.receipt.source_file_sha256}</p><p>{bundle.plan.module_version}</p>
        </div></details>
        {current && bundle.plan.blockers.length > 0 && <ul>{bundle.plan.blockers.map((b, i) => <li key={i}>{b.code}: {b.ref}</li>)}</ul>}
        {ready && <>
          <div className="evidence-counts">{Object.entries(bundle.audit.summary.by_status).map(([status, count]) => <span key={status}><b>{count}</b> {status}</span>)}</div>
          <div className="crm-table-wrap"><table className="data evidence-table"><thead><tr>
            <th>Template</th><th>{text("Actuales", "Current")}</th><th>{text("Altas", "Adds")}</th><th>{text("Retiros", "Removals")}</th><th>{text("Pendientes", "Pending")}</th>
          </tr></thead><tbody>{bundle.plan.templates.map(t => <tr key={t.template_id}>
            <td><button className="link" onClick={() => setFocus(t.template_id)} aria-pressed={focus === t.template_id}>{t.template}</button></td>
            <td>{t.before_vendor_ids.length}</td><td>{t.proposed_additions.length}</td><td>{t.proposed_removals.length}</td><td>{t.pending_keeps.length + t.held_candidates.length}</td>
          </tr>)}</tbody></table></div>
          {selected && <section className="evidence-detail"><h2>{selected.template}</h2>
            {groups.map(([label, entries]) => <div key={label}><h3>{label} · {entries.length}</h3>
              {entries.map(e => <details key={e.vendor_id}><summary>{e.vendor_id} · {e.status}</summary>
                <p>{e.reason_codes.join(" · ") || "—"}</p><p>{e.restrictions.join(" · ")}</p>
                <ul>{e.source_refs.map((s, i) => <li key={i}>{s.ref_id}: {s.source} · {s.locator}</li>)}</ul>
                <ProviderAdvisory vendorId={e.vendor_id} />
              </details>)}
            </div>)}
          </section>}
        </>}
      </section>}
    </div>
  </>;
}
