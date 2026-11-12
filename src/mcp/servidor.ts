import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { crearLecturas, herramientas } from "./lecturas.js";
import type { Transporte } from "../cliente/api.js";
import type { Rol } from "../dominio/tipos.js";
import { ErrorApi } from "../cliente/api.js";

export function crearServidor(t: Transporte, rol: Rol, ahora?: () => Date) {
  const servidor = new McpServer({ name: "fr8bid-mcp-server", version: "0.1.0" });
  const leer = crearLecturas(t, ahora, rol);
  for (const [nombre, h] of Object.entries(herramientas)) {
    servidor.registerTool(nombre, {
      description: h.descripcion,
      inputSchema: h.schema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    }, async (args: Record<string, unknown>) => {
      try {
        const result = await leer(nombre, args);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (e) {
        // No devolver mensajes externos: pueden contener credenciales o datos ajenos.
        const code = e instanceof z.ZodError ? "ARGUMENTOS" : e instanceof ErrorApi ? `HTTP_${e.status}` : "LECTURA_NO_COMPLETADA";
        return { isError: true, content: [{ type: "text" as const, text: `${code}: no se pudo completar la consulta. Revisa los parámetros, la sesión o la Mesa. No se reintentó ni se escribió nada.` }] };
      }
    });
  }
  return servidor;
}
