// Modelo normalizado que usa la Mesa del evento. Con la opción (a) de D1 la
// verdad vive en las tablas RFx de rateware-prod; estos tipos son la forma en
// que Fr8Bid lee esa verdad, no una base propia.

import type { MarcaRevision } from "./revision.js";

export type Rol = "admin" | "operator" | "viewer";

export type EstadoEvento = "borrador" | "abierto" | "cerrado" | "adjudicado" | "archivado";

export type EstadoParticipacion =
  | "preseleccionada"
  | "invitada"
  | "vista"
  | "respondio"
  | "declino"
  | "excluida";

export type RubroEstado = "de_acuerdo" | "excepcion" | "no_puedo" | "no_aplica" | "sin_respuesta";

// Condición de ruta (parche R1 de Rateware): la elige el equipo por ruta,
// obligatoria o deseable, y el carrier la contesta con dato.
export interface CondicionRuta {
  clave: string;
  grupo: string;
  etiqueta: string;
  tipo: "text" | "number" | "money" | "boolean" | "choice";
  unidad: string | null;
  comparador: "min" | "max" | "eq" | null;
  opciones: string[] | null;
  obligatoria: boolean;
  objetivo: string | number | boolean | null;
  nota: string | null;
  revision: number;
}

export interface RespuestaCondicion {
  estado: RubroEstado;
  valor: string | number | boolean | null;
  comentario: string | null;
  revision: number | null; // revisión de la condición que contestó
}

export type ModeloComercial = "fee_plus" | "cost_plus" | "sell_share" | "brokerage";

export interface OfertaVersion {
  numero: number;
  tarifaAllIn: number;
  moneda: string;
  modeloComercial: ModeloComercial | string;
  carrierSharePct: number | null;
  margenPct: number | null;
  capacidadSemanal: number | null;
  transitoDias: number | null;
  vigenteHasta: string | null; // AAAA-MM-DD
  esFinal: boolean;
  fuente: "portal_carrier" | "captura_equipo" | "importacion";
  actor: string;
  nota: string | null;
  creadaEn: string;
  huella: string;
}

export interface Participacion {
  id: string; // rfx_lane_vendors.id
  carrierId: string;
  carrier: string;
  correo: string | null;
  carrierBloqueado: boolean;
  estado: EstadoParticipacion;
  rubros: Record<string, RubroEstado>;
  condiciones: Record<string, RespuestaCondicion>; // por clave del catálogo
  // Historial completo si la fuente lo da; con Rateware real hoy solo llega la vigente.
  versiones: OfertaVersion[];
  rol: "primario" | "respaldo" | null;
  motivo: string | null;
  // Versión que el Administrador adjudicó (número y huella en el momento de decidir).
  adjudicada: { numero: number; huella: string; por: string; en: string } | null;
  // rateware_closeout_at: la entrega con recibo cubrió esta participación.
  entregadaEn: string | null;
  // rfx-bid-api pone viewed_at la primera vez que el carrier abre su liga.
  vistaEn: string | null;
  respondioEn: string | null;
}

export interface Ruta {
  id: string;
  numero: number;
  origen: string;
  destino: string;
  equipo: string;
  volumenSemanal: number | null;
  objetivo: number | null;
  moneda: string;
  desiertaMotivo: string | null;
  condiciones: CondicionRuta[];
  participaciones: Participacion[];
}

export type TipoAviso = "invitacion" | "adjudicacion";
// «en_cola»: Rateware lo tiene en cola o enviando (p. ej. pausado por la cuota
// de Gmail). Nunca se muestra como enviado.
export type EstadoAviso = "borrador" | "en_cola" | "aceptado" | "rebotado" | "fallido" | "incierto";
export type ResultadoAviso = "adjudicado" | "respaldo" | "no_adjudicado";

// Mensaje de la Cola de Rateware (outreach_messages). Rateware no tiene estado
// «aprobado»: la aprobación es la versión exacta (updated_at) que el
// Administrador vio; send_outreach_messages la exige y responde 409 si cambió.
export interface Aviso {
  id: string;
  tipo: TipoAviso;
  participacionId: string;
  participaciones: string[]; // un aviso por carrier puede cubrir varias rutas
  resultado: ResultadoAviso | null;
  canal: "gmail";
  destinatario: string;
  asunto: string;
  cuerpo: string;
  huella: string;
  version: string; // updated_at de Rateware
  estado: EstadoAviso;
  reciboProveedor: string | null; // provider_message_id de Gmail
  motivo: string | null; // delivery_error o last_error de Rateware
  enviadoEn: string | null; // sent_at
}

export interface Recibo {
  operationId: string;
  insertados: number;
  enlazados: number;
  enRevision: number;
  conservadosAprobados: number;
  stagingIds: string[];
  estadoDestino: "pending_review";
  momento: string;
}

export interface Evento {
  id: string;
  folio: string;
  nombre: string;
  shipper: string;
  estado: EstadoEvento;
  plazo: string | null;
  prueba: boolean; // «PRUEBA CONTROLADA» (D5)
}

export interface Detalle {
  evento: Evento;
  rutas: Ruta[];
  avisos: Aviso[];
  recibo: Recibo | null;
  // Marca «Revisado» vigente por carrier (vendor_id). null: no se pudo
  // consultar, y entonces no se invita a nadie.
  revisiones?: Record<string, MarcaRevision> | null;
}

export type EstadoEntrega = "sin_preparar" | "preparada" | "enviada" | "confirmada" | "rechazada" | "incierta";

export interface EntregaLocal {
  estado: EstadoEntrega;
  operationId: string | null;
  error: string | null;
}

export interface ResumenEvento {
  id: string;
  folio: string;
  nombre: string;
  shipper: string;
  estado: EstadoEvento;
  plazo: string | null;
  prueba: boolean;
  rutas: string[];
  ofertas: number;
  participaciones: number;
}
