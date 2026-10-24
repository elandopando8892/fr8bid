// Contactos sugeridos cuando un carrier no tiene contacto útil (pedido de Jose
// del 24-oct-2026): los contactos que Rateware ya conoce del carrier y de otros
// registros con su mismo dominio, sin los que rebotaron hace poco en Gmail ni
// los marcados «no contactar». Solo lectura: sugerir no cambia el contacto del
// carrier ni invita a nadie.

export const VENTANA_REBOTE_DIAS = 180;
export const MAX_REGISTROS = 50;

export type TipoContacto = "correo" | "whatsapp";

export interface ContactoSugerido {
  tipo: TipoContacto;
  valor: string;
  nombre: string | null;
  origen: string;
  // Última vez que Rateware lo usó con éxito (p. ej. recibió la liga del Bid Room).
  ultimoUso: string | null;
  nota: string | null;
}

export interface ContactoDescartado {
  tipo: TipoContacto;
  valor: string;
  motivo: string;
}

export interface ContactosCarrier {
  vendorId: string;
  nombre: string;
  dominio: string | null;
  sugeridos: ContactoSugerido[];
  descartados: ContactoDescartado[];
  avisos: string[];
}

type Fila = Record<string, any>;

const CORREO = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const DOMINIOS_PUBLICOS = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.mx", "live.com", "icloud.com", "aol.com", "prodigy.net.mx", "msn.com"]);

const limpio = (x: unknown) => String(x ?? "").trim();
const fecha = (x: unknown) => limpio(x).slice(0, 10) || null;

// secondary_emails es text[] pero hay entradas como «a@x.com; b@x.com».
export function separarCorreos(valor: unknown): string[] {
  const lista = Array.isArray(valor) ? valor : valor ? [valor] : [];
  return lista.flatMap((x) => String(x).split(/[;,\s]+/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

// El dominio sirve para buscar otros registros del mismo carrier; uno público
// (gmail, hotmail…) junta carriers distintos, así que no se usa.
export function dominioBuscable(v: Fila): string | null {
  const d = limpio(v.domain).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (d && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && !DOMINIOS_PUBLICOS.has(d)) return d;
  const correo = limpio(v.primary_email).toLowerCase().split("@")[1];
  return correo && !DOMINIOS_PUBLICOS.has(correo) && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(correo) ? correo : null;
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function sugerirContactos(vendorId: string, vendors: Fila[], historial: Fila[], hoy: string): ContactosCarrier {
  const propio = vendors.find((v) => v.id === vendorId) || { id: vendorId };
  const nombre = limpio(propio.vendor_name || propio.name) || "Carrier";
  const avisos: string[] = [];
  const descartados = new Map<string, ContactoDescartado>();
  const sugeridos = new Map<string, ContactoSugerido>();
  const llave = (tipo: TipoContacto, valor: string) => `${tipo}:${valor}`;

  // Rebotes en Gmail (gmail_bounce_sync) y ligas del Bid Room entregadas, por correo.
  const rebotes = new Map<string, string>();
  const usos = new Map<string, string>();
  for (const h of historial) {
    const cuando = fecha(h.occurred_at || h.created_at);
    if (!cuando) continue;
    const m = h.metadata || {};
    if (h.direction === "inbound" && h.status === "bounced") {
      const correo = limpio(m.email).toLowerCase();
      if (correo && (!rebotes.has(correo) || rebotes.get(correo)! < cuando)) rebotes.set(correo, cuando);
    }
    if (h.status === "magic_link_sent") {
      const correo = limpio(m.recipient_email).toLowerCase();
      if (correo && (!usos.has(correo) || usos.get(correo)! < cuando)) usos.set(correo, cuando);
    }
  }
  const ultimaFalla = historial.filter((h) => h.direction === "outbound" && h.status === "failed").map((h) => fecha(h.occurred_at || h.created_at)).filter(Boolean).sort().pop();
  const ultimoEnvio = historial.filter((h) => h.direction === "outbound" && h.status === "sent").map((h) => fecha(h.occurred_at || h.created_at)).filter(Boolean).sort().pop();
  if (ultimaFalla && (!ultimoEnvio || ultimoEnvio < ultimaFalla)) avisos.push(`El último envío por correo falló el ${ultimaFalla} y no ha salido otro después.`);
  const declino = historial.filter((h) => h.direction === "inbound" && h.status === "declined").map((h) => fecha(h.occurred_at || h.created_at)).filter(Boolean).sort().pop();
  if (declino) avisos.push(`Declinó en el portal el ${declino}: confirma que quiere seguir recibiendo eventos.`);

  const agregarCorreo = (valor: string, v: Fila, origen: string) => {
    if (descartados.has(llave("correo", valor)) || sugeridos.has(llave("correo", valor))) return;
    if (!CORREO.test(valor)) {
      descartados.set(llave("correo", valor), { tipo: "correo", valor, motivo: "no parece un correo válido" });
      return;
    }
    const rebote = rebotes.get(valor);
    if (rebote && diasEntre(rebote, hoy) <= VENTANA_REBOTE_DIAS) {
      descartados.set(llave("correo", valor), { tipo: "correo", valor, motivo: `rebotó en Gmail el ${rebote}` });
      return;
    }
    sugeridos.set(llave("correo", valor), {
      tipo: "correo",
      valor,
      nombre: limpio(v.contact_name) || null,
      origen,
      ultimoUso: usos.get(valor) || null,
      nota: rebote ? `Rebotó el ${rebote}, hace más de ${VENTANA_REBOTE_DIAS} días.` : null
    });
  };

  // Primero el registro del carrier, luego los otros con su mismo dominio.
  const ordenados = [propio, ...vendors.filter((v) => v.id !== vendorId)];
  for (const v of ordenados) {
    const deOtro = v.id !== vendorId;
    const sufijo = deOtro ? ` de otro registro en Rateware («${limpio(v.vendor_name || v.name) || "sin nombre"}», mismo dominio)` : " en Rateware";
    for (const c of separarCorreos(v.primary_email)) agregarCorreo(c, v, `Correo principal${sufijo}`);
    for (const c of separarCorreos(v.secondary_emails)) agregarCorreo(c, v, `Correo adicional${sufijo}`);
    const tel = limpio(v.whatsapp_phone);
    if (tel) {
      const k = llave("whatsapp", tel);
      if (v.whatsapp_do_not_contact === true) descartados.set(k, { tipo: "whatsapp", valor: tel, motivo: "marcado «no contactar» por WhatsApp" });
      else if (!descartados.has(k) && !sugeridos.has(k)) sugeridos.set(k, { tipo: "whatsapp", valor: tel, nombre: limpio(v.contact_name) || null, origen: `WhatsApp${sufijo}`, ultimoUso: null, nota: null });
    }
  }
  // Una liga entregada a un correo que ya no está en el registro también cuenta.
  for (const [correo, cuando] of usos) {
    if (!sugeridos.has(llave("correo", correo)) && !descartados.has(llave("correo", correo))) agregarCorreo(correo, {}, `Recibió la liga del Bid Room el ${cuando}`);
  }

  const lista = [...sugeridos.values()].sort((a, b) => (b.ultimoUso || "").localeCompare(a.ultimoUso || "") || (a.tipo === b.tipo ? 0 : a.tipo === "correo" ? -1 : 1));
  return { vendorId, nombre, dominio: dominioBuscable(propio), sugeridos: lista, descartados: [...descartados.values()], avisos };
}
