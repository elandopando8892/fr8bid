import { z } from "zod";

const texto = z.string().trim().min(1).max(100);
const ciudad = z.string().trim().min(1).max(100).regex(/^[\p{L}\p{M}\d][\p{L}\p{M}\d .’'-]*$/u);
const lugarObjeto = z.object({ciudad, estado:texto.optional(), pais:texto.optional()}).strict();
type Lugar = z.infer<typeof lugarObjeto>;
const lugar = z.union([lugarObjeto, texto]);
export const esquemaTarifario = z.object({
  origen:lugar, destino:lugar, equipo:texto, tipo_servicio:texto.optional(), operacion:texto.optional(),
  incluir_historicas:z.boolean().default(true), incluir_vencidas:z.boolean().default(true),
  carrier_id:z.string().uuid().optional(), limit:z.number().int().min(1).max(200).default(50),
  cursor:z.string().uuid().optional(),
}).strict();
// Wire contract accepted by the Fr8Bid proxy. Rateware derives the organization from OAuth.
export const paginaTarifario = z.object({
  action:z.literal("list_carrier_tariff_candidates"), origin_city:ciudad, destination_city:ciudad,
  vendor_id:z.string().uuid().optional(), after_id:z.string().uuid().optional(), limit:z.number().int().min(1).max(200),
}).strict();

function detallarLugar(value:Lugar|string):Lugar {
  if (typeof value !== "string") return value;
  const partes = value.split(",").map(s=>s.trim());
  if (partes.length > 3 || partes.some(s=>!s)) throw new Error("Indica ciudad, estado y país por separado.");
  return lugarObjeto.parse({ciudad:partes[0], estado:partes[1], pais:partes[2]});
}

const normal = (value:unknown) => typeof value === "string"
  ? value.normalize("NFD").replace(/\p{M}/gu,"").trim().toLowerCase().replace(/[.]/g,"").replace(/\s+/g," ")
  : "";
const estados:Record<string,string> = {"texas":"tx","nuevo leon":"nl","nle":"nl","tamaulipas":"tm","tam":"tm","tamps":"tm"};
const paises:Record<string,string> = {"mexico":"mx","mex":"mx","usa":"us","united states":"us","united states of america":"us","estados unidos":"us","eeuu":"us"};
function equivalente(value:unknown, tabla:Record<string,string>) {
  const key=normal(value);
  return Object.hasOwn(tabla,key) ? tabla[key] : key;
}
type Fila = Record<string,any>;
function ubicacion(f:Fila, lado:"origin"|"destination") {
  const raw = f[lado] ?? null;
  const normalizada = f[`normalized_${lado}`] ?? null;
  const piezas = String(normalizada || raw || "").split(",").map(v=>v.trim());
  return {ciudad:f[`${lado}_city`] || piezas[0] || null, estado:f[`${lado}_state`] || piezas[1] || null,
    pais:f[`${lado}_country`] || piezas[2] || null, texto:raw, normalizada};
}
function coincideLugar(input:Lugar, fila:ReturnType<typeof ubicacion>) {
  return normal(input.ciudad) === normal(fila.ciudad) &&
    (!input.estado || equivalente(input.estado,estados)===equivalente(fila.estado,estados)) &&
    (!input.pais || equivalente(input.pais,paises)===equivalente(fila.pais,paises));
}
// Correspondencias de etiquetas de caja de Rateware (quotedesk-api/fcm.mjs).
function equipoNormal(value:unknown) {
  return normal(value).replace(/\brefrigerado\b/g,"reefer").replace(/\bcaja seca\b/g,"dry van")
    .replace(/\bplataforma\b/g,"flatbed").replace(/\btractocamion\b/g,"truck trailer")
    .replace(/(?:\bde\s+|\s*-\s*)?(\b\d{2})\s*(?:['’′]|ft\b|feet\b|foot\b|pies\b)/g," $1ft").trim();
}
const tamano = /\b(\d{2})ft\b/;
function coincideEquipo(f:Fila, equipo:string) {
  const solicitado = equipoNormal(equipo);
  const valores = [f.equipment,f.trailer,f.equipo_fuente,f.remolque_fuente].map(equipoNormal).filter(Boolean);
  const base = (s:string) => s.replace(tamano,"").trim().replace(/\s+/g," ");
  const objetivo = base(solicitado);
  const opciones = [...valores, ...[f.equipment,f.equipo_fuente].flatMap(e =>
    [f.trailer,f.remolque_fuente].map(t => [e,t].map(equipoNormal).filter(Boolean).join(" ")))];
  if (!opciones.some(s=>base(s)===objetivo)) return "equipo";
  const largo = solicitado.match(tamano)?.[1];
  if (largo) {
    const largos = [...valores,equipoNormal(f.config),equipoNormal(f.largo_remolque_fuente)].map(v=>v.match(tamano)?.[1]).filter(Boolean);
    if (!largos.length) return "largo_sin_evidencia";
    if (!largos.every(n=>n===largo)) return "equipo";
  }
  return null;
}
function servicio(value:unknown) {
  return normal(value).replace(/^full[ -]truck[ -]?load$/,"ftl").replace(/^less[ -]than[ -]truck[ -]?load$/,"ltl");
}
function vigencia(f:Fila, hoy:string) {
  const fecha = (v:unknown) => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(v+"T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===v ? v : null;
  };
  const inicio=fecha(f.valid_from), fin=fecha(f.valid_through);
  if (inicio && fin && inicio>fin) return "desconocida";
  if (fin && fin<hoy) return "vencida";
  if (inicio && inicio>hoy) return "futura";
  return inicio && fin ? "vigente" : "desconocida";
}

const tiposFuente = z.enum(["cotizacion_transportista","referencia_comercial","target_rfx","sin_clasificar"]);
const original = z.union([z.number().finite(),z.string().regex(/^-?\d+(\.\d+)?$/)]).nullable();
const pagina = z.object({
  rows:z.array(z.object({id:z.string().uuid(),tipo_fuente:tiposFuente,importe_original:original,
    vendors:z.object({vendor_name:z.string().nullish(),legal_name:z.string().nullish()}).nullish(),
    moneda_original:z.string().nullable()}).passthrough()),
  has_more:z.boolean(), next_cursor:z.string().uuid().nullable(),
});
export async function consultarTarifario(
  args:z.infer<typeof esquemaTarifario>, hoy:string, pedir:(body:Record<string,unknown>)=>Promise<unknown>,
) {
  const origen=detallarLugar(args.origen), destino=detallarLugar(args.destino);
  const query = paginaTarifario.parse({action:"list_carrier_tariff_candidates", origin_city:origen.ciudad,
    destination_city:destino.ciudad, limit:args.limit, ...(args.cursor && {after_id:args.cursor}),
    ...(args.carrier_id && {vendor_id:args.carrier_id})});
  const respuesta = pagina.safeParse(await pedir(query));
  if (!respuesta.success) throw new Error("Rateware devolvió una página de tarifas incompleta o inválida.");
  const datos = respuesta.data;
  let anterior=args.cursor?.toLowerCase() ?? "";
  for (const row of datos.rows) {
    const id=row.id.toLowerCase();
    if (id<=anterior || (args.carrier_id && String(row.vendor_id).toLowerCase()!==args.carrier_id.toLowerCase())) throw new Error("Página de Rateware inconsistente");
    anterior=id;
  }
  if (datos.rows.length>args.limit || (datos.has_more
      ? !datos.rows.length || datos.next_cursor!==datos.rows.at(-1)?.id : datos.next_cursor!==null)) throw new Error("Cursor de Rateware inconsistente");
  const tarifas = [];
  const descartadas:Record<string,number> = {};
  for (const f of datos.rows) {
    const desde=ubicacion(f,"origin"), hasta=ubicacion(f,"destination"), actual=vigencia(f,hoy);
    let motivo:string|null=null;
    if (f.tipo_fuente==="target_rfx") motivo="target_rfx";
    else if (!coincideLugar(origen,desde) || !coincideLugar(destino,hasta)) motivo="geografia";
    else motivo=coincideEquipo(f,args.equipo);
    if (!motivo && args.tipo_servicio && ![f.service,f.servicio_fuente,f.modalidad_fuente].some(v=>servicio(v)===servicio(args.tipo_servicio))) motivo="servicio_sin_coincidencia";
    if (!motivo && args.operacion && normal(f.operation)!==normal(args.operacion)) motivo="operacion";
    if (!motivo && ((!args.incluir_historicas && actual!=="vigente") || (!args.incluir_vencidas && actual==="vencida"))) motivo="vigencia";
    if (motivo) { descartadas[motivo]=(descartadas[motivo] ?? 0)+1; continue; }
    tarifas.push({
      tarifa_id:f.id, carrier_id:f.vendor_id ?? null, transportista:f.vendors?.vendor_name ?? null,
      razon_social:f.vendors?.legal_name ?? null, origen:desde, destino:hasta,
      equipo:f.equipment ?? null, trailer:f.trailer ?? null, configuracion:f.config ?? null, equipo_fuente:f.equipo_fuente ?? null,
      remolque_fuente:f.remolque_fuente ?? null, largo_remolque_fuente:f.largo_remolque_fuente ?? null,
      servicio:f.service ?? null, servicio_fuente:f.servicio_fuente ?? null, modalidad_fuente:f.modalidad_fuente ?? null, operacion:f.operation ?? null,
      hazmat:f.hazmat ?? null, control_temperatura:f.temperature_controlled ?? null, conductor:f.driver ?? null,
      importe_original:f.importe_original, moneda_original:f.moneda_original, tipo_importe:f.tipo_importe ?? null,
      importe_registrado:f.importe_registrado ?? null, moneda_registrada:f.moneda_registrada ?? null,
      fecha_cotizacion:f.tipo_fuente==="cotizacion_transportista" ? f.quote_date ?? null : null,
      fecha_referencia:f.quote_date ?? null, fecha_registro:f.created_at ?? null, actualizada:f.updated_at ?? null,
      vigente_desde:f.valid_from ?? null, vigente_hasta:f.valid_through ?? null, vigencia:actual, estado_aprobacion:f.status ?? null,
      capacidad_semanal:f.weekly_capacity ?? null,
      condiciones:{base_tarifa:f.rate_basis ?? null, modelo_comercial:f.commercial_model ?? null},
      restricciones:f.restricciones ?? null,
      fuente:{tabla:"rate_staging", tipo:f.tipo_fuente, metodo:f.metodo_fuente ?? null, hoja:f.hoja_fuente ?? null,
        fila:f.fila_fuente ?? null, raw_upload_id:f.raw_upload_id ?? null, row_id:f.row_id ?? null},
    });
  }
  return {tarifas, filtros:{...args,origen,destino}, candidatas_examinadas:datos.rows.length, descartadas,
    siguiente_cursor:datos.next_cursor, completa:!datos.has_more,
    cobertura:"Página del tarifario de la organización. Seguir siguiente_cursor incluso con cero coincidencias. Aprobación del registro y vigencia son independientes de su procedencia."};
}
