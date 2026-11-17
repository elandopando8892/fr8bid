import type { ClienteContactos } from "../dominio/contactosEmpresa";
export function contactosHttp(token: () => Promise<string | null>, http: typeof fetch = fetch): ClienteContactos {
  return async solicitud => {
    const actual = await token();
    if (!actual) throw new Error("Inicia sesión para continuar.");
    let r: Response;
    try {
      r = await http("/api/contactos-empresa", { method: "POST", cache: "no-store", headers: {
        "content-type": "application/json", authorization: `Bearer ${actual}`
      }, body: JSON.stringify(solicitud), signal: AbortSignal.timeout(45000) });
    } catch { throw new Error("No llegó la respuesta. Vuelve a consultar esta empresa para recuperar su operación."); }
    const datos = await r.json().catch(() => null);
    if (!r.ok || !datos) throw new Error(datos?.error || "El servicio no respondió. Vuelve a consultar esta empresa.");
    return datos;
  };
}
