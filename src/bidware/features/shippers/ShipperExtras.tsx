import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { Empty, ErrorBanner, InfoBanner, Spinner, dateShort } from "@/components/ui";
import { NEED_REASON } from "@/lib/roles";
import { createProfileLink, liveProfileRequest, revokeProfileLink, shipperActivity, type ProfileRequest } from "./crm.service";

const ACTIVITY_LABEL: Record<string, string> = {
  shipper_created: "Alta del shipper",
  shipper_updated: "Datos actualizados",
  shipper_relationship_stage_moved: "Cambio de relación",
  "shipper.bulk.archive": "Archivado",
  shipper_accounts_merged: "Fusión de duplicados",
  shipper_account_action_created: "Acción creada",
  shipper_account_action_updated: "Acción actualizada",
  shipper_account_action_deleted: "Acción eliminada",
  shipper_account_action_status_updated: "Estado de una acción",
  shipper_account_playbook_applied: "Plan de trabajo",
  shipper_rfi_promoted: "RFI a oportunidad",
  shipper_opportunity_stage_moved: "Etapa de una oportunidad",
  shipper_opportunity_rfx_created: "Proyecto RFx creado",
  "shipper.profile_request.create": "Liga de perfil",
  "shipper.record.delete": "Registro eliminado",
  quotedesk_quote_created: "Cotización creada",
  bid_room_project_created: "Evento del Bid Room",
};

/** The audit log keeps the workspace ("org:…") as the actor when there's no person. */
const actorLabel = (actor: string | null) => (!actor ? "—" : actor.startsWith("org:") ? "Equipo" : actor);

const when = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${dateShort(value)} ${date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
};

/** What the team did with this shipper, from the audit log (its latest entries). */
export function ActivityTab({ shipperId }: { shipperId: string }) {
  const activity = useAsync(() => shipperActivity(shipperId), [shipperId]);
  const rows = activity.data ?? [];
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <h2 style={{ margin: 0 }}>Actividad</h2>
        <span className="cell-sub">{rows.length}</span>
        <div className="spacer" />
        <button onClick={activity.reload} disabled={activity.loading}>
          Actualizar
        </button>
      </div>
      {activity.error && (
        <div style={{ padding: 16 }}>
          <ErrorBanner message={activity.error} />
        </div>
      )}
      {activity.loading && !activity.data ? (
        <Spinner label="Cargando actividad…" />
      ) : !rows.length ? (
        <div style={{ padding: 16 }}>
          <Empty title="Sin actividad reciente" hint="Aquí aparecen altas, cambios de etapa, acciones y planes de trabajo de este shipper." />
        </div>
      ) : (
        <table className="data" style={{ border: "none" }}>
          <thead>
            <tr>
              <th>Qué pasó</th>
              <th>Quién</th>
              <th>Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="cell-title">{ACTIVITY_LABEL[row.action] ?? row.action}</div>
                  {row.summary && <div className="cell-sub">{row.summary}</div>}
                </td>
                <td>{actorLabel(row.actor_email)}</td>
                <td className="cell-sub" style={{ whiteSpace: "nowrap" }}>
                  {when(row.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * The shipper's private 30-day link to complete its own profile (legal
 * identity, billing, contacts, sites). The backend keeps only a hash, so the
 * link is shown once; renewing makes a new one and retires the old.
 */
export function ProfileLinkCard({
  shipperId,
  requests,
  onChanged,
}: {
  shipperId: string;
  requests: ProfileRequest[];
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const canWork = can("operate");
  const isAdmin = can("admin");
  const live = liveProfileRequest(requests);
  const lastSubmitted = requests.filter((r) => r.submitted_at).sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))[0];
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await createProfileLink(shipperId);
      setUrl(res.url);
      await copy(res.url);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!live) return;
    if (!(await confirmAsync("La liga dejará de funcionar para el shipper. ¿Revocarla?"))) return;
    setBusy(true);
    setError(null);
    try {
      await revokeProfileLink(live.id);
      setUrl(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const status = !live
    ? null
    : live.status === "submitted"
      ? `El shipper envió su perfil el ${dateShort(live.submitted_at)}.`
      : live.status === "viewed"
        ? `El shipper la abrió el ${dateShort(live.viewed_at)} y aún no la envía.`
        : "Aún no la abre.";

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Liga para que el shipper complete su perfil</h2>
        <div className="spacer" />
        {live && (
          <button disabled={!isAdmin || busy} title={isAdmin ? undefined : NEED_REASON.admin} onClick={revoke}>
            Revocar
          </button>
        )}
        <button className="primary" disabled={!canWork || busy} title={canWork ? undefined : NEED_REASON.operate} onClick={create}>
          {busy ? "Creando…" : live ? "Renovar y copiar liga" : "Crear liga segura"}
        </button>
      </div>
      <p className="cell-sub" style={{ margin: "0 0 8px" }}>
        Una liga privada de 30 días donde el shipper llena su identidad legal, facturación, integración, contactos y sitios. Lo que
        envía entra directo a su registro.
      </p>
      {error && <ErrorBanner message={error} />}
      {live && (
        <InfoBanner title={`Liga activa hasta el ${dateShort(live.expires_at)}.`}>
          {status} La liga solo se muestra al crearla; si no la tienes, renuévala.
        </InfoBanner>
      )}
      {url && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Liga de perfil" style={{ flex: 1 }} />
          <button onClick={() => copy(url)}>{copied ? "Copiada" : "Copiar"}</button>
        </div>
      )}
      {!live && lastSubmitted && <p className="cell-sub" style={{ margin: "8px 0 0" }}>Último perfil recibido: {dateShort(lastSubmitted.submitted_at)}.</p>}
    </div>
  );
}
