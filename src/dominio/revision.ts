// Regla «solo carriers revisados» (PRIMA, 22-oct): la invitación sale solo a
// carriers preseleccionados que Jose marcó como «Revisado» en Bidware. La marca
// vigente es la última de cada carrier en list_rfx_invitation_wave_reviews;
// revocar escribe reviewed:false. Si no se pudo consultar, nadie se invita.

import type { Detalle, Participacion } from "./tipos.js";

export type EstadoRevision = "revisado" | "sin_revision" | "revocada" | "sin_consulta";

export interface MarcaRevision {
  revisado: boolean;
  en: string | null;
  por: string | null;
}

export const MOTIVO_OMISION: Record<Exclude<EstadoRevision, "revisado">, string> = {
  sin_revision: "sin revisión",
  revocada: "revisión revocada",
  sin_consulta: "no se pudo consultar la revisión"
};

// Última marca por carrier (vendor_id), ordenada por reviewed_at.
export function revisionesVigentes(rows: Record<string, any>[]): Record<string, MarcaRevision> {
  const porCarrier: Record<string, MarcaRevision> = {};
  const ordenadas = [...rows].sort((a, b) => String(a.reviewed_at || "").localeCompare(String(b.reviewed_at || "")));
  for (const r of ordenadas) {
    if (!r?.vendor_id) continue;
    porCarrier[String(r.vendor_id)] = { revisado: r.reviewed === true, en: r.reviewed_at || null, por: r.reviewed_by || null };
  }
  return porCarrier;
}

export function estadoRevision(d: Pick<Detalle, "revisiones">, carrierId: string): EstadoRevision {
  if (!d.revisiones) return "sin_consulta";
  const m = d.revisiones[carrierId];
  if (!m) return "sin_revision";
  return m.revisado ? "revisado" : "revocada";
}

export interface Audiencia {
  aptas: Participacion[];
  omitidas: { p: Participacion; estado: Exclude<EstadoRevision, "revisado">; motivo: string }[];
}

// Preseleccionadas que pueden recibir invitación y las que se omiten, con motivo.
export function audienciaInvitacion(d: Detalle): Audiencia {
  const aptas: Participacion[] = [];
  const omitidas: Audiencia["omitidas"] = [];
  for (const p of d.rutas.flatMap((r) => r.participaciones)) {
    if (p.estado !== "preseleccionada") continue;
    const e = estadoRevision(d, p.carrierId);
    if (e === "revisado") aptas.push(p);
    else omitidas.push({ p, estado: e, motivo: MOTIVO_OMISION[e] });
  }
  return { aptas, omitidas };
}

export function resumenOmisiones(a: Audiencia): string {
  if (!a.omitidas.length) return "";
  const conteo = new Map<string, number>();
  for (const o of a.omitidas) conteo.set(o.motivo, (conteo.get(o.motivo) || 0) + 1);
  return `${a.omitidas.length} carrier(s) no se invitan: ${[...conteo].map(([m, n]) => `${n} ${m}`).join(", ")}.`;
}
