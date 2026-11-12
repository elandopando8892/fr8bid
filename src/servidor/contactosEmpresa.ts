const campos: Record<string, string[]> = {
  context: ["vendor_id"], resolve_known: ["vendor_id"], choose_known: ["vendor_id", "email"], search: ["vendor_id", "page"],
  prepare_reveal: ["vendor_id", "person_id"], confirm_reveal: ["operation_id", "confirmation_hash"],
  operation: ["vendor_id", "operation_id"], apply_result: ["operation_id"]
};
const escrituras = new Set(["resolve_known", "choose_known", "search", "prepare_reveal", "confirm_reveal", "apply_result"]);
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function reenviarContactos(body: unknown, auth: string | null, permitir: boolean, enviar: (body: Record<string, unknown>, auth: string) => Promise<{ status: number; body: unknown }>) {
  const error = (status: number, code: string, mensaje: string) => ({ status, body: { code, error: mensaje } });
  if (!auth?.startsWith("Bearer ") || auth.length < 8) return error(401, "SESSION_REQUIRED", "Inicia sesión para continuar.");
  if (!body || typeof body !== "object" || Array.isArray(body)) return error(400, "INVALID_REQUEST", "Solicitud no válida.");
  const b = body as Record<string, unknown>, action = String(b.action);
  if (!Object.hasOwn(campos, action) || Object.keys(b).some(k => k !== "action" && !campos[action].includes(k)) || JSON.stringify(b).length > 8192)
    return error(400, "INVALID_REQUEST", "Solicitud no válida.");
  if ((b.vendor_id !== undefined && !uuid.test(String(b.vendor_id))) || (b.operation_id !== undefined && !uuid.test(String(b.operation_id))))
    return error(400, "INVALID_REQUEST", "Empresa u operación no válida.");
  if (escrituras.has(action) && !permitir) return error(403, "WRITES_DISABLED", "La actualización de contactos no está habilitada en este entorno.");
  try {
    const r = await enviar(b, auth);
    if (r.status >= 400) {
      // Upstream response bodies can contain infrastructure details. Only this
      // adapter's public messages cross the frontend boundary.
      const code = String((r.body as { code?: unknown } | null)?.code ?? "");
      const mensajes: Record<string, string> = {
        CREDIT_POLICY_UNAVAILABLE: "Falta verificar la tarifa o la conexión de Apollo. No se solicitarán créditos.",
        COMPANY_DOMAIN_REQUIRED: "Revisa el dominio propio de esta empresa antes de buscar.",
        CONFIRMATION_CHANGED: "La selección o confirmación cambió. Actualiza la empresa antes de confirmar.",
        APOLLO_LIMIT: "Apollo pidió esperar. Vuelve a consultar más tarde.",
        APOLLO_CONFIGURATION: "La conexión con Apollo necesita revisión.",
        WRITES_DISABLED: "La actualización de contactos no está habilitada en este entorno."
      };
      const mensaje = mensajes[code] || (r.status === 401 ? "Inicia sesión para continuar." : r.status === 403 ? "Tu cuenta no puede realizar esta acción." : "No pudimos completar la consulta. Recupera el estado de esta empresa.");
      return error(r.status, Object.hasOwn(mensajes, code) ? code : "CONTACT_SERVICE_UNAVAILABLE", mensaje);
    }
    if (r.body && typeof r.body === "object" && "capabilities" in r.body && r.body.capabilities && typeof r.body.capabilities === "object") {
      const c = r.body.capabilities as Record<string, unknown>;
      return { ...r, body: { ...r.body, capabilities: { ...c,
        can_write: permitir && c.can_write === true, can_spend: permitir && c.can_spend === true, can_search: permitir && c.can_search === true
      } } };
    }
    return r;
  } catch {
    return error(504, "CONTACT_UNCERTAIN", "No llegó la respuesta. Vuelve a consultar esta empresa para recuperar la operación antes de confirmar otra vez.");
  }
}
