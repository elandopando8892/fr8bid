import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync } from "@/components/confirm";
import { Empty, ErrorBanner, InfoBanner, Kpis, Pill } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { importShippers, importShipperWorkbook, type ImportResult } from "../crm.service";
import { ALIASES, downloadTemplate, parseFile, pick, type Parsed } from "../shipperImport";

/**
 * Bring shippers in from a file, as rateware's Shipper CRM does: a CSV or a
 * single sheet is a flat list (import_shippers: a live shipper with the same
 * domain gets updated); a workbook with Accounts plus Contacts or
 * Opportunities is a CRM export linked by external ids
 * (import_shipper_crm_workbook). Nothing is written until "Importar".
 */
export function ImportView() {
  const { can } = useAuth();
  const canWork = can("operate");
  const isAdmin = can("admin");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [source, setSource] = useState("pipedrive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const ready = parsed?.preview.filter((p) => !p.problem) ?? [];
  const withExternal = parsed?.preview.filter((p) => pick(p.row, ALIASES.external)).length ?? 0;

  async function choose(file: File | undefined) {
    setError(null);
    setResult(null);
    setParsed(null);
    if (!file) return;
    try {
      setParsed(await parseFile(file, isAdmin));
    } catch (e) {
      setError(`No pudimos leer ${file.name}: ${(e as Error).message}`);
    }
  }

  async function run() {
    if (!parsed || !ready.length) return;
    const what = parsed.relational
      ? `${parsed.accounts.length} cuenta(s), ${parsed.contacts.length} contacto(s) y ${parsed.opportunities.length} oportunidad(es) de «${source}»`
      : `${ready.length} shipper(s)`;
    if (!(await confirmAsync(`Se importarán ${what}. Los que ya existan (mismo dominio o misma clave externa) se actualizan con los campos que traigan valor.\n\n¿Continuar?`))) return;
    setBusy(true);
    setError(null);
    try {
      setResult(
        parsed.relational
          ? await importShipperWorkbook({
              // Archiving a shipper through an import is an Administrador's; the server refuses the whole book otherwise.
              accounts: parsed.accounts.filter((row) => isAdmin || pick(row, ALIASES.status).toLowerCase() !== "archived"),
              contacts: parsed.contacts,
              opportunities: parsed.opportunities,
              source_system: source.trim() || "pipedrive",
            })
          : await importShippers(ready.map((p) => p.row)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const count = (pair?: { inserted: number; updated: number }) => (pair ? `${pair.inserted} nuevo(s), ${pair.updated} actualizado(s)` : "");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card">
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: 1, minWidth: 260 }}>
            <span>Archivo (CSV o Excel)</span>
            <input type="file" accept=".csv,.xlsx,.xls" disabled={!canWork || busy} onChange={(e) => choose(e.target.files?.[0])} />
          </label>
          <button onClick={downloadTemplate}>Descargar plantilla</button>
        </div>
        <p className="cell-sub" style={{ margin: "8px 0 0" }}>
          Un CSV o una sola hoja es una lista de shippers. Un Excel con hojas Accounts y Contacts u Opportunities (como una exportación de Pipedrive) trae
          también contactos y oportunidades, ligados por su clave externa.
        </p>
        {!canWork && <p className="cell-sub">{NEED_REASON.operate}</p>}
      </div>

      {error && <ErrorBanner message={error} />}
      {result && (
        <InfoBanner title="Importación terminada.">
          {parsed?.relational
            ? `Cuentas: ${count(result.accounts)}. Contactos: ${count(result.contacts)}. Oportunidades: ${count(result.opportunities)}.`
            : `${result.inserted ?? 0} nuevo(s), ${result.updated ?? 0} actualizado(s).`}{" "}
          {result.skipped ? `${result.skipped} fila(s) omitida(s).` : ""}
        </InfoBanner>
      )}
      {result?.skipped_rows?.length ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Filas omitidas</h2>
          {result.skipped_rows.map((s, i) => (
            <div key={i} className="cell-sub">
              {s.entity ? `${s.entity} · ` : ""}fila {s.row}: {s.reason}
            </div>
          ))}
        </div>
      ) : null}

      {parsed && (
        <>
          <Kpis
            items={[
              { label: "Filas leídas", value: parsed.preview.length },
              { label: "Listas", value: ready.length, accent: true },
              { label: "Con clave externa", value: withExternal },
              { label: "Por revisar", value: parsed.preview.length - ready.length },
            ]}
          />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <Pill tone={parsed.relational ? "blue" : ""}>{parsed.relational ? "Exportación de CRM (cuentas, contactos y oportunidades)" : "Lista de shippers"}</Pill>
            <span className="cell-sub">{parsed.file}</span>
            {parsed.relational && (
              <label className="row" style={{ gap: 6 }}>
                <span className="cell-sub">Sistema de origen</span>
                <input style={{ width: 140 }} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Sistema de origen" />
              </label>
            )}
            <div className="spacer" />
            <button className="primary" disabled={!canWork || busy || !ready.length} onClick={run}>
              {busy ? "Importando…" : parsed.relational ? "Importar el libro" : `Importar ${ready.length} fila(s) listas`}
            </button>
          </div>
          {!parsed.preview.length ? (
            <Empty title="El archivo no tiene filas" hint="La primera fila con datos se toma como encabezado." />
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="data" style={{ border: "none" }}>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Cuenta</th>
                    <th>Dominio</th>
                    <th>Contacto</th>
                    <th>Ciudad</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.preview.slice(0, 100).map((p) => (
                    <tr key={p.line}>
                      <td className="cell-sub">{p.line}</td>
                      <td>{p.name || <span className="cell-sub">—</span>}</td>
                      <td>{p.domain || <span className="cell-sub">—</span>}</td>
                      <td>{p.contact || <span className="cell-sub">—</span>}</td>
                      <td>{p.city || <span className="cell-sub">—</span>}</td>
                      <td>{p.problem ? <Pill tone="amber">{p.problem}</Pill> : <Pill tone="green">Lista</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.preview.length > 100 && <div className="cell-sub" style={{ padding: "8px 16px" }}>Se muestran las primeras 100 de {parsed.preview.length}.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
