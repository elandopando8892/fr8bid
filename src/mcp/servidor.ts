import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { crearLecturas, herramientas } from "./lecturas.js";
import { crearEscrituras, herramientasEscritura, Rechazo, type ContextoEscrituras } from "./escrituras.js";
import type { Transporte } from "../cliente/api.js";
import type { Rol } from "../dominio/tipos.js";
import { ErrorApi } from "../cliente/api.js";

/** Escrituras: transporte de escritura propio (ESCRITURAS_MCP) y la identidad OAuth de la sesión. */
export type OpcionesEscritura = Omit<ContextoEscrituras, "rol" | "ahora"> & { t: Transporte };

export function crearServidor(t: Transporte, rol: Rol, ahora?: () => Date, escrituras?: OpcionesEscritura) {
  const servidor = new McpServer({ name: "fr8bid-mcp-server", version: "0.2.0" });
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
  // preparar_* y confirmar solo para Operador/Administrador; el rol se vuelve a
  // comprobar al preparar y al confirmar (según la acción).
  if (escrituras && rol !== "viewer") {
    const { t: te, ...identidad } = escrituras;
    const ejecutar = crearEscrituras(te, { ...identidad, rol, ahora });
    for (const [nombre, h] of Object.entries(herramientasEscritura)) {
      const confirmar = nombre === "confirmar";
      servidor.registerTool(nombre, {
        description: h.descripcion,
        inputSchema: h.schema.shape,
        annotations: { readOnlyHint: !confirmar, destructiveHint: confirmar, idempotentHint: !confirmar, openWorldHint: true }
      }, async (args: Record<string, unknown>) => {
        try {
          const result = await ejecutar(nombre, args);
          const fallo = ["rechazada", "incierta", "parcial"].includes(result.estado);
          return { ...(fallo ? { isError: true } : {}), content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
        } catch (e) {
          if (e instanceof Rechazo) {
            const result = { estado: "rechazada", codigo: e.codigo, mensaje: e.message, escrito: false };
            return { isError: true, content: [{ type: "text" as const, text: `${e.codigo}: ${e.message}` }], structuredContent: result };
          }
          const code = e instanceof z.ZodError ? "ARGUMENTOS" : e instanceof ErrorApi ? `HTTP_${e.status}` : "NO_COMPLETADO";
          return { isError: true, content: [{ type: "text" as const, text: `${code}: no se pudo completar. Revisa los parámetros, la sesión o la Mesa. No se reintentó.` }] };
        }
      });
    }
  }
  return servidor;
}
