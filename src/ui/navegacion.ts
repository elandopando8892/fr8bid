// Cascarón de Fr8Bid (rediseño 25-nov-2026, «Nombres y cascarón»): cinco
// entradas en español, cada una con sus secciones en pestañas, más «Más»
// plegado. La búsqueda global y la barra inferior del teléfono salen de aquí.
import type { ResumenEvento } from "../dominio/tipos";
import { ESTADO_EVENTO, folioCorto, nombreEvento } from "./eventosVista";
import * as I from "./Iconos";

export type Seccion = { etiqueta: string; a: string; activo?: (ruta: string) => boolean };
export type Modulo = {
  etiqueta: string;
  a: string;
  icono: (p: { size?: number }) => JSX.Element;
  publica?: boolean;
  activo?: (ruta: string) => boolean;
  /** Pestañas de la entrada; la primera es la pantalla a la que lleva. */
  secciones?: Seccion[];
  /** Dónde se ven las pestañas; sin esto, en toda la entrada. */
  pestanasEn?: (ruta: string) => boolean;
  /** Palabras que también la encuentran en la búsqueda (nombres viejos incluidos). */
  palabras?: string;
};

export const bajo = (a: string) => (ruta: string) => ruta === a || ruta.startsWith(`${a}/`);
const alguno = (...as: string[]) => (ruta: string) => as.some((a) => bajo(a)(ruta));

const COTIZACIONES: Seccion[] = [
  { etiqueta: "Cotizaciones", a: "/quotedesk" },
  { etiqueta: "Solicitudes de shippers", a: "/intake" }
];
const CARRIERS: Seccion[] = [
  { etiqueta: "Directorio", a: "/crm" },
  { etiqueta: "Listas", a: "/templates" },
  { etiqueta: "Plantillas de correo", a: "/plantillas" }
];
const SHIPPERS: Seccion[] = [
  { etiqueta: "Shippers", a: "/shippers" },
  // Tarifas ya tiene sus tres pestañas (por revisar, tarifario y archivos).
  { etiqueta: "Tarifas", a: "/tarifas", activo: alguno("/tarifas", "/tarifario", "/archivos") }
];
// Eventos y la bandeja de lo que contestaron los carriers (rediseño, prioridad 6). En la página
// de un evento no se repiten las pestañas: ahí manda el riel de etapas.
const EVENTOS: Seccion[] = [
  { etiqueta: "Eventos", a: "/eventos", activo: alguno("/eventos", "/rfx") },
  { etiqueta: "Respuestas", a: "/respuestas" }
];
const deSecciones = (xs: Seccion[]) => (ruta: string) => xs.some((s) => (s.activo ?? bajo(s.a))(ruta));

export const MENU: { grupo: string; plegado?: boolean; modulos: Modulo[] }[] = [
  {
    grupo: "",
    modulos: [
      { etiqueta: "Hoy", a: "/", icono: I.Casa, activo: (r) => r === "/", palabras: "inicio pendientes" },
      { etiqueta: "Eventos", a: "/eventos", icono: I.Martillo, secciones: EVENTOS, activo: deSecciones(EVENTOS), pestanasEn: (r) => r === "/eventos" || bajo("/respuestas")(r), palabras: "rfx licitaciones concursos respuestas bandeja" },
      { etiqueta: "Cotizaciones", a: "/quotedesk", icono: I.Calculadora, secciones: COTIZACIONES, activo: deSecciones(COTIZACIONES), palabras: "quotedesk spot intake" },
      { etiqueta: "Carriers", a: "/crm", icono: I.Camion, secciones: CARRIERS,
        // «A quién invitar» ya no es pestaña (recorrido 26-nov, P6): se llega desde la página del evento o desde una lista.
        activo: (r) => deSecciones(CARRIERS)(r) || bajo("/carrier-fit")(r), palabras: "crm transportistas" },
      { etiqueta: "Shippers y tarifas", a: "/shippers", icono: I.Edificio, secciones: SHIPPERS, activo: deSecciones(SHIPPERS), palabras: "clientes tarifario" }
    ]
  },
  {
    grupo: "Más",
    plegado: true,
    modulos: [
      { etiqueta: "Integraciones", a: "/integraciones", icono: I.Enchufe, palabras: "gmail conexiones" },
      // La vista que ven los carriers: se abre aparte, sin el marco del equipo.
      { etiqueta: "Tablero público", a: "/board", icono: I.Pantalla, publica: true, palabras: "board" }
    ]
  }
];

export const MODULOS = MENU.flatMap((g) => g.modulos);
export const esActivo = (m: Modulo, ruta: string) => (m.activo ?? bajo(m.a))(ruta);
export const moduloDe = (ruta: string) => MODULOS.find((m) => !m.publica && esActivo(m, ruta));
export const seccionActiva = (m: Modulo, ruta: string) => m.secciones?.find((s) => (s.activo ?? bajo(s.a))(ruta));

