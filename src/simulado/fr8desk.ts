// Fr8Desk simulado: responde como /v1/casos (contrato servicio-comun-v1) para
// el modo simulado y las pruebas. Nunca sale a la red.
// - El mismo request_id con el mismo contenido devuelve el mismo caso (repetido);
//   con otro contenido, 409.
// - Solo guarda app, tipo y referencia del objeto, como Fr8Desk.

interface CasoSimulado {
  id: string;
  folio: string;
  asunto: string;
  estado: string;
  tipo: string;
  ref: string;
  huella: string;
}

export class Fr8DeskSimulado {
  casos: CasoSimulado[] = [];
  porRequest = new Map<string, CasoSimulado>();
  llamadas: { metodo: string; url: string; cabeceras: Record<string, string>; body: any }[] = [];

  constructor(private tokenValido = "fd_simulado") {}

  fetch: typeof fetch = async (entrada, init) => {
    const url = new URL(String(entrada));
    const metodo = init?.method || "GET";
    const cabeceras = { ...(init?.headers as Record<string, string>) };
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    this.llamadas.push({ metodo, url: url.toString(), cabeceras, body });
    const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

    if (cabeceras.authorization !== `Bearer ${this.tokenValido}`) return json(401, { codigo: "sin_credencial", mensaje: "Credencial de app no válida." });
    if (!cabeceras["x-fr8desk-actor"]) return json(403, { codigo: "actor_invalido", mensaje: "La persona no tiene acceso a Fr8Desk." });
    if (url.pathname !== "/v1/casos") return json(404, { codigo: "no_encontrado", mensaje: "No existe." });

    if (metodo === "GET") {
      const tipo = url.searchParams.get("tipo"), ref = url.searchParams.get("ref");
      const casos = this.casos.filter((c) => c.tipo === tipo && c.ref === ref).map(({ id, folio, asunto, estado }) => ({ id, folio, asunto, estado, prioridad: "media", equipo: "Sistemas" }));
      return json(200, { casos });
    }

    const huella = JSON.stringify([body.asunto, body.descripcion, body.equipo, body.impacto, body.objeto?.tipo, body.objeto?.ref]);
    const previo = this.porRequest.get(body.request_id);
    if (previo) {
      if (previo.huella !== huella) return json(409, { codigo: "conflicto", mensaje: "request_id reutilizado con otro contenido." });
      return json(200, { id: previo.id, folio: previo.folio, url: `/#/t/${previo.folio}`, repetido: true });
    }
    const n = this.casos.length + 1;
    const caso: CasoSimulado = {
      id: `cas00000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      folio: `FD-${String(n).padStart(4, "0")}`,
      asunto: body.asunto,
      estado: "nuevo",
      tipo: body.objeto.tipo,
      ref: body.objeto.ref,
      huella
    };
    this.casos.push(caso);
    this.porRequest.set(body.request_id, caso);
    return json(200, { id: caso.id, folio: caso.folio, url: `/#/t/${caso.folio}`, repetido: false });
  };
}
