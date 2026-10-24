// Núcleo de POST /api/apollo: buscar personas de un carrier por su dominio
// (gratis) y revelar el correo de una persona (1 crédito, solo con
// confirmar: true). Solo con sesión de Rateware; la clave vive en APOLLO_API_KEY
// de Vercel y no viaja al navegador. No guarda ni envía nada.

import { leerPersonas, leerRevelado } from "../dominio/apollo.js";

export const MAX_PERSONAS = 50;

// Llama a la API de Apollo (ruta relativa a https://api.apollo.io/api/v1/).
export type LlamarApollo = (ruta: "mixed_people/api_search" | "people/match", body: Record<string, unknown>) => Promise<{ status: number; body: any }>;

export interface Respuesta {
  status: number;
  body: any;
}

const DOMINIO = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const ID_PERSONA = /^[a-f0-9]{24}$/;

// sesion.admin: solo el Administrador gasta créditos (rol de app_metadata.roles).
export async function consultarApollo(body: any, sesion: { valida: boolean; admin: boolean }, llamar: LlamarApollo | null): Promise<Respuesta> {
  if (!sesion.valida) return { status: 401, body: { error: "Inicia sesión para continuar.", code: "SIN_SESION" } };
  if (!llamar) return { status: 503, body: { error: "Apollo todavía no está configurado (falta APOLLO_API_KEY en Vercel).", code: "APOLLO_NO_CONFIGURADO" } };
  try {
    if (body?.accion === "buscar") {
      const dominio = String(body.dominio || "").toLowerCase();
      if (!DOMINIO.test(dominio) || dominio.length > 100) return { status: 400, body: { error: "Dominio no válido.", code: "DOMINIO_INVALIDO" } };
      const r = await llamar("mixed_people/api_search", { q_organization_domains_list: [dominio], per_page: MAX_PERSONAS, page: 1 });
      if (r.status !== 200) return falla(r.status);
      return { status: 200, body: { dominio, total: Number(r.body?.total_entries || 0), personas: leerPersonas(r.body), creditos: 0 } };
    }
    if (body?.accion === "revelar") {
      const id = String(body.persona_id || "");
      if (!ID_PERSONA.test(id)) return { status: 400, body: { error: "Persona no válida.", code: "PERSONA_INVALIDA" } };
      // Gasta 1 crédito: la Mesa solo lo manda después de «Sí, gastar 1 crédito».
      if (!sesion.admin) return { status: 403, body: { error: "Solo el Administrador puede gastar créditos de Apollo.", code: "SOLO_ADMIN" } };
      if (body.confirmar !== true) return { status: 400, body: { error: "Confirma antes de gastar el crédito.", code: "SIN_CONFIRMAR" } };
      const r = await llamar("people/match", { id, reveal_personal_emails: false, reveal_phone_number: false });
      if (r.status !== 200) return falla(r.status);
      const revelado = leerRevelado(id, r.body);
      return { status: 200, body: { ...revelado, creditos: revelado.correo ? 1 : 0 } };
    }
    return { status: 400, body: { error: "Acción no válida.", code: "ACCION_INVALIDA" } };
  } catch {
    return { status: 502, body: { error: "Apollo no respondió.", code: "APOLLO_SIN_RESPUESTA" } };
  }
}

function falla(status: number): Respuesta {
  if (status === 401 || status === 403) return { status: 502, body: { error: "Apollo rechazó la clave (revisa APOLLO_API_KEY).", code: "APOLLO_CLAVE" } };
  if (status === 422 || status === 402) return { status: 502, body: { error: "Apollo no tiene créditos o el plan no lo permite.", code: "APOLLO_CREDITOS" } };
  if (status === 429) return { status: 429, body: { error: "Apollo pidió esperar un momento (límite de consultas).", code: "APOLLO_LIMITE" } };
  return { status: 502, body: { error: `Apollo respondió ${status}.`, code: "APOLLO_ERROR" } };
}
