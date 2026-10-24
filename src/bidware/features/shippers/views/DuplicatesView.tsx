import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, InfoBanner, Kpis, Pill, Spinner, dateShort } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { listDuplicates, mergeShippers, type DuplicateGroup } from "../crm.service";
import { shipperLabel, SHIPPER_STATUS_LABEL, type Shipper } from "../shippers.service";

const REASON: Record<string, string> = {
  domain: "Mismo dominio",
  email: "Mismo correo de contacto",
  legal_name: "Mismo nombre",
};

const MOVED: Record<string, string> = {
  contacts: "contactos",
  locations: "sitios",
  lanes: "rutas",
  rfis: "RFIs",
  opportunities: "oportunidades",
  actions: "acciones",
};

/**
 * Pairs the CRM holds as the same company (exact domain, contact email or
 * name). Keeping one moves everything of the other to it and archives the
 * other; that is an Administrador's, and it can't be undone.
 */
export function DuplicatesView() {
  const { can } = useAuth();
  const isAdmin = can("admin");
  const data = useAsync(listDuplicates, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = data.data?.groups ?? [];

  async function keep(group: DuplicateGroup, kept: Shipper, other: Shipper) {
    const ok = await confirmAsync(
      `Se conservará «${shipperLabel(kept)}» y se le pasará todo lo de «${shipperLabel(other)}»: contactos, sitios, rutas, RFIs, oportunidades y acciones. ` +
        `«${shipperLabel(other)}» queda archivado. Los datos vacíos de uno se llenan con los del otro. No se puede deshacer.\n\n¿Continuar?`,
    );
    if (!ok) return;
    setBusy(group.key);
    setError(null);
    setNotice(null);
    try {
      const res = await mergeShippers(kept.id, other.id);
      const moved = Object.entries(res.moved_records ?? {})
        .filter(([, n]) => n)
        .map(([entity, n]) => `${n} ${MOVED[entity] ?? entity}`)
        .join(", ");
      setNotice(`«${shipperLabel(other)}» quedó dentro de «${shipperLabel(kept)}»${moved ? ` (${moved})` : ""}.`);
      data.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Kpis
        items={[
          { label: "Cuentas revisadas", value: data.data?.scanned ?? "—" },
          { label: "Posibles duplicados", value: groups.length, accent: true },
          { label: "Regla", value: "Coincidencia exacta" },
        ]}
      />
      <div className="row">
        <span className="cell-sub">Compara dominio, correo del contacto principal y nombre (sin acentos). Los archivados no cuentan.</span>
        <div className="spacer" />
        <button onClick={data.reload} disabled={data.loading}>
          Volver a revisar
        </button>
      </div>
      {!isAdmin && <InfoBanner>Fusionar es de un Administrador: puedes revisar los pares y avisarle.</InfoBanner>}
      {notice && <InfoBanner>{notice}</InfoBanner>}
      {(data.error || error) && <ErrorBanner message={(data.error || error)!} />}
      {data.data?.truncated && <InfoBanner>Se revisaron las primeras 5,000 cuentas.</InfoBanner>}
      {data.loading && !data.data ? (
        <Spinner label="Buscando duplicados…" />
      ) : !groups.length ? (
        <Empty title="Sin duplicados" hint="Ningún par de shippers comparte dominio, correo del contacto principal o nombre." />
      ) : (
        groups.map((group) => {
          const [a, b] = group.shippers;
          if (!a || !b) return null;
          return (
            <div key={group.key} className="card">
              <div className="row" style={{ gap: 6, marginBottom: 10 }}>
                {group.reasons.map((reason) => (
                  <Pill key={reason} tone="amber">
                    {REASON[reason] ?? reason}
                  </Pill>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  [a, b],
                  [b, a],
                ].map(([kept, other], i) => {
                  // Keeping the one without a domain would hand it the other's domain while that one is still live: the database refuses.
                  const blocked = !kept.domain && Boolean(other.domain);
                  return (
                    <div key={kept.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
                      <div className="cell-sub">Cuenta {i === 0 ? "A" : "B"}</div>
                      <Link to={`/shippers/${kept.id}`} className="cell-title">
                        {shipperLabel(kept)}
                      </Link>
                      <div className="cell-sub">{[kept.legal_name !== kept.shipper_name ? kept.legal_name : null, kept.domain].filter(Boolean).join(" · ")}</div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        <div>{[kept.primary_contact_name, kept.primary_contact_email].filter(Boolean).join(" · ") || "Sin contacto"}</div>
                        <div className="cell-sub">
                          {[kept.headquarters_city, kept.headquarters_state].filter(Boolean).join(", ")} · {SHIPPER_STATUS_LABEL[kept.status ?? ""] ?? kept.status} ·
                          actualizado {dateShort(kept.updated_at)}
                        </div>
                      </div>
                      <button
                        style={{ marginTop: 10 }}
                        disabled={!isAdmin || Boolean(busy) || blocked}
                        title={!isAdmin ? NEED_REASON.admin : blocked ? "Conserva la cuenta que tiene dominio: la base no permite dos cuentas vivas con el mismo." : undefined}
                        onClick={() => keep(group, kept, other)}
                      >
                        {busy === group.key ? "Fusionando…" : `Conservar ${i === 0 ? "A" : "B"}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
