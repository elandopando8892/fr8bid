/**
 * «Recordarle» (prioridad 9, S5): una solicitud con la liga enviada y sin
 * respuesta tiene un siguiente paso. Fr8Bid no envía nada: abre el borrador en
 * Gmail con la liga vigente y la persona del equipo lo revisa y lo manda.
 */

export interface DatosRecordatorio {
  contacto: string | null;
  correo: string | null;
  liga: string;
}

const DIA = 86_400_000;

/** Días completos desde la fecha, nunca negativos. */
export function diasDesde(iso: string | null | undefined, ahora = Date.now()): number | null {
  const t = Date.parse(String(iso ?? ""));
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((ahora - t) / DIA));
}

/** El asunto va en español (regla del 22-nov) y el texto invita a avanzar sin teclear todo. */
export function textoRecordatorio({ contacto, liga }: DatosRecordatorio): { asunto: string; cuerpo: string } {
  const nombre = (contacto ?? "").trim().split(/\s+/)[0];
  return {
    asunto: "Recordatorio: tu solicitud de cotización con MARKSMAN",
    cuerpo: [
      nombre ? `Hola ${nombre}:` : "Hola:",
      "",
      "Te recuerdo la solicitud de cotización que te compartimos. Toma unos minutos, se guarda sola y puedes seguir después.",
      "Si ya tienes tus rutas en un Excel, un PDF o un correo, súbelo o pégalo ahí y nosotros las leemos.",
      "",
      liga,
      "",
      "Si prefieres, contéstame este correo con tus rutas y yo las capturo.",
      "",
      "Saludos",
    ].join("\n"),
  };
}

/** La redacción de Gmail con todo listo; sin correo del contacto, no hay liga. */
export function borradorGmail(datos: DatosRecordatorio): string | null {
  const correo = (datos.correo ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return null;
  const { asunto, cuerpo } = textoRecordatorio(datos);
  const q = new URLSearchParams({ view: "cm", fs: "1", to: correo, su: asunto, body: cuerpo });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

// Lo recordado se anota en este navegador para no mandar dos el mismo día.
const LLAVE = "fr8bid.recordatorios";

export function recordadoEl(id: string): string | null {
  try {
    const todos = JSON.parse(localStorage.getItem(LLAVE) || "{}");
    return typeof todos?.[id] === "string" ? todos[id] : null;
  } catch {
    return null;
  }
}

export function anotarRecordatorio(id: string, cuando = new Date().toISOString()): void {
  try {
    const todos = JSON.parse(localStorage.getItem(LLAVE) || "{}") || {};
    todos[id] = cuando;
    localStorage.setItem(LLAVE, JSON.stringify(todos));
  } catch {
    // Sin almacenamiento, el botón sigue funcionando; solo no recuerda la fecha.
  }
}