// ——— Búsqueda global ———
export type Resultado = { etiqueta: string; detalle: string; a: string; tipo: "evento" | "seccion" | "accion"; palabras?: string; externa?: boolean };

// Los trabajos de todos los días, cada uno donde empieza.
const ACCIONES: Resultado[] = [
  { etiqueta: "Nuevo evento", detalle: "Acción", a: "/rfx/new", tipo: "accion", palabras: "crear rfx licitacion" },
  { etiqueta: "Nueva cotización", detalle: "Acción", a: "/quotedesk?new=1", tipo: "accion", palabras: "spot quote" },
  { etiqueta: "Enviar liga a un shipper", detalle: "Acción", a: "/intake", tipo: "accion", palabras: "solicitud intake" },
  { etiqueta: "Nueva lista de carriers", detalle: "Acción", a: "/templates/new", tipo: "accion", palabras: "template" },
  { etiqueta: "Respuestas de carriers", detalle: "Acción", a: "/respuestas", tipo: "accion", palabras: "bandeja correos ofertas ia leer" },
  { etiqueta: "Aprobar tarifas", detalle: "Acción", a: "/tarifas", tipo: "accion", palabras: "revisar rates" },
  { etiqueta: "Subir archivo de tarifas", detalle: "Acción", a: "/archivos", tipo: "accion", palabras: "excel upload" },
  { etiqueta: "Duplicados del directorio de carriers", detalle: "Acción", a: "/crm/higiene", tipo: "accion", palabras: "crm higiene" },
  { etiqueta: "Correos rebotados", detalle: "Acción", a: "/crm/rebotes", tipo: "accion", palabras: "rebotes bounces" }
];

export function entradasDeNavegacion(): Resultado[] {
  return MODULOS.flatMap((m) => {
    const propia: Resultado = { etiqueta: m.etiqueta, detalle: "Sección", a: m.a, tipo: "seccion", palabras: m.palabras, externa: m.publica };
    const hijas = (m.secciones ?? []).filter((s) => s.etiqueta !== m.etiqueta).map<Resultado>((s) => ({ etiqueta: s.etiqueta, detalle: m.etiqueta, a: s.a, tipo: "seccion", palabras: m.palabras }));
    return [propia, ...hijas];
  }).concat(ACCIONES);
}

export function entradasDeEventos(eventos: ResumenEvento[]): Resultado[] {
  return eventos.map((e) => ({
    etiqueta: nombreEvento(e),
    detalle: `${folioCorto(e.folio)} · ${ESTADO_EVENTO[e.estado]?.texto ?? e.estado}`,
    a: `/eventos/${e.id}`,
    tipo: "evento",
    palabras: [e.folio, e.shipper, ...e.rutas].join(" ")
  }));
}

// Las ciudades solo cuentan cuando el listado trae las rutas (Rateware real puede mandar solo cuántas son).
// Sin acentos ni mayúsculas: «cotizacion» encuentra «Cotización».
export const plegar = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Todas las palabras deben aparecer; primero lo que empieza con la búsqueda,
// luego eventos, secciones y acciones, en ese orden.
export function buscar(q: string, entradas: Resultado[], max = 8): Resultado[] {
  const terminos = plegar(q).split(/\s+/).filter(Boolean);
  if (!terminos.length) return [];
  const orden = { evento: 0, seccion: 1, accion: 2 } as const;
  const empieza = (titulo: string) => (titulo.startsWith(terminos[0]) ? 0 : 1);
  return entradas
    .map((r, i) => ({ r, i, texto: plegar(`${r.etiqueta} ${r.detalle} ${r.palabras ?? ""}`), titulo: plegar(r.etiqueta) }))
    .filter((x) => terminos.every((t) => x.texto.includes(t)))
    .sort((a, b) => empieza(a.titulo) - empieza(b.titulo) || orden[a.r.tipo] - orden[b.r.tipo] || a.i - b.i)
    .slice(0, max)
    .map((x) => x.r);
}

// ——— Etapas del evento (las mismas cinco de la página del evento) ———
export const ETAPAS = ["Necesidad y evento", "Carriers e invitación", "Ofertas y adjudicación", "Entrega a Rateware", "Aviso al carrier"] as const;

/** En qué etapa va (1 a 5) y la palabra corta que la nombra en la fila. */
export function etapaDe(e: Pick<ResumenEvento, "estado">): { n: number; texto: string } | null {
  switch (e.estado) {
    case "borrador":
      return { n: 2, texto: "Invitar" };
    case "abierto":
      return { n: 3, texto: "Ofertas" };
    case "cerrado":
      return { n: 3, texto: "Adjudicar" };
    case "adjudicado":
      // Sin recibo ni avisos en el listado: queda entre la entrega y el aviso.
      return { n: 4, texto: "Entrega y avisos" };
    default:
      return null;
  }
}
