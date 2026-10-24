// Claude para los números de WhatsApp dudosos (solo servidor: la clave vive en
// ANTHROPIC_API_KEY de Vercel y no viaja al navegador).

import Anthropic from "@anthropic-ai/sdk";
import type { Preguntar } from "./telefonos.js";

export const MODELO_TELEFONOS = "claude-opus-5-5";

const INSTRUCCIONES = `Eres parte de Fr8Bid, la mesa de licitaciones de fletes de Marksman (México–EE. UU.).
Para cada número de WhatsApp de un carrier decide si es de México (+52) o de EE. UU. (+1).
Los números vienen de Rateware casi siempre con 10 dígitos y sin código de país. Usa la lada, el nombre (LLC, Inc. → EE. UU.; S.A. de C.V., S. de R.L. → México, aunque muchos carriers mexicanos tienen LLC en Texas) y el dominio.
Las ladas de 2 dígitos de México son 33, 55, 56 y 81 (81 = Monterrey). Ojo con las que existen en los dos países (p. ej. 812, 818, 314, 614, 713).
Devuelve el número completo en dígitos con el código de país (52 + 10 dígitos, o 1 + 10 dígitos), sin cambiar ninguno de los 10 dígitos.
Si de verdad no se puede saber, pais = "ninguno" y numero = "". El motivo va en español, en una frase corta.`;

const ESQUEMA = {
  type: "object",
  properties: {
    telefonos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          pais: { type: "string", enum: ["MX", "US", "ninguno"] },
          numero: { type: "string" },
          motivo: { type: "string" }
        },
        required: ["id", "pais", "numero", "motivo"],
        additionalProperties: false
      }
    }
  },
  required: ["telefonos"],
  additionalProperties: false
};

export function preguntarAClaude(apiKey: string): Preguntar {
  const client = new Anthropic({ apiKey });
  return async (dudosos) => {
    const r = await client.messages.create({
      model: MODELO_TELEFONOS,
      max_tokens: 16000,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: INSTRUCCIONES,
      messages: [{ role: "user", content: JSON.stringify(dudosos.map((x) => ({ id: x.id, numero: x.valor, carrier: x.carrier, dominio: x.dominio }))) }]
    });
    if (r.stop_reason === "refusal") throw new Error("La IA no respondió esta consulta.");
    const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return JSON.parse(texto).telefonos;
  };
}

