// Núcleo de POST /api/telefonos: reglas por lada y, para los dudosos, la IA
// (claude.ts, solo en el servidor). Solo para usuarios con sesión en Rateware;
// a la IA solo van el número, el nombre del carrier y su dominio. No envía
// mensajes ni cambia nada en Rateware. El simulado usa esto mismo sin IA.

import { aceptarRespuestaIA, clasificarTelefono, type ConsultaTelefono, type Telefono } from "../dominio/telefonos.js";

export const MAX_TELEFONOS = 50;

export type Preguntar = (dudosos: ConsultaTelefono[]) => Promise<{ id: string; pais: string | null; numero: string | null; motivo: string }[]>;

export interface Respuesta {
  status: number;
  body: any;
}

export async function revisarTelefonos(body: any, sesionValida: boolean, preguntar: Preguntar | null): Promise<Respuesta> {
  if (!sesionValida) return { status: 401, body: { error: "Inicia sesión para continuar.", code: "SIN_SESION" } };
  const lista: ConsultaTelefono[] = Array.isArray(body?.telefonos) ? body.telefonos : [];
  if (!lista.length || lista.length > MAX_TELEFONOS || lista.some((x) => typeof x?.id !== "string" || typeof x?.valor !== "string" || x.valor.length > 40))
    return { status: 400, body: { error: `Manda entre 1 y ${MAX_TELEFONOS} números.`, code: "TELEFONOS_INVALIDOS" } };
  const salida: Record<string, Telefono> = {};
  const dudosos: ConsultaTelefono[] = [];
  for (const x of lista) {
    const consulta = { id: x.id, valor: x.valor, carrier: x.carrier ? String(x.carrier).slice(0, 120) : null, dominio: x.dominio ? String(x.dominio).slice(0, 120) : null };
    const t = clasificarTelefono(consulta.valor, consulta);
    salida[x.id] = t;
    if (t.certeza === "dudoso" && String(x.valor).replace(/\D/g, "").length >= 10) dudosos.push(consulta);
  }
  let ia: "sin_dudosos" | "ok" | "no_configurada" | "fallo" = dudosos.length ? "ok" : "sin_dudosos";
  if (dudosos.length && !preguntar) ia = "no_configurada";
  else if (dudosos.length) {
    try {
      const respuestas = await preguntar!(dudosos);
      for (const q of dudosos) {
        const r = respuestas.find((x) => x?.id === q.id);
        if (r) salida[q.id] = aceptarRespuestaIA(q.valor, r);
      }
    } catch {
      ia = "fallo";
    }
  }
  return { status: 200, body: { telefonos: salida, ia, revisados_por_ia: ia === "ok" ? dudosos.length : 0 } };
}
