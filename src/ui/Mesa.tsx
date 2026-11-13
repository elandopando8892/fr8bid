import { Fragment, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ErrorApi, type AvanceEnvio } from "../cliente/api";
import { proyeccionLoads } from "../dominio/loads";
import { operacionAdjudicacion } from "../dominio/operacion";
import {
  avisoDe,
  candadosAdjudicacion,
  candadosAviso,
  conOferta,
  hoyMexico,
  primario,
  propuestaPrimarios,
  puedeAdjudicar,
  recorrido,
  revisarCondiciones,
  versionMasReciente,
  versionVigente,
  type Candado,
  type ClavePaso,
  type Contexto
} from "../dominio/recorrido";
import { audienciaInvitacion, estadoRevision, MOTIVO_OMISION, resumenOmisiones } from "../dominio/revision";
import { hojaComparativo, nombreArchivo } from "../dominio/exportar";
import { cambiosComerciales, describirModelo, modeloCorto, tarifaVenta } from "../dominio/modelo";
import { bloqueoRespondio, bloqueoRevision, candidatasCaptura } from "../dominio/acciones-mesa";
import { candidatosRecordatorio, claveIntento, esperaRespuesta, etiquetaSeguimiento, intentosPorPreparar, intentosWhatsapp, preguntaAlCarrier, PROFUNDIDAD_MINIMA, recordatorio, rutasSinProfundidad, seguimiento, siguienteIntento, textoIntento, type EstadoSeguimiento } from "../dominio/seguimiento";
import { crearXlsx } from "../dominio/xlsx";
import type { CarrierFit } from "../dominio/carrierFit";
import type { Telefono } from "../dominio/telefonos";
import type { ContactosCarrier } from "../dominio/contactos";
import type { CorreoRevelado, PersonaApollo } from "../dominio/apollo";
import * as I from "./Iconos";
import { NOMBRE_FAMILIA, type HistorialSegmento } from "../dominio/segmento";
import { planearTandas, TAMANO_TANDA } from "../dominio/tandas";
import type { Aviso, Detalle, EntregaLocal, Participacion, Recibo, Ruta } from "../dominio/tipos";
import { EditorCondiciones, ListaCondiciones, MatrizCondiciones } from "./condiciones";
import { aCarga, Confirmar, Desactualizado, dinero, EstadoVista, fecha, Liga, plural, Prueba, type Carga } from "./comun";
import { useSesion } from "./sesion";

// Fecha corta sin hora, para columnas angostas.
const dia = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" }) : "—";
const TONO_SEGUIMIENTO: Record<EstadoSeguimiento, string> = { oferto: "ok", sin_abrir: "warn", abrio_correo: "warn", abrio: "warn", rebote: "err", respondio: "info", declino: "" };

const SIN_ENTREGA: EntregaLocal = { estado: "sin_preparar", operationId: null, error: null };

// Los 11 pasos se agrupan en cinco etapas: cada etapa es una vista. Así cada
// clic en el riel cambia lo que se ve y no hay pasos que muestren lo mismo.
type ClaveEtapa = "evento" | "carriers" | "ofertas" | "entrega" | "aviso";
const ETAPAS: { clave: ClaveEtapa; titulo: string; pasos: ClavePaso[] }[] = [
  { clave: "evento", titulo: "Necesidad y evento", pasos: ["necesidad", "evento"] },
  { clave: "carriers", titulo: "Carriers e invitación", pasos: ["carriers", "invitacion"] },
  { clave: "ofertas", titulo: "Ofertas y adjudicación", pasos: ["ofertas", "comparar", "cierre", "adjudicar"] },
  { clave: "entrega", titulo: "Entrega a Rateware", pasos: ["entrega", "loads"] },
  { clave: "aviso", titulo: "Aviso al carrier", pasos: ["aviso"] }
];
const etapaDe = (clave: ClavePaso): ClaveEtapa => ETAPAS.find((e) => e.pasos.includes(clave))!.clave;

export function Mesa({ id }: { id: string }) {
  const s = useSesion();
  const [carga, setCarga] = useState<Carga<Detalle>>({ tipo: "cargando" });
  const [entrega, setEntrega] = useState<EntregaLocal>(SIN_ENTREGA);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [vista, setVista] = useState<ClaveEtapa | null>(null);
  const [aviso, setAvisoMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const actualPrevio = useRef<string | null>(null);
  const secuencia = useRef(0);
  const contexto = JSON.stringify([s.modo, s.rol, s.correo, s.usuarioSimulado]);
  const origen = useMemo(() => ({ api: s.api, id, recibo, listo: s.listo, contexto }), [s.api, id, recibo, s.listo, contexto]);
  const dueno = useRef<typeof origen | null>(null);

  // No pintar el detalle ni conservar estado local de otra fuente, evento o sesión.
  useLayoutEffect(() => {
    setCarga({ tipo: "cargando" });
    setEntrega(SIN_ENTREGA);
    setRecibo(null);
    setVista(null);
    setAvisoMsg(null);
    actualPrevio.current = null;
  }, [s.api, id, s.listo, contexto]);
  // El recibo también pertenece a la lectura: una clausura anterior no debe releer sin él.
  useLayoutEffect(() => {
    dueno.current = origen.listo ? origen : null;
    secuencia.current++;
    return () => { dueno.current = null; secuencia.current++; };
  }, [origen]);

  const leer = useCallback(async () => {
    if (!origen.listo || dueno.current !== origen) return;
    const lectura = ++secuencia.current;
    const vigente = () => secuencia.current === lectura && dueno.current === origen;
    try {
      const datos = await origen.api.detalle(origen.id, origen.recibo);
      if (vigente()) setCarga({ tipo: "ok", datos, leidoEn: Date.now() });
    } catch (e) {
      if (vigente()) setCarga(aCarga(e));
    }
  }, [origen]);
  useEffect(() => {
    void leer();
  }, [leer]);

  const ctx: Contexto = useMemo(() => ({ rol: s.rol, hoy: hoyMexico(), entrega }), [s.rol, entrega]);
  const r = carga.tipo === "ok" ? recorrido(carga.datos, ctx) : null;
  const claveActual = r ? (r.actual?.clave ?? "fin") : null;
  // Cuando el recorrido avanza (se cerró, se adjudicó, llegó el recibo…), la
  // Mesa sigue al paso nuevo aunque antes se haya elegido otra etapa a mano.
  useEffect(() => {
    if (claveActual === null) return;
    if (actualPrevio.current !== null && actualPrevio.current !== claveActual) setVista(null);
    actualPrevio.current = claveActual;
  }, [claveActual]);

  // En móvil el riel es una tira horizontal: que la etapa a la vista no quede fuera.
  useEffect(() => {
    if (window.matchMedia("(max-width: 860px)").matches) document.querySelector(".riel .visto")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [vista, claveActual]);

  if (carga.tipo !== "ok" || !r) return <EstadoVista carga={carga} reintentar={leer} />;
  const d = carga.datos;
  const etapaActual: ClaveEtapa = r.actual ? etapaDe(r.actual.clave) : "aviso";
  const actual = vista ?? etapaActual;
  // Falta profundidad (o hay carriers sumados por invitar): en Ofertas también
  // se ven los sugeridos y la invitación, para sumar sin cambiar de etapa.
  const audiencia = audienciaInvitacion(d);
  const sumarCarriers = d.evento.estado === "abierto" && (rutasSinProfundidad(d).length > 0 || audiencia.aptas.length + audiencia.omitidas.length > 0);
  const verInvitacion = actual === "carriers" || (actual === "ofertas" && sumarCarriers);

  const accion = async <T,>(f: () => Promise<T>, ok?: string | ((r: T) => string)) => {
    setAvisoMsg(null);
    try {
      const r = await f();
      if (ok) setAvisoMsg({ tipo: "ok", texto: typeof ok === "function" ? ok(r) : ok });
    } catch (e) {
      const extra = e instanceof ErrorApi && e.code === "ESCRITURA_NO_AUTORIZADA" ? " (FR8BID_ESCRITURAS_REALES no está activo)" : e instanceof ErrorApi && e.code === "SOLO_BORRADORES" ? " (FR8BID_ESCRITURAS_REALES=borradores)" : "";
      setAvisoMsg({ tipo: "error", texto: (e instanceof Error ? e.message : String(e)) + extra });
    }
    await leer();
  };

  const etapas = ETAPAS.map((e) => {
    const pasos = r.pasos.filter((x) => e.pasos.includes(x.clave));
    const enCurso = pasos.find((x) => x.estado === "actual");
    const estado = enCurso ? "actual" : pasos.every((x) => x.estado === "hecho") ? "hecho" : pasos.find((x) => x.estado !== "hecho")!.estado;
    const foco = enCurso ?? pasos.find((x) => x.estado !== "hecho") ?? pasos[pasos.length - 1];
    return { ...e, n: ETAPAS.indexOf(e) + 1, pasos, estado, foco };
  });

  const p = { d, ctx, accion, entrega, setEntrega, recibo, setRecibo };
  return (
    <section>
      <header className="cabecera">
        <div>
          <p className="miga">
            <Liga a="/eventos">Eventos</Liga> / <span className="mono">{d.evento.folio}</span>
          </p>
          {/* Con varias rutas, el título es el shipper; las rutas van en chips. */}
          <h1>{d.rutas.length === 1 ? `${d.rutas[0].origen} → ${d.rutas[0].destino}` : d.rutas.length > 1 ? `${d.evento.shipper} · ${plural(d.rutas.length, "ruta")}` : d.evento.nombre}</h1>
          {/* Una sola línea: el shipper solo cuando el título no lo dice ya. */}
          <p className="tenue">
            {[[...new Set(d.rutas.map((x) => x.equipo))].join(", "), plural(d.rutas.length, "ruta"), d.rutas.length === 1 ? d.evento.shipper : null, `plazo ${fecha(d.evento.cierre?.plazoOriginal ?? d.evento.plazo)}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="etiquetas">
          {d.evento.prueba && <Prueba />}
          <span className="pill">{ESTADO[d.evento.estado]}</span>
        </div>
      </header>
      <Desactualizado leidoEn={carga.leidoEn} actualizar={leer} />
      {aviso && <div className={aviso.tipo === "ok" ? "estado estado-ok" : "estado estado-error"} role="status">{aviso.texto}</div>}

      <div className="mesa">
        <nav className="riel" aria-label="Recorrido">
          <ol>
            {etapas.map((e) => (
              <li key={e.clave} className={`paso paso-${e.estado} ${actual === e.clave ? "visto" : ""}`}>
                <button onClick={() => setVista(e.clave)} aria-current={actual === e.clave ? "step" : undefined}>
                  <span className="marca-paso">{e.estado === "hecho" ? "✓" : e.n}</span>
                  <span>
                    <b>{e.titulo}</b>
                    {e.estado === "actual" && <small>{e.foco.detalle}</small>}
                    {e.pasos.length > 1 && e.estado === "actual" && (
                      <span className="subpasos">
                        {e.pasos.map((x) => (
                          <span key={x.clave} className={`subpaso sub-${x.estado}`}>{x.estado === "hecho" ? "✓ " : ""}{x.titulo}</span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="centro">
          <div className={`siguiente ${r.siguiente.teToca ? "te-toca" : ""}`}>
            {r.actual ? (
              <span className="fila-icono">
                {r.siguiente.teToca ? <I.Mano size={16} /> : <I.Reloj size={16} />}
                <span>{r.siguiente.teToca ? "Te toca" : r.siguiente.quien === "Carriers" ? "Esperando a los carriers" : r.siguiente.quien === "Sistema" ? "Esperando a Loads" : `Le toca al ${r.siguiente.quien}`}: <b>{r.siguiente.accion}</b></span>
              </span>
            ) : (
              <span className="fila-icono"><I.Check size={16} />Recorrido completo</span>
            )}
            {actual !== etapaActual && r.actual && <button className="btn-texto con-icono" onClick={() => setVista(null)}>Ir al paso actual<I.Flecha size={14} /></button>}
          </div>
          {verInvitacion && <PanelInvitacion {...p} />}
          {verInvitacion && <MasCarriers {...p} />}
          {actual === "evento" && <PanelEvento {...p} />}
          {actual === "ofertas" && d.evento.estado === "abierto" && <PanelSeguimiento d={d} ctx={ctx} accion={accion} />}
          {actual === "ofertas" && <PanelComparar {...p} />}
          {actual === "entrega" && <PanelEntrega {...p} />}
          {actual === "aviso" && <PanelAviso {...p} />}
          {s.modo === "rateware" && <MasDelEvento id={id} borrador={d.evento.estado === "borrador"} />}
        </div>
      </div>
    </section>
  );
}

// Las pantallas de Bidware del mismo evento, mientras se integran a la Mesa.
function MasDelEvento({ id, borrador }: { id: string; borrador: boolean }) {
  const ligas: { a: string; t: string; icono: (p: { size?: number }) => JSX.Element }[] = [
    ...(borrador ? [{ a: `/rfx/new/${id}`, t: "Editar el borrador", icono: I.Lapiz }] : []),
    { a: `/rfx/${id}/review`, t: "Revisión de contactos", icono: I.Lista },
    { a: `/rfx/${id}/message`, t: "Mensaje a carriers", icono: I.Sobre },
    { a: `/rfx/${id}/delivery`, t: "Cola de envío", icono: I.Bandeja },
    { a: `/rfx/${id}/chat`, t: "Chat del Bid Room", icono: I.Chat },
    { a: `/rfx/${id}/detalle`, t: "Detalle completo", icono: I.Libro }
  ];
  return (
    <nav className="mas-del-evento" aria-label="Más del evento">
      <span className="tenue">Más del evento</span>
      {ligas.map(({ a, t, icono: Ic }) => (
        <Liga key={a} a={a} className="chip-liga">
          <Ic size={14} /> {t}
        </Liga>
      ))}
    </nav>
  );
}

const ESTADO: Record<Detalle["evento"]["estado"], string> = {
  borrador: "Borrador",
  abierto: "Abierto a ofertas",
  cerrado: "Cerrado a ofertas",
  adjudicado: "Entregado",
  archivado: "Archivado"
};

type Props = {
  d: Detalle;
  ctx: Contexto;
  accion: <T>(f: () => Promise<T>, ok?: string | ((r: T) => string)) => Promise<void>;
  entrega: EntregaLocal;
  setEntrega: (e: EntregaLocal) => void;
  recibo: Recibo | null;
  setRecibo: (r: Recibo | null) => void;
};

// Cuando todos los candados están en orden basta una línea; se listan los que
// fallan o faltan por confirmar, y el resto se abre a pedido.
function Candados({ lista, titulo = "Candados" }: { lista: Candado[]; titulo?: string }) {
  const [ver, setVer] = useState(false);
  const pendientes = lista.filter((c) => !c.ok);
  const enOrden = lista.length - pendientes.length;
  const visibles = ver ? lista : pendientes;
  return (
    <div className="candados">
      {visibles.length > 0 && <h3>{titulo}</h3>}
      {visibles.length > 0 && (
        <ul>
          {visibles.map((c, i) => (
            <li key={i} className={c.ok ? "ok" : c.confirmable ? "confirmable" : "no"}>
              <span aria-hidden>{c.ok ? "✓" : c.confirmable ? "!" : "✕"}</span> {c.texto}
            </li>
          ))}
        </ul>
      )}
      {enOrden > 0 && (
        <p className="candados-ok">
          {!ver && <>✓ {pendientes.length ? `Los otros ${enOrden} candados` : `${enOrden} candados`} en orden </>}
          <button className="btn-texto" onClick={() => setVer(!ver)}>{ver ? "Ocultar los que están en orden" : "Ver"}</button>
        </p>
      )}
    </div>
  );
}

const ADVERTENCIA_REAL = (s: ReturnType<typeof useSesion>, d: Detalle) =>
  s.modo === "simulado"
    ? "Rateware simulado: nada sale de este navegador."
    : `Esto escribe en rateware-prod.${d.evento.prueba ? " Evento simulado: requiere la aprobación del propietario para esta acción." : ""}`;

// Solo en modo simulado: abrir la liga de cada carrier para probar el recorrido.
function LigasSimuladas({ d, ruta }: { d: Detalle; ruta?: Ruta }) {
  const s = useSesion();
  if (!s.sim || d.evento.estado !== "abierto") return null;
  return (
    <div className="nota">
      Ligas de carrier (simulado):{" "}
      {(ruta ? [ruta] : d.rutas).flatMap((r) => r.participaciones).map((p) => (
        // Misma pestaña: el Rateware simulado vive en la memoria de esta página.
        <Liga key={p.id} a={`/bid/${s.sim!.tokenDe(p.id)}`} className="liga-sim">
          {p.carrier}
        </Liga>
      ))}
    </div>
  );
}

function PanelEvento({ d, ctx, accion }: Props) {
  const editable = ctx.rol !== "viewer" && ["borrador", "abierto"].includes(d.evento.estado);
  // Una fila por ruta; las condiciones se abren debajo de su fila.
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <div className="tarjeta">
      <h2>Necesidad y evento</h2>
      {d.evento.cierre && <p className="tenue">Cerrado a ofertas el {fecha(d.evento.cierre.el)} (plazo original {fecha(d.evento.cierre.plazoOriginal)}).</p>}
      <div className="tabla-envoltura">
        <table className="tabla tabla-rutas">
          <thead>
            <tr><th>Ruta</th><th>Equipo</th><th>Frecuencia</th><th>Objetivo</th><th>Condiciones</th></tr>
          </thead>
          <tbody>
            {d.rutas.map((r) => {
              const ver = abierta === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className={ver ? "abierta" : undefined}>
                    <td><b>{r.origen} → {r.destino}</b></td>
                    <td>{r.equipo}</td>
                    <td>{r.volumenSemanal ?? "—"}/sem</td>
                    <td className="cifra">{dinero(r.objetivo, r.moneda)}</td>
                    <td>
                      <span className="fila-icono">
                        {r.condiciones.length ? <span className="pill info">{plural(r.condiciones.length, "condición", "condiciones")}</span> : <span className="tenue">sin condiciones</span>}
                        {(editable || r.condiciones.length > 0) && (
                          <button className="btn-chico" onClick={() => setAbierta(ver ? null : r.id)} aria-expanded={ver}>
                            {ver ? "Cerrar" : editable ? (r.condiciones.length ? "Editar" : "Elegir") : "Ver"}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                  {ver && (
                    <tr className="fila-detalle">
                      <td colSpan={5}>
                        <ListaCondiciones condiciones={r.condiciones} />
                        {editable && <EditorCondiciones d={d} ruta={r} accion={accion} inicialAbierto={!r.condiciones.length} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ESTADO_INVITACION: Record<string, string> = {
  borrador: "borrador",
  en_cola: "en cola (sin enviar)",
  aceptado: "aceptada por Gmail",
  rebotado: "rebotada",
  fallido: "falló",
  incierto: "incierta"
};

const ESTADO_ENVIADAS: Record<string, string> = {
  aceptado: "aceptadas por Gmail",
  rebotado: "rebotadas",
  incierto: "inciertas"
};

function PanelInvitacion({ d, ctx, accion }: Props) {
  const s = useSesion();
  const [avance, setAvance] = useState<AvanceEnvio | null>(null);
  // Los intentos de seguimiento se aprueban en «Seguimiento».
  const invitaciones = d.avisos.filter((a) => a.tipo === "invitacion" && !a.intento);
  const todas = d.rutas.flatMap((r) => r.participaciones);
  const carrierDe = (a: Aviso) => todas.find((x) => x.id === a.participacionId);
  // Solo salen invitaciones de carriers con «Revisado» vigente (el servidor lo
  // vuelve a comprobar); las demás se quedan y se dice por qué.
  const revisada = (a: Aviso) => {
    const p = carrierDe(a);
    return Boolean(p && estadoRevision(d, p.carrierId) === "revisado");
  };
  const enviables = invitaciones.filter((a) => a.estado === "borrador" || a.estado === "fallido" || a.estado === "en_cola");
  const porEnviar = enviables.filter(revisada);
  const detenidas = enviables.filter((a) => !revisada(a));
  const audiencia = audienciaInvitacion(d);
  const sinBorrador = audiencia.aptas.filter((p) => !invitaciones.some((a) => a.participaciones.includes(p.id)));
  const tandas = planearTandas(porEnviar).length;
  const [verEnviadas, setVerEnviadas] = useState(false);
  const [verTextos, setVerTextos] = useState(false);
  const [otroCanal, setOtroCanal] = useState(false);
  // Lo ya enviado se resume en una línea; el texto completo solo importa en lo
  // que falta aprobar (un texto de muestra y los demás a pedido).
  const enviadas = invitaciones.filter((a) => !enviables.includes(a));
  const porEstado = [...new Set(enviadas.map((a) => a.estado))].map((e) => `${enviadas.filter((a) => a.estado === e).length} ${ESTADO_ENVIADAS[e] ?? e}`).join(", ");
  // La lista completa solo se despliega a pedido; sale sola cuando alguna
  // invitación ya no es un simple borrador (en cola, fallida) o hay textos abiertos.
  const [verLista, setVerLista] = useState(false);
  const listaSola = enviables.some((a) => a.estado !== "borrador");
  const mostrarLista = verLista || verTextos || listaSola;
  const omitidas = [...new Map(audiencia.omitidas.map((o) => [o.p.carrierId, o])).values()];
  // Un solo botón: si el evento sigue en borrador, primero lo publica y luego envía.
  const publicarPrimero = d.evento.estado === "borrador";
  const ENVIAR = (
    <>
      {porEnviar.length > 0 && ctx.rol === "admin" && (
        <Confirmar
          etiqueta={publicarPrimero ? `Publicar e invitar a ${plural(porEnviar.length, "carrier")}` : `Enviar ${plural(porEnviar.length, "invitación", "invitaciones")}`}
          icono={publicarPrimero ? <I.Megafono size={15} /> : <I.Enviar size={15} />}
          advertencia={
            <>
              {publicarPrimero ? `Primero abre el evento a ofertas hasta el ${fecha(d.evento.plazo)}; luego se envían` : "Se envían"} {plural(porEnviar.length, "invitación", "invitaciones")} por Gmail desde sales@heymarksman.com, exactamente con el texto de «Ver textos»
              {tandas > 1 ? `, en ${tandas} tandas de hasta ${TAMANO_TANDA} con un minuto entre tandas` : ""}. Si Gmail llega a su cuota diaria, el envío se detiene y lo pendiente queda en cola, sin reintentos automáticos. {ADVERTENCIA_REAL(s, d)}
            </>
          }
          onConfirmar={() =>
            accion(
              async () => {
                if (publicarPrimero) await s.api.publicar(d.evento.id);
                let r: AvanceEnvio;
                try {
                  r = await s.api.enviarPorTandas(d.evento.id, porEnviar, { alAvanzar: setAvance });
                } catch (e) {
                  throw new Error(`${publicarPrimero ? "Evento publicado, pero no se pudo enviar: " : ""}${e instanceof Error ? e.message : String(e)}`);
                }
                setAvance(r);
                if (r.detenido) throw new Error(`${publicarPrimero ? "Evento publicado. " : ""}${r.enviados} de ${porEnviar.length} aceptadas por Gmail. ${r.detenido}`);
                return r;
              },
              (r) => `${publicarPrimero ? "Evento publicado y " : ""}${plural(r.enviados, "invitación aceptada", "invitaciones aceptadas")} por Gmail.`
            )
          }
        />
      )}
    </>
  );
  const accionOmitida = (o: (typeof omitidas)[number]) => (
    <>
      {!o.p.correo && ctx.rol !== "viewer" && <ContactosSugeridos vendorId={o.p.carrierId} />}
      {ctx.rol === "admin" && !bloqueoRevision(d, o.p) && (
        <Confirmar
          etiqueta="Revisado"
          clase="btn-chico"
          icono={<I.Check size={14} />}
          advertencia={<>Confirmas que revisaste el contacto de {o.p.carrier} ({o.p.correo}) y que puede recibir la invitación. Queda registrado en Rateware, igual que en Revisión de contactos. No envía nada. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() => accion(() => s.api.marcarRevisado(d.evento.id, o.p), `${o.p.carrier} marcado «Revisado».`)}
        />
      )}
    </>
  );
  const TABLA = mostrarLista && (enviables.length > 0 || omitidas.length > 0) && (
    <TablaInvitaciones d={d} avisos={enviables} carrierDe={carrierDe} textos={verTextos} revisada={revisada} omitidas={omitidas} accionOmitida={accionOmitida} />
  );
  return (
    <div className="tarjeta">
      <h2>Invitación</h2>
      {publicarPrimero && ctx.rol === "admin" && porEnviar.length === 0 && (
        <div className="linea-accion">
          <span className="linea-icono"><I.Candado size={16} /></span>
          <p>En borrador: los carriers no pueden ofertar hasta publicarlo.</p>
          <Confirmar
            etiqueta="Publicar"
            clase="btn-secundario"
            icono={<I.Megafono size={15} />}
            advertencia={<>Abre el evento a ofertas hasta el {fecha(d.evento.plazo)}. No envía nada. {ADVERTENCIA_REAL(s, d)}</>}
            onConfirmar={() => accion(() => s.api.publicar(d.evento.id), "Evento publicado.")}
          />
        </div>
      )}
      {!d.revisiones && (
        <p className="estado estado-error">No se pudo consultar qué carriers están revisados. No se prepara ni envía ninguna invitación hasta poder consultarlo.</p>
      )}
      {omitidas.length > 0 && d.revisiones && (
        <p className="fila-icono aviso-linea">
          <I.Alerta size={16} />
          <span>
            <b>{resumenOmisiones(audiencia)}</b>{" "}
            {!listaSola && !verTextos && <button className="btn-texto" onClick={() => setVerLista(!verLista)}>{verLista ? "Ocultar" : "Ver y marcar «Revisado»"}</button>}
            {s.modo === "rateware" && <> · <Liga a={`/rfx/${d.evento.id}/review`}>Revisar contactos</Liga></>}
            {omitidas.some((o) => o.estado === "revocada") && <span className="tenue"> · Una revisión revocada se vuelve a dar en Revisión de contactos.</span>}
          </span>
        </p>
      )}
      {!invitaciones.length && !audiencia.aptas.length && !audiencia.omitidas.length && <p className="tenue">El Operador aún no prepara las invitaciones.</p>}
      {sinBorrador.length > 0 && ctx.rol !== "viewer" && (
        <Confirmar
          etiqueta={`Preparar invitación para ${plural(new Set(sinBorrador.map((x) => x.carrierId)).size, "carrier revisado", "carriers revisados")}`}
          clase="btn-secundario"
          advertencia={<>Crea los borradores en la Cola de Rateware con la plantilla «RFx carrier invitation - Spanish», solo para: {[...new Set(sinBorrador.map((x) => x.carrier))].join(", ")}. No envía nada: el envío se aprueba aquí abajo. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() =>
            accion(
              () => s.api.prepararInvitaciones(d.evento.id, [...new Set(sinBorrador.map((x) => x.carrierId))], d.evento.folio),
              (r: any) => {
                const n = Number(r?.generated ?? r?.rows?.length ?? 0);
                const omitidos = Number(r?.skipped ?? r?.skipped_rows?.length ?? 0);
                if (!n) return `No se preparó ningún borrador${omitidos ? `: Rateware omitió ${omitidos}` : ""}. Revisa la Cola de Rateware.`;
                return `${plural(n, "borrador preparado", "borradores preparados")}${omitidos ? `; ${plural(omitidos, "omitido", "omitidos")} por Rateware` : ""}.`;
              }
            )
          }
        />
      )}
      {enviadas.length > 0 && (
        <p>
          {plural(enviadas.length, "invitación enviada", "invitaciones enviadas")}: {porEstado}.{" "}
          <button className="btn-texto" onClick={() => setVerEnviadas(!verEnviadas)}>{verEnviadas ? "Ocultar" : "Ver a quién"}</button>
        </p>
      )}
      {verEnviadas && <TablaInvitaciones d={d} avisos={enviadas} carrierDe={carrierDe} />}
      {enviables.length > 0 && (
        <div className="bloque-envio">
          <div className="fila">
            <p className="fila-icono"><I.Sobre size={16} /><span><b>{plural(enviables.length, "invitación por enviar", "invitaciones por enviar")}</b> <span className="tenue">· Gmail desde sales@heymarksman.com</span></span></p>
            <span className="acciones-linea">
              {!listaSola && !verTextos && <button className="btn-texto con-icono" onClick={() => setVerLista(!verLista)}><I.Lista size={15} />{verLista ? "Ocultar lista" : `Ver ${enviables.length === 1 ? "la invitación" : `las ${enviables.length}`}`}</button>}
              <button className="btn-texto con-icono" onClick={() => setVerTextos(!verTextos)}><I.Ojo size={15} />{verTextos ? "Ocultar textos" : enviables.length > 1 ? "Ver textos" : "Ver texto"}</button>
            </span>
          </div>
          {ENVIAR}
          {TABLA}
        </div>
      )}
      {enviables.length === 0 && ENVIAR}
      {enviables.length === 0 && TABLA}
      {detenidas.length > 0 && (
        <p className="tenue">{plural(detenidas.length, "borrador", "borradores")} no se envían porque su carrier no tiene «Revisado» vigente.</p>
      )}
      {avance && (
        <p className={avance.detenido ? "estado estado-error" : "tenue"}>
          Tanda {avance.hechas} de {avance.tandas}: {avance.enviados} aceptada(s) por Gmail{avance.enCola ? `, ${avance.enCola} en cola` : ""}
          {avance.inciertos ? `, ${avance.inciertos} incierta(s)` : ""}. {avance.detenido ?? ""}
        </p>
      )}
      {audiencia.aptas.length > 0 && ctx.rol === "admin" && (
        !otroCanal ? (
          <p className="pie-panel"><button className="btn-texto con-icono" onClick={() => setOtroCanal(true)}><I.Chat size={15} />¿Ya los invitaste por otro canal?</button></p>
        ) : (
        <div className="aviso-caja">
          <p>Márcalos como invitados (correo propio, WhatsApp, llamada) para capturar sus ofertas. Solo carriers revisados.</p>
          <Confirmar
            etiqueta={`Marcar ${plural(new Set(audiencia.aptas.map((x) => x.carrierId)).size, "carrier", "carriers")} como invitados sin enviar`}
            clase="btn-secundario"
            advertencia={<>Solo cambia el estado en Rateware: {[...new Set(audiencia.aptas.map((x) => x.carrier))].join(", ")}. Fr8Bid no envía nada. {ADVERTENCIA_REAL(s, d)}</>}
            onConfirmar={() => accion(() => s.api.marcarInvitadas(d.evento.id, audiencia.aptas.map((x) => x.id)), "Marcados como invitados.")}
          />
        </div>
        )
      )}
    </div>
  );
}


// Invitaciones como tabla compacta con buscador: en O-I son 42 carriers, y una
// lista de viñetas no se puede recorrer. El texto exacto se abre por fila.
type Omitida = ReturnType<typeof audienciaInvitacion>["omitidas"][number];
function TablaInvitaciones({ d, avisos, carrierDe, textos = false, revisada, omitidas = [], accionOmitida }: { d: Detalle; avisos: Aviso[]; carrierDe: (a: Aviso) => Participacion | undefined; textos?: boolean; revisada?: (a: Aviso) => boolean; omitidas?: Omitida[]; accionOmitida?: (o: Omitida) => ReactNode }) {
  const [busca, setBusca] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const q = busca.trim().toLowerCase();
  const filas = avisos
    .map((a) => ({ a, p: carrierDe(a) }))
    .filter(({ a, p }) => !q || [p?.carrier, a.destinatario].some((x) => (x || "").toLowerCase().includes(q)))
    .sort((x, y) => (x.p?.carrier || "").localeCompare(y.p?.carrier || ""));
  // Los carriers que no se invitan van en la misma lista, con su motivo y su acción.
  const filasOmitidas = omitidas.filter((o) => !q || [o.p.carrier, o.p.correo].some((x) => (x || "").toLowerCase().includes(q)));
  const tono = (e: string) => (e === "aceptado" ? "ok" : e === "rebotado" || e === "fallido" ? "err" : e === "en_cola" || e === "incierto" || e === "por_verificar" ? "warn" : "");
  const estadoDe = (a: Aviso) => (a.estado === "por_verificar" ? "aprobación no verificada" : ESTADO_INVITACION[a.estado] ?? a.estado);
  // La columna de rutas solo dice algo cuando no todos cubren todas las rutas.
  const verRutas = d.rutas.length > 1 && avisos.some((a) => a.participaciones.length !== d.rutas.length);
  const columnas = verRutas ? 5 : 4;
  return (
    <div className="tabla-invitaciones">
      {avisos.length + omitidas.length > 6 && (
        <label className="buscador compacto">
          <I.Lupa size={14} />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar carrier o correo…" aria-label="Buscar invitaciones" />
        </label>
      )}
      {q && <p className="tenue">{plural(filas.length + filasOmitidas.length, "coincidencia")} de {avisos.length + omitidas.length}.</p>}
      <div className="tabla-envoltura">
        <table className="tabla tabla-compacta">
          <thead>
            <tr>
              <th>Carrier</th>
              <th>Correo</th>
              {verRutas && <th>Rutas</th>}
              <th>Estado</th>
              <th aria-label="Texto" />
            </tr>
          </thead>
          <tbody>
            {filasOmitidas.map((o) => (
              <tr key={`om-${o.p.carrierId}`} className="detenida">
                <td><b>{o.p.carrier}</b></td>
                <td className="tenue">{o.p.correo || "sin correo en Rateware"}</td>
                {verRutas && <td />}
                <td><span className="pill warn">{o.motivo}</span></td>
                <td className="celda-accion">{accionOmitida?.(o)}</td>
              </tr>
            ))}
            {filas.map(({ a, p }) => {
              const omision = p && revisada && !revisada(a) ? MOTIVO_OMISION[estadoRevision(d, p.carrierId) as keyof typeof MOTIVO_OMISION] : null;
              const verTexto = textos || abierto === a.id;
              return (
                <Fragment key={a.id}>
                  <tr className={omision ? "detenida" : ""}>
                    <td><b>{p?.carrier ?? "—"}</b></td>
                    <td className="tenue">{a.destinatario}</td>
                    {verRutas && <td className="tenue">{a.participaciones.length} de {d.rutas.length}</td>}
                    <td>
                      <span className={`pill ${tono(a.estado)}`}>{estadoDe(a)}</span>
                      {a.estado === "en_cola" && <span className="tenue"> {a.motivo && /dailyLimit|daily_cap|quota/i.test(a.motivo) ? "cuota diaria de Gmail" : a.motivo || "todavía no sale"}</span>}
                      {omision && <span className="pill warn">{omision}</span>}
                    </td>
                    <td className="celda-accion">
                      {!textos && <button className="btn-icono" aria-expanded={verTexto} aria-label={verTexto ? "Ocultar texto" : "Ver texto"} title={verTexto ? "Ocultar texto" : "Ver texto"} onClick={() => setAbierto(verTexto ? null : a.id)}><I.Ojo size={16} /></button>}
                    </td>
                  </tr>
                  {verTexto && (
                    <tr className="fila-texto">
                      <td colSpan={columnas}>
                        <p><b>{a.asunto}</b></p>
                        <p className="texto-aviso">{a.cuerpo}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// «Carrier fit» de Rateware: solo lectura. Se consulta a pedido porque
// Rateware tarda unos segundos en juntar la evidencia.
// Suma un carrier sugerido a todas las rutas del evento (preseleccionado). No
// invita ni envía: después se marca «Revisado» y se prepara su invitación.
function SumarAlEvento({ d, ctx, accion, vendorId, nombre }: { d: Detalle; ctx: Contexto; accion: Props["accion"]; vendorId: string; nombre: string }) {
  const s = useSesion();
  if (ctx.rol === "viewer" || !["borrador", "abierto"].includes(d.evento.estado)) return null;
  return (
    <Confirmar
      etiqueta="Sumar al evento"
      clase="btn-texto"
      advertencia={<>Agrega a {nombre} como preseleccionado en {plural(d.rutas.length, "ruta")}. No lo invita ni le envía nada: después lo marcas «Revisado» y preparas su invitación. {ADVERTENCIA_REAL(s, d)}</>}
      onConfirmar={() => accion(() => s.api.sumarAlEvento(d, vendorId), `${nombre} sumado al evento. Márcalo «Revisado» en Invitación para invitarlo.`)}
    />
  );
}

// Carrier fit y Historial del segmento en una sola tarjeta: dos botones, y
// cada uno consulta a Rateware al abrirlo (un clic en vez de dos).
function MasCarriers(p: Props) {
  const [abierto, setAbierto] = useState<"fit" | "historial" | null>(null);
  return (
    <div className="tarjeta">
      <div className="fila">
        <h2 className="fila-icono"><I.Usuarios size={17} />¿Faltan carriers?</h2>
        <div className="fila-botones sin-margen">
          <button className={`btn-chico ${abierto === "fit" ? "activo" : ""}`} aria-pressed={abierto === "fit"} onClick={() => setAbierto(abierto === "fit" ? null : "fit")}><I.Mira size={15} />Carrier fit</button>
          <button className={`btn-chico ${abierto === "historial" ? "activo" : ""}`} aria-pressed={abierto === "historial"} onClick={() => setAbierto(abierto === "historial" ? null : "historial")}><I.Grafica size={15} />Historial del segmento</button>
        </div>
      </div>
      {!abierto && <p className="tenue ayuda">Sugeridos por cotizaciones y ofertas anteriores, o por tarifas aprobadas del mismo segmento.</p>}
      {abierto === "fit" && <PanelCarrierFit {...p} incrustado />}
      {abierto === "historial" && <PanelHistorialSegmento {...p} incrustado />}
    </div>
  );
}

function PanelCarrierFit({ d, ctx, accion, incrustado }: Props & { incrustado?: boolean }) {
  const s = useSesion();
  type Estado = { tipo: "cargando" } | { tipo: "ok"; datos: CarrierFit } | { tipo: "error"; mensaje: string };
  const [fit, setFit] = useState<Estado | null>(null);
  const consultar = () => {
    setFit({ tipo: "cargando" });
    s.api.carrierFit(d).then(
      (datos) => setFit({ tipo: "ok", datos }),
      (e) => setFit({ tipo: "error", mensaje: e instanceof Error ? e.message : "Error desconocido" })
    );
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (incrustado) consultar(); }, []);
  return (
    <div className={incrustado ? "incrustado" : "tarjeta"}>
      {!incrustado && <h2>Carriers sugeridos</h2>}
      <p className="tenue ayuda">
        Carriers con cotizaciones u ofertas anteriores en estas rutas («Carrier fit» de Rateware).
      </p>
      {!fit || fit.tipo === "error" ? (
        <>
          {fit?.tipo === "error" && <p className="error-texto">No se pudo consultar el Carrier fit: {fit.mensaje}</p>}
          <button className="btn-secundario" onClick={consultar}>
            {fit ? "Reintentar" : "Consultar Carrier fit"}
          </button>
        </>
      ) : fit.tipo === "cargando" ? (
        <p className="tenue">Consultando a Rateware…</p>
      ) : (
        <>
          {fit.datos.avisos.length > 0 && <p className="alerta">{fit.datos.avisos.join(" ")}</p>}
          {!fit.datos.sugerencias.length ? (
            <p className="tenue">Rateware no tiene carriers con historial para estas rutas.</p>
          ) : (
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr><th>Carrier</th><th>Fit</th><th>Por qué</th><th>Le falta</th><th>En este evento</th></tr>
                </thead>
                <tbody>
                  {fit.datos.sugerencias.map((x) => (
                    <tr key={x.vendorId}>
                      <td>
                        <b>{x.nombre}</b>
                        {x.cotizaciones > 0 && <div className="tenue">{plural(x.cotizaciones, "cotización ligada", "cotizaciones ligadas")}</div>}
                      </td>
                      <td className="mono">{x.puntaje}</td>
                      <td>{x.porque || "—"}</td>
                      <td>{x.huecos.length ? x.huecos.join("; ") : "—"}</td>
                      <td>
                        {x.yaEnEvento ? <span className="pill ok-pill">Ya invitado</span> : x.revisado ? <span className="pill">Revisado, sin invitar</span> : <span className="pill">No está</span>}
                        {!x.yaEnEvento && !enEvento(d, x.vendorId) && <SumarAlEvento d={d} ctx={ctx} accion={accion} vendorId={x.vendorId} nombre={x.nombre} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button className="btn-texto" onClick={consultar}>Volver a consultar</button>
        </>
      )}
    </div>
  );
}

// Contactos que Rateware ya conoce cuando el carrier no tiene uno útil: los del
// registro y los de otros registros con su mismo dominio, sin rebotes recientes
// en Gmail ni «no contactar». Solo los muestra: no cambia el contacto del
// carrier en Rateware ni invita a nadie.
function ContactosSugeridos({ vendorId, abrir = false }: { vendorId: string; abrir?: boolean }) {
  const s = useSesion();
  type Estado = { tipo: "cargando" } | { tipo: "ok"; datos: ContactosCarrier } | { tipo: "error"; mensaje: string };
  const [c, setC] = useState<Estado | null>(null);
  const consultar = () => {
    setC({ tipo: "cargando" });
    s.api.contactosConocidos(vendorId).then(
      (datos) => setC({ tipo: "ok", datos }),
      (e) => setC({ tipo: "error", mensaje: e instanceof Error ? e.message : "Error desconocido" })
    );
  };
  useEffect(() => {
    if (abrir) consultar();
  }, [abrir, vendorId]);
  if (!c || c.tipo === "error")
    return (
      <>
        {c?.tipo === "error" && <span className="error-texto"> No se pudieron consultar los contactos: {c.mensaje}</span>}
        <button className="btn-texto" onClick={consultar}>{c ? "Reintentar" : "Buscar contactos conocidos"}</button>
      </>
    );
  if (c.tipo === "cargando") return <span className="tenue"> Buscando contactos en Rateware…</span>;
  const x = c.datos;
  return (
    <div className="aviso-caja">
      <p>
        <b>Contactos conocidos de {x.nombre}</b>
        {x.dominio ? ` (dominio ${x.dominio})` : ""}. Fr8Bid solo los sugiere: para usar uno, ponlo como contacto del carrier en Rateware y márcalo «Revisado».
      </p>
      {x.avisos.map((a) => <p key={a} className="alerta">{a}</p>)}
      {!x.sugeridos.length ? (
        <p className="tenue">Rateware no tiene otro contacto limpio de este carrier.</p>
      ) : (
        <ul>
          {x.sugeridos.map((k) => (
            <li key={`${k.tipo}:${k.valor}`}>
              <span className="mono">{k.tipo === "whatsapp" ? `WhatsApp ${k.valor}` : k.valor}</span>
              {k.nombre ? ` · ${k.nombre}` : ""} · <span className="tenue">{k.origen}{k.ultimoUso ? `; último uso ${k.ultimoUso}` : ""}</span>
              {k.nota && <span className="tenue"> · {k.nota}</span>}
            </li>
          ))}
        </ul>
      )}
      {x.descartados.length > 0 && (
        <p className="tenue">No se sugieren: {x.descartados.map((k) => `${k.valor} (${k.motivo})`).join(", ")}.</p>
      )}
      {x.dominio && <BuscarEnApollo dominio={x.dominio} />}
    </div>
  );
}

// Contactos nuevos en Apollo por el dominio del carrier: buscar es gratis;
// revelar un correo cuesta 1 crédito y lo confirma el Administrador. Fr8Bid no
// guarda el correo: se pone a mano en Rateware.
function BuscarEnApollo({ dominio }: { dominio: string }) {
  const s = useSesion();
  type Estado = { tipo: "cargando" } | { tipo: "ok"; total: number; personas: PersonaApollo[] } | { tipo: "error"; mensaje: string };
  const [b, setB] = useState<Estado | null>(null);
  const [revelados, setRevelados] = useState<Record<string, CorreoRevelado | string>>({});
  const buscar = () => {
    setB({ tipo: "cargando" });
    s.api.buscarEnApollo(dominio).then(
      (r) => setB({ tipo: "ok", ...r }),
      (e) => setB({ tipo: "error", mensaje: e instanceof Error ? e.message : "Error desconocido" })
    );
  };
  const revelar = async (p: PersonaApollo) => {
    try {
      const r = await s.api.revelarCorreoApollo(p.id);
      setRevelados((v) => ({ ...v, [p.id]: r }));
    } catch (e) {
      setRevelados((v) => ({ ...v, [p.id]: e instanceof Error ? e.message : "Error desconocido" }));
    }
  };
  if (!b || b.tipo === "error")
    return (
      <p>
        {b?.tipo === "error" && <span className="error-texto">Apollo: {b.mensaje} </span>}
        <button className="btn-texto" onClick={buscar}>{b ? "Reintentar en Apollo" : `Buscar personas de ${dominio} en Apollo (gratis)`}</button>
      </p>
    );
  if (b.tipo === "cargando") return <p className="tenue">Buscando en Apollo…</p>;
  const utiles = b.personas.filter((p) => p.prioridad < 3);
  const lista = utiles.length ? utiles : b.personas;
  return (
    <div>
      <p>
        <b>Apollo:</b> {plural(b.total, "persona")} con {dominio}
        {utiles.length ? `; ${utiles.length} deciden o cotizan` : ""}. Revelar un correo cuesta 1 crédito de Apollo.
      </p>
      {!lista.length ? (
        <p className="tenue">Apollo no tiene personas con este dominio.</p>
      ) : (
        <ul>
          {lista.slice(0, 12).map((p) => {
            const r = revelados[p.id];
            return (
              <li key={p.id}>
                {p.nombre} · {p.puesto} <span className="tenue">({p.rol})</span>{" "}
                {typeof r === "object" ? (
                  r.correo ? <span className="mono">{r.correo}{r.estado ? ` · ${r.estado}` : ""}</span> : <span className="tenue">Apollo no dio correo (no se cobró).</span>
                ) : !p.tieneCorreo ? (
                  <span className="tenue">sin correo en Apollo</span>
                ) : s.rol === "admin" ? (
                  <>
                    {typeof r === "string" && <span className="error-texto">{r} </span>}
                    <Confirmar etiqueta="Revelar correo (1 crédito)" clase="btn-texto" advertencia={`Se gasta 1 crédito de Apollo para ver el correo de ${p.nombre}. Fr8Bid no lo guarda ni le escribe.`} onConfirmar={() => revelar(p)} />
                  </>
                ) : (
                  <span className="tenue">correo disponible (lo revela el Administrador)</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Historial del segmento: carriers con tarifas aprobadas en Rateware de la
// misma caja, operación D2D y cruce que la ruta. Es evidencia «solo tarifa»:
// no confirma el equipo y no reemplaza la revisión en Bidware.
const enEvento = (d: Detalle, vendorId: string) => d.rutas.some((r) => r.participaciones.some((p) => p.carrierId === vendorId));

function PanelHistorialSegmento({ d, ctx, accion, incrustado }: Props & { incrustado?: boolean }) {
  const s = useSesion();
  type Estado = { tipo: "cargando" } | { tipo: "ok"; datos: HistorialSegmento[] } | { tipo: "error"; mensaje: string };
  const [h, setH] = useState<Estado | null>(null);
  const consultar = () => {
    setH({ tipo: "cargando" });
    s.api.historialSegmento(d).then(
      (datos) => setH({ tipo: "ok", datos }),
      (e) => setH({ tipo: "error", mensaje: e instanceof Error ? e.message : "Error desconocido" })
    );
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (incrustado) consultar(); }, []);
  return (
    <div className={incrustado ? "incrustado" : "tarjeta"}>
      {!incrustado && <h2>Historial del segmento</h2>}
      <p className="tenue ayuda">
        Carriers con tarifas aprobadas de la misma caja, puerta a puerta y con cruce. Es solo tarifa: confirma equipo y contacto antes de invitarlo.
      </p>
      {!h || h.tipo === "error" ? (
        <>
          {h?.tipo === "error" && <p className="error-texto">No se pudo consultar el historial: {h.mensaje}</p>}
          <button className="btn-secundario" onClick={consultar}>
            {h ? "Reintentar" : "Consultar historial del segmento"}
          </button>
        </>
      ) : h.tipo === "cargando" ? (
        <p className="tenue">Consultando a Rateware…</p>
      ) : (
        <>
          {!h.datos.length && <p className="tenue">Ninguna ruta de este evento es D2D crossborder con una caja conocida.</p>}
          {h.datos.map((g) => (
            <div key={`${g.segmento.familia}|${g.segmento.operacion}`}>
              <h3>
                {NOMBRE_FAMILIA[g.segmento.familia]} · {g.segmento.operacion} · {g.rutas.length === 1 ? "ruta" : "rutas"} {g.rutas.join(", ")}
              </h3>
              {g.truncado && <p className="alerta">Se leyeron las primeras {g.filasLeidas} tarifas; puede haber más.</p>}
              {!g.sugerencias.length ? (
                <p className="tenue">Rateware no tiene tarifas de este segmento.</p>
              ) : (
                <div className="tabla-envoltura">
                  <table className="tabla">
                    <thead>
                      <tr><th>Carrier</th><th>Tarifas</th><th>Mismo origen / destino (estado)</th><th>Rutas</th><th>Última</th><th>En este evento</th></tr>
                    </thead>
                    <tbody>
                      {g.sugerencias.map((x) => (
                        <tr key={x.clave}>
                          <td>
                            <b>{x.nombre}</b>
                            {x.inactivo && <div className="tenue">Inactivo en Rateware</div>}
                            {!x.vendorId && <div className="tenue">Sin carrier ligado en Rateware</div>}
                            {x.nota && <div className="alerta">Jose: {x.nota.texto}</div>}
                          </td>
                          <td className="mono">{x.tarifas}</td>
                          <td className="mono">{x.mismoOrigen} / {x.mismoDestino}</td>
                          <td>{x.ejemplos.join("; ")}</td>
                          <td className="mono">{x.ultima || "—"}</td>
                          <td>
                            {x.yaEnEvento ? <span className="pill ok-pill">Ya invitado</span> : x.revisado ? <span className="pill">Revisado, sin invitar</span> : <span className="pill">No está</span>}
                            {!x.yaEnEvento && x.vendorId && !x.inactivo && !enEvento(d, x.vendorId) && <SumarAlEvento d={d} ctx={ctx} accion={accion} vendorId={x.vendorId} nombre={x.nombre} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {g.descartados.length > 0 && (
                <details>
                  <summary className="tenue">{plural(g.descartados.length, "carrier", "carriers")} con tarifas de este segmento que Jose descartó</summary>
                  <ul>
                    {g.descartados.map((x) => (
                      <li key={x.clave}>
                        <b>{x.nombre}</b> ({x.tarifas} tarifa(s)): {x.nota?.texto}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
          <button className="btn-texto" onClick={consultar}>Volver a consultar</button>
        </>
      )}
    </div>
  );
}

// Seguimiento por carrier y recordatorio. El recordatorio se abre como
// borrador en Gmail: Fr8Bid no lo envía, lo envía el Administrador.
function PanelSeguimiento({ d, ctx, accion }: { d: Detalle; ctx: Contexto; accion: Props["accion"] }) {
  const s = useSesion();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [revisados, setRevisados] = useState<Map<string, Telefono>>(new Map());
  const [revision, setRevision] = useState<{ tipo: "cargando" } | { tipo: "hecho"; texto: string } | { tipo: "error"; texto: string } | null>(null);
  const [verTabla, setVerTabla] = useState(false);
  const filas = seguimiento(d, ctx.hoy);
  if (!filas.length) return null;
  // Si nadie está pendiente, la tabla por carrier no pide nada: se abre a pedido.
  const hayPendientes = filas.some((x) => esperaRespuesta(x.estado) || x.estado === "rebote");
  const candidatos = new Set(candidatosRecordatorio(d, ctx.hoy).map((x) => x.carrierId));
  const conteo = (e: EstadoSeguimiento) => filas.filter((x) => x.estado === e).length;
  const orden: EstadoSeguimiento[] = ["sin_abrir", "abrio_correo", "abrio", "rebote", "respondio", "declino", "oferto"];
  const sinAbrirMedidos = filas.filter((x) => x.estado === "sin_abrir" && x.correoMedido).length;
  const ordenadas = [...filas].sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado) || (b.diasSinRespuesta ?? 0) - (a.diasSinRespuesta ?? 0));
  const ahora = new Date();
  const flacas = rutasSinProfundidad(d);
  const siguiente = new Map(filas.map((x) => [x.carrierId, siguienteIntento(d, x, ahora)]));
  // La columna solo aparece si algún carrier tiene un intento por delante.
  const conSiguiente = [...siguiente.values()].some(Boolean);
  const tocan = [...siguiente.values()].filter((x) => x?.vencido);
  const porPreparar = intentosPorPreparar(d, ahora, ctx.hoy);
  const muestra = porPreparar[0];
  const whatsapp = intentosWhatsapp(d, ahora, ctx.hoy, revisados);
  const whatsappDe = new Map(whatsapp.map((w) => [w.s.carrierId, w]));
  const sinNumero = whatsapp.filter((w) => !w.liga);
  const dudosos = whatsapp.filter((w) => w.telefono.certeza === "dudoso" && w.s.whatsapp && !w.s.whatsappNoContactar);
  const revisarDudosos = () => {
    setRevision({ tipo: "cargando" });
    s.api.revisarTelefonos(dudosos.map((w) => ({ id: w.s.carrierId, valor: String(w.s.whatsapp), carrier: w.s.carrier, dominio: null }))).then(
      (r) => {
        setRevisados(new Map([...revisados, ...r.telefonos]));
        const siguen = [...r.telefonos.values()].filter((t) => t.certeza === "dudoso").length;
        const texto =
          r.ia === "no_configurada"
            ? "La IA todavía no está configurada (falta ANTHROPIC_API_KEY en Vercel): estos números siguen por confirmar."
            : r.ia === "fallo"
              ? "La IA no respondió: estos números siguen por confirmar."
              : `La IA revisó ${r.revisadosPorIa} número(s)${siguen ? `; ${siguen} sigue(n) por confirmar` : ""}.`;
        setRevision({ tipo: "hecho", texto });
      },
      (e) => setRevision({ tipo: "error", texto: e instanceof Error ? e.message : "Error desconocido" })
    );
  };
  return (
    <div className="tarjeta">
      <div className="fila">
        <h2 className="fila-icono"><I.Usuarios size={17} />Seguimiento <span className="tenue">· {plural(filas.length, "invitado")}</span></h2>
        {!hayPendientes && (
          <button className="btn-texto con-icono" onClick={() => setVerTabla(!verTabla)}><I.Lista size={15} />{verTabla ? "Ocultar detalle" : "Ver por carrier"}</button>
        )}
      </div>
      <ul className="conteos">
        {conteo("oferto") > 0 && <li className="ok"><I.Check size={14} />{conteo("oferto")} ofertaron</li>}
        {conteo("abrio") > 0 && <li className="warn"><I.Ojo size={14} />{conteo("abrio")} abrieron sin ofertar</li>}
        {conteo("abrio_correo") > 0 && <li className="warn"><I.Sobre size={14} />{conteo("abrio_correo")} abrieron el correo, no la liga</li>}
        {sinAbrirMedidos > 0 && <li className="warn"><I.Reloj size={14} />{sinAbrirMedidos} no abrieron el correo</li>}
        {conteo("sin_abrir") - sinAbrirMedidos > 0 && <li className="warn"><I.Reloj size={14} />{conteo("sin_abrir") - sinAbrirMedidos} sin abrir la liga</li>}
        {conteo("respondio") > 0 && <li><I.Chat size={14} />{conteo("respondio")} por otro canal</li>}
        {conteo("declino") > 0 && <li><I.Salir size={14} />{conteo("declino")} declinaron</li>}
        {conteo("rebote") > 0 && <li className="err"><I.Alerta size={14} />{conteo("rebote")} rebotaron</li>}
      </ul>
      {d.respuestas === null && (
        <p className="aviso-caja">
          No se pudo revisar quién ya contestó por correo o en el chat del Bid Room. Mientras no se pueda, Fr8Bid no prepara intentos ni recordatorios.
        </p>
      )}
      {flacas.length > 0 && (
        <div className="aviso-caja">
          <p>
            <b>Falta profundidad:</b> {flacas.map((x) => `ruta ${x.ruta.numero} con ${plural(x.ofertas, "oferta")}`).join(", ")} de {PROFUNDIDAD_MINIMA} mínimas.
            Cadencia: 2º intento a las 8 h del envío, 3º 12 h después del 2º y luego WhatsApp.
          </p>
          {tocan.length > 0 && (
            <p>
              <span className="pill alerta">Ya toca</span> {[...new Set(tocan.map((x) => `${x!.intento}º intento por ${x!.canal === "whatsapp" ? "WhatsApp" : "correo"}`))].join(", ")} a {tocan.length} carrier(s).
              {tocan.some((x) => x!.canal === "correo") ? "Fr8Bid no envía solo: el correo se prepara y se aprueba aquí abajo." : "Fr8Bid no envía solo."}
            </p>
          )}
          {whatsapp.length > 0 && ctx.rol !== "viewer" && (
            <>
              <p>
                <b>WhatsApp:</b> {whatsapp.length - sinNumero.length} con número
                {sinNumero.length > 0 && <>; sin liga: {sinNumero.map((w) => `${w.s.carrier} (${w.motivo})`).join(", ")}</>}.
                Usa «WhatsApp» en cada renglón: abre el chat con este texto y lo envías tú desde tu teléfono. Si contesta, márcalo con «Ya respondió».
              </p>
              {dudosos.length > 0 && (
                <p>
                  <span className="pill alerta">Por confirmar</span> {plural(dudosos.length, "número", "números")} con lada que existe en México y en EE. UU. o con formato raro:{" "}
                  {dudosos.map((w) => `${w.s.carrier} (${w.telefono.motivo})`).join(", ")}.{" "}
                  {revision?.tipo === "cargando" ? (
                    <span className="tenue">Revisando con IA…</span>
                  ) : (
                    <button className="btn-texto" onClick={revisarDudosos}>Revisar con IA</button>
                  )}
                </p>
              )}
              {revision && revision.tipo !== "cargando" && <p className={revision.tipo === "error" ? "error-texto" : "tenue"}>{revision.texto}</p>}
              <p className="texto-aviso">{whatsapp[0].texto}</p>
            </>
          )}
          {muestra && ctx.rol !== "viewer" && (
            <>
              <p className="tenue ayuda">
                Texto del {muestra.paso.intento}º intento, del bid completo. Rateware lo pone dentro de su plantilla con todas las rutas y el botón a la liga privada. Va en el hilo solo si el carrier ya
                escribió; si no, sale como correo nuevo con asunto «Seguimiento {d.evento.folio} · {d.evento.nombre} · {d.rutas.length} rutas»:
              </p>
              <p className="texto-aviso">{textoIntento(d, muestra.paso)}</p>
              <Confirmar
                etiqueta={`Preparar ${plural(porPreparar.length, "intento", "intentos")}`}
                clase="btn-secundario"
                advertencia={`Rateware deja ${porPreparar.length} borrador(es) en la Cola, uno por carrier sin respuesta. No se envía nada: el envío lo apruebas aquí mismo.`}
                onConfirmar={() =>
                  accion(async () => {
                    let listos = 0;
                    for (const x of porPreparar) {
                      await s.api.prepararIntento(d.evento.id, x.participacion.id, textoIntento(d, x.paso), claveIntento(d.evento.id, x.participacion.id, x.paso.intento));
                      listos++;
                    }
                    return listos;
                  }, (n) => `${plural(n, "intento listo", "intentos listos")}. Revísalos y apruébalos abajo.`)
                }
              />
            </>
          )}
        </div>
      )}
      <IntentosPorEnviar d={d} ctx={ctx} accion={accion} />
      {(hayPendientes || verTabla) && (
      <div className="tabla-envoltura">
      <table className="tabla tabla-tarjetas">
        <thead>
          <tr><th>Carrier</th><th>Estado</th><th>Rutas</th><th>Actividad</th>{conSiguiente && <th>Siguiente intento</th>}<th></th></tr>
        </thead>
        <tbody>
          {ordenadas.map((x) => {
            const r = candidatos.has(x.carrierId) ? recordatorio(d, x) : null;
            return (
              <Fragment key={x.carrierId}>
                <tr>
                  <td><b>{x.carrier}</b></td>
                  <td data-etiqueta="Estado">
                    <span className={`pill ${TONO_SEGUIMIENTO[x.estado]}`}>
                      {etiquetaSeguimiento(x)}
                    </span>
                    {x.diasSinRespuesta ? <span className="tenue"> {plural(x.diasSinRespuesta, "día")}</span> : null}
                  </td>
                  <td data-etiqueta="Rutas">{x.estado === "oferto" && x.ofertadas < x.rutas ? `${x.ofertadas} de ${x.rutas}` : x.rutas}</td>
                  <td data-etiqueta="Actividad" className="tenue sin-salto">
                    <span title="Invitado"><I.Enviar size={13} /> {dia(x.invitadaEn)}</span>
                    {x.correoAbiertoEn && <span title="Abrió el correo (Gmail)"> · <I.Sobre size={13} /> {dia(x.correoAbiertoEn)}</span>}
                    {x.vistaEn && <span title="Abrió la liga"> · <I.Ojo size={13} /> {dia(x.vistaEn)}</span>}
                  </td>
                  {conSiguiente && <td data-etiqueta="Siguiente intento">
                    {(() => {
                      const sig = siguiente.get(x.carrierId);
                      if (!sig) return "—";
                      return <>{sig.intento}º por {sig.canal === "whatsapp" ? "WhatsApp" : "correo"} · {sig.enCola ? "borrador por aprobar" : sig.vencido ? <span className="pill alerta">ya toca</span> : fecha(sig.tocaEn)}</>;
                    })()}
                  </td>}
                  <td className="acciones-chicas">
                    {whatsappDe.get(x.carrierId)?.liga && ctx.rol !== "viewer" && (
                      <a className="btn-chico" href={whatsappDe.get(x.carrierId)!.liga!} target="_blank" rel="noreferrer" title={`+${whatsappDe.get(x.carrierId)!.numero} · ${whatsappDe.get(x.carrierId)!.telefono.motivo}`}>
                        <I.Chat size={14} />WhatsApp{whatsappDe.get(x.carrierId)!.telefono.certeza === "dudoso" ? " (por confirmar)" : ""}
                      </a>
                    )}
                    {(x.estado === "rebote" || (whatsappDe.has(x.carrierId) && !whatsappDe.get(x.carrierId)!.liga)) && ctx.rol !== "viewer" && (
                      <button className="btn-chico" onClick={() => setAbierto(abierto === `c:${x.carrierId}` ? null : `c:${x.carrierId}`)}>
                        <I.Usuarios size={14} />{abierto === `c:${x.carrierId}` ? "Ocultar" : "Otros contactos"}
                      </button>
                    )}
                    {r && ctx.rol !== "viewer" && (
                      <button className="btn-chico" onClick={() => setAbierto(abierto === x.carrierId ? null : x.carrierId)}>
                        <I.Sobre size={14} />{abierto === x.carrierId ? "Ocultar" : "Recordatorio"}
                      </button>
                    )}
                    {!bloqueoRespondio(d, x) && ctx.rol !== "viewer" && (
                      <button className="btn-chico" onClick={() => setAbierto(abierto === `r:${x.carrierId}` ? null : `r:${x.carrierId}`)}>
                        <I.Check size={14} />{abierto === `r:${x.carrierId}` ? "Ocultar" : "Ya respondió"}
                      </button>
                    )}
                  </td>
                </tr>
                {abierto === `c:${x.carrierId}` && (
                  <tr>
                    <td colSpan={conSiguiente ? 6 : 5}>
                      <ContactosSugeridos vendorId={x.carrierId} abrir />
                    </td>
                  </tr>
                )}
                {abierto === `r:${x.carrierId}` && (
                  <tr>
                    <td colSpan={conSiguiente ? 6 : 5}>
                      <YaRespondio d={d} s={x} accion={accion} />
                    </td>
                  </tr>
                )}
                {r && abierto === x.carrierId && (
                  <tr>
                    <td colSpan={conSiguiente ? 6 : 5}>
                      <div className="aviso-caja">
                        <p className="tenue">Para: {r.para} · Gmail</p>
                        <p><b>{r.asunto}</b></p>
                        <p className="texto-aviso">{r.cuerpo}</p>
                        <p className="tenue ayuda">Fr8Bid no envía este recordatorio. «Abrir en Gmail» crea el borrador en tu cuenta; revísalo y envíalo tú si estás de acuerdo.</p>
                        <a className="btn-secundario" href={r.gmail} target="_blank" rel="noreferrer">Abrir en Gmail</a>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
    </div>
  );
}

// Intentos preparados (borradores de Rateware) que se aprueban aquí con su
// versión exacta, en tandas: sin pasar por la Cola ni por sus window.confirm.
// Solo a carriers con «Revisado» vigente (el servidor lo vuelve a comprobar).
function IntentosPorEnviar({ d, ctx, accion }: { d: Detalle; ctx: Contexto; accion: Props["accion"] }) {
  const s = useSesion();
  const [avance, setAvance] = useState<AvanceEnvio | null>(null);
  const [verTextos, setVerTextos] = useState(false);
  const todas = d.rutas.flatMap((r) => r.participaciones);
  const carrierDe = (a: Aviso) => todas.find((x) => x.id === a.participacionId);
  const intentos = d.avisos.filter((a) => a.intento && (a.estado === "borrador" || a.estado === "fallido" || a.estado === "en_cola"));
  if (!intentos.length && !avance) return null;
  const revisado = (a: Aviso) => {
    const p = carrierDe(a);
    return Boolean(p && estadoRevision(d, p.carrierId) === "revisado");
  };
  // Si el carrier ya ofertó, declinó o contestó, el borrador ya no se manda.
  const vigentes = new Set(seguimiento(d, ctx.hoy).filter((x) => esperaRespuesta(x.estado)).map((x) => x.carrierId));
  const sigue = (a: Aviso) => vigentes.has(carrierDe(a)?.carrierId ?? "");
  const porEnviar = intentos.filter((a) => revisado(a) && sigue(a));
  const detenidos = intentos.filter((a) => !porEnviar.includes(a));
  const tandas = planearTandas(porEnviar).length;
  return (
    <div className="aviso-caja">
      <p>
        <b>{plural(intentos.length, "intento preparado", "intentos preparados")}</b> sin enviar
        {detenidos.length > 0 && <> · {detenidos.length} no se envían (el carrier ya respondió o no tiene «Revisado» vigente)</>}.
      </p>
      <button className="btn-texto" onClick={() => setVerTextos(!verTextos)}>{verTextos ? "Ocultar textos" : "Ver los textos exactos"}</button>
      {verTextos &&
        intentos.map((a) => (
          <div key={a.id} className="aviso-caja">
            <div className="fila">
              <b>{carrierDe(a)?.carrier ?? a.destinatario}</b>
              <span className="pill">{a.enHilo ? "en el hilo del carrier" : "correo nuevo"}</span>
              {!porEnviar.includes(a) && <span className="pill">no se envía</span>}
            </div>
            <p className="tenue">Para: {a.destinatario} · Gmail · versión {fecha(a.version)}</p>
            <p><b>{a.asunto}</b></p>
            <p className="texto-aviso">{a.cuerpo}</p>
          </div>
        ))}
      {avance && (
        <p className={avance.detenido ? "estado estado-error" : "tenue"}>
          Tanda {avance.hechas} de {avance.tandas}: {avance.enviados} aceptado(s) por Gmail{avance.enCola ? `, ${avance.enCola} en cola` : ""}
          {avance.inciertos ? `, ${avance.inciertos} incierto(s)` : ""}. {avance.detenido ?? ""}
        </p>
      )}
      {porEnviar.length > 0 && ctx.rol === "admin" && (
        <Confirmar
          etiqueta={`Aprobar y enviar ${plural(porEnviar.length, "intento", "intentos")}`}
          advertencia={
            <>
              Se envían por Gmail desde sales@heymarksman.com, exactamente la versión que Rateware tiene ahora (ábrelos con «Ver los textos exactos»)
              {tandas > 1 ? `, en ${tandas} tandas de hasta ${TAMANO_TANDA} con un minuto entre tandas` : ""}. Si alguien edita uno en la Cola antes, Rateware lo rechaza. Si Gmail
              llega a su cuota diaria, se detiene y lo pendiente queda en cola, sin reintentos automáticos. {ADVERTENCIA_REAL(s, d)}
            </>
          }
          onConfirmar={() =>
            accion(
              async () => {
                const r = await s.api.enviarPorTandas(d.evento.id, porEnviar, { alAvanzar: setAvance });
                setAvance(r);
                if (r.detenido) throw new Error(`${r.enviados} de ${porEnviar.length} aceptados por Gmail. ${r.detenido}`);
                return r;
              },
              (r) => `${plural(r.enviados, "intento aceptado", "intentos aceptados")} por Gmail.`
            )
          }
        />
      )}
    </div>
  );
}

// El carrier contestó por correo o WhatsApp sin ofertar en la liga (preguntó o
// rechazó): se marca en Rateware y sale de los intentos. Si mandó tarifa, va por
// «Capturar oferta recibida por otro canal».
function YaRespondio({ d, s: x, accion }: { d: Detalle; s: ReturnType<typeof seguimiento>[number]; accion: Props["accion"] }) {
  const s = useSesion();
  const [canal, setCanal] = useState<"email" | "whatsapp" | "phone">("email");
  const [rechazo, setRechazo] = useState(false);
  const [nota, setNota] = useState("");
  const ids = x.pendientes.map((f) => f.participacion.id);
  return (
    <div className="aviso-caja">
      <div className="rejilla">
        <label className="campo"><span>Canal</span>
          <select value={canal} onChange={(e) => setCanal(e.target.value as typeof canal)}>
            <option value="email">Correo</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="phone">Teléfono</option>
          </select>
        </label>
        <label className="campo"><span>Qué dijo</span>
          <input value={nota} maxLength={300} placeholder="p. ej. sin unidades directas a OK" onChange={(e) => setNota(e.target.value)} />
        </label>
        <label className="campo"><span><input type="checkbox" checked={rechazo} onChange={(e) => setRechazo(e.target.checked)} /> Rechazó</span></label>
      </div>
      <Confirmar
        etiqueta={rechazo ? "Marcar que rechazó" : "Marcar que respondió"}
        clase="btn-secundario"
        advertencia={`${x.carrier} queda como ${rechazo ? "«declinó»" : "«respondió»"} en Rateware en ${plural(ids.length, "ruta")} y ya no recibe intentos. No se envía nada.`}
        deshabilitado={!ids.length}
        onConfirmar={() =>
          accion(async () => {
            for (const id of ids) await s.api.marcarRespondio({ eventId: d.evento.id, participacionId: id, rechazo, canal, nota });
            return ids.length;
          }, () => `${x.carrier} ya no recibe intentos.`)
        }
      />
    </div>
  );
}

// Captura del equipo: la oferta llegó por otro canal. Cada captura es una
// versión nueva; las anteriores no se tocan.
function CapturaEquipo({ d, ruta, accion }: { d: Detalle; ruta: Ruta; accion: Props["accion"] }) {
  const s = useSesion();
  const candidatas = candidatasCaptura(d, ruta);
  const vacio = { id: "", tarifa: "", moneda: "USD", vigencia: "", capacidad: "", transito: "", canal: "email" as const, notas: "" };
  const [f, setF] = useState<{ id: string; tarifa: string; moneda: string; vigencia: string; capacidad: string; transito: string; canal: "email" | "phone" | "whatsapp" | "other"; notas: string }>(vacio);
  const [abierto, setAbierto] = useState(false);
  if (s.rol === "viewer" || !candidatas.length) return null;
  if (!abierto) return <button className="btn-texto con-icono" onClick={() => setAbierto(true)}><I.Mas size={14} />Capturar oferta recibida por otro canal</button>;
  const tarifa = Number(f.tarifa.replace(/,/g, ""));
  const num = (x: string) => (x.trim() === "" ? null : Number(x));
  const valido = f.id && tarifa > 0 && [f.capacidad, f.transito].every((x) => x.trim() === "" || Number.isFinite(Number(x)));
  const elegida = candidatas.find((x) => x.id === f.id);
  return (
    <div className="aviso-caja">
      <h3>Captura del equipo</h3>
      <div className="rejilla">
        <label className="campo"><span>Carrier</span>
          <select value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })}>
            <option value="">Elige…</option>
            {candidatas.map((x) => <option key={x.id} value={x.id}>{x.carrier}</option>)}
          </select>
        </label>
        <label className="campo"><span>Tarifa all-in</span><input inputMode="decimal" value={f.tarifa} onChange={(e) => setF({ ...f, tarifa: e.target.value })} /></label>
        <label className="campo"><span>Moneda</span><select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}><option>USD</option><option>MXN</option></select></label>
        <label className="campo"><span>Vigente hasta</span><input type="date" value={f.vigencia} onChange={(e) => setF({ ...f, vigencia: e.target.value })} /></label>
        <label className="campo"><span>Capacidad semanal</span><input inputMode="numeric" value={f.capacidad} onChange={(e) => setF({ ...f, capacidad: e.target.value })} /></label>
        <label className="campo"><span>Tránsito (días)</span><input inputMode="numeric" value={f.transito} onChange={(e) => setF({ ...f, transito: e.target.value })} /></label>
        <label className="campo"><span>Llegó por</span>
          <select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value as typeof f.canal })}>
            <option value="email">Correo</option><option value="phone">Teléfono</option><option value="whatsapp">WhatsApp</option><option value="other">Otro</option>
          </select>
        </label>
      </div>
      <label className="campo"><span>Nota</span><input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></label>
      <div className="fila-botones">
        <Confirmar
          etiqueta="Guardar como nueva versión"
          deshabilitado={!valido}
          advertencia={<>{elegida?.carrier}: {dinero(tarifa, f.moneda)}{f.vigencia ? `, vigente hasta ${fecha(f.vigencia)}` : ", sin vigencia"}. Queda como una versión más; las anteriores no cambian. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={async () => {
            await accion(
              () =>
                s.api.capturarOferta({
                  eventId: d.evento.id,
                  participacionId: f.id,
                  tarifa,
                  moneda: f.moneda,
                  vigencia: f.vigencia || null,
                  capacidadSemanal: num(f.capacidad),
                  diasTransito: num(f.transito),
                  canal: f.canal,
                  notas: f.notas
                }),
              "Oferta capturada."
            );
            setF(vacio);
            setAbierto(false);
          }}
        />
        <button className="btn-texto" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </div>
  );
}

function PanelComparar({ d, ctx, accion }: Props) {
  const s = useSesion();
  // Con una sola ruta cerrada y sin primario, la mejor oferta llega ya elegida:
  // el formulario de adjudicar aparece sin buscarlo (se puede elegir otra).
  const [elegido, setElegido] = useState<string | null>(() => {
    const r = d.rutas.length === 1 ? d.rutas[0] : null;
    if (!r || d.evento.estado !== "cerrado" || ctx.rol !== "admin" || primario(r)) return null;
    const mejor = [...conOferta(r)].filter((x) => !x.rol).sort((a, b) => versionVigente(a)!.tarifaAllIn - versionVigente(b)!.tarifaAllIn)[0];
    return mejor?.id ?? null;
  });
  const [historial, setHistorial] = useState<string | null>(null);
  const [preguntaA, setPreguntaA] = useState<string | null>(null);
  const hayOfertas = d.rutas.some((r) => conOferta(r).length > 0);
  const abierto = d.evento.estado === "abierto";
  const pendientes = seguimiento(d, ctx.hoy).filter((x) => esperaRespuesta(x.estado)).length;

  return (
    <>
      {abierto && ctx.rol === "admin" && hayOfertas && (
        <div className="tarjeta accion-principal linea-cierre">
          <p className="fila-icono">
            <I.Candado size={16} />
            {pendientes
              ? `${plural(pendientes, "carrier")} sin ofertar todavía. Puedes esperar o cerrar ya para adjudicar.`
              : "Ya respondieron todos los invitados. Cierra a ofertas para adjudicar."}
          </p>
          <Confirmar
            etiqueta="Cerrar a ofertas"
            icono={<I.Candado size={15} />}
            clase={pendientes ? "btn-secundario" : "btn-primario"}
            advertencia={<>La liga de cada carrier dejará de aceptar ofertas en todas las rutas. Así el importe que adjudiques no cambia sin otra decisión. {ADVERTENCIA_REAL(s, d)}</>}
            onConfirmar={() => accion(() => s.api.cerrarAOfertas(d.evento.id), "Evento cerrado a ofertas.")}
          />
        </div>
      )}
      {d.evento.estado === "cerrado" && ctx.rol === "admin" && <AdjudicarEnLote d={d} ctx={ctx} accion={accion} />}
      {d.rutas.map((ruta, i) => {
        const filas = [...conOferta(ruta)].sort((a, b) => versionVigente(a)!.tarifaAllIn - versionVigente(b)!.tarifaAllIn);
        const sel = ruta.participaciones.find((x) => x.id === elegido) ?? null;
        const prim = primario(ruta);
        const respaldos = ruta.participaciones.filter((x) => x.rol === "respaldo");
        // Sin primario se elige primario; con primario y antes de entregar, respaldo.
        const puedeElegir = d.evento.estado === "cerrado" && ctx.rol === "admin" && !(prim && prim.entregadaEn);
        const totalRubros = new Set(ruta.participaciones.flatMap((x) => Object.keys(x.rubros))).size;
        const declinaron = ruta.participaciones.filter((p) => p.estado === "declino").map((p) => p.carrier);
        const tabla = (
          <div className="tarjeta">
            <div className="fila">
              <h2>Ruta {ruta.numero}{d.rutas.length > 1 ? ` · ${ruta.origen} → ${ruta.destino}` : ""}</h2>
              <span className="tenue">Objetivo {dinero(ruta.objetivo, ruta.moneda)}</span>
            </div>
            {i === 0 && hayOfertas && (
              <p className="descargas fila-botones sin-margen">
                <span className="tenue">Excel:</span>
                <button className="btn-chico" onClick={() => descargarComparativo(d, false)}><I.Carpeta size={14} />Interno</button>
                <button className="btn-chico" onClick={() => descargarComparativo(d, true)} title="Sin nombres de carrier, modelo comercial ni porcentajes"><I.Carpeta size={14} />Para el shipper (anónimo)</button>
              </p>
            )}
            {filas.length > 0 && (
              <div className="tabla-envoltura">
                <table className="tabla tabla-tarjetas">
                  <thead>
                    <tr>
                      {puedeElegir && <th aria-label="Elegir"></th>}
                      <th>Carrier</th>
                      <th>All-in</th>
                      <th>Venta al shipper</th>
                      <th>Cap./sem</th>
                      <th>Tránsito</th>
                      <th>Vigencia</th>
                      <th>{ruta.condiciones.length ? "Condiciones" : "Rubros"}</th>
                      <th aria-label="Preguntar" />
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((p) => (
                      <FilaOferta
                        key={p.id}
                        p={p}
                        ruta={ruta}
                        mejor={filas.length > 1 && p.id === filas[0].id}
                        totalRubros={totalRubros}
                        elegido={elegido === p.id}
                        columnaElegir={puedeElegir}
                        elegible={puedeElegir && !p.rol}
                        onElegir={() => setElegido(p.id)}
                        onHistorial={() => setHistorial(historial === p.id ? null : p.id)}
                        onPreguntar={ctx.rol !== "viewer" && p.correo && d.evento.estado !== "adjudicado" ? () => setPreguntaA(preguntaA === p.id ? null : p.id) : undefined}
                        preguntando={preguntaA === p.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!filas.length && <p className="tenue">Aún no llegan ofertas en esta ruta.</p>}
            {!abierto && !prim && !sel && filas.length > 0 && (
              <p className={puedeElegir ? "tenue ayuda" : "tenue"}>{puedeElegir ? "Elige la oferta a adjudicar como primario: sus candados y el motivo aparecen abajo." : ctx.rol !== "admin" ? "Solo el Administrador adjudica." : ""}</p>
            )}
            {declinaron.length > 0 && <p className="tenue">Declinaron: {declinaron.join(", ")}.</p>}
            <MatrizCondiciones ruta={ruta} carriers={filas} />
            {historial && ruta.participaciones.some((x) => x.id === historial) && <Historial p={ruta.participaciones.find((x) => x.id === historial)!} />}
            {preguntaA && ruta.participaciones.some((x) => x.id === preguntaA) && (
              <PreguntaCarrier d={d} ruta={ruta} p={ruta.participaciones.find((x) => x.id === preguntaA)!} onCerrar={() => setPreguntaA(null)} />
            )}
            {/* Lo que se decide va al pie de la misma tarjeta, pegado a la tabla. */}
            {!abierto && (prim || sel) && (
              <div className="pie-adjudicar">
                {prim ? (
                  <>
                    <PrimarioActual d={d} ruta={ruta} p={prim} ctx={ctx} accion={accion} />
                    {respaldos.map((r) => (
                      <Respaldo key={r.id} d={d} ruta={ruta} p={r} ctx={ctx} accion={accion} />
                    ))}
                    {sel && !sel.rol ? (
                      <FormAdjudicar key={sel.id} d={d} ruta={ruta} sel={sel} rol="respaldo" ctx={ctx} accion={accion} />
                    ) : (
                      puedeElegir && <p className="tenue ayuda">Opcional: elige otra oferta para adjudicarla como respaldo.</p>
                    )}
                  </>
                ) : (
                  sel && <FormAdjudicar key={sel.id} d={d} ruta={ruta} sel={sel} rol="primario" ctx={ctx} accion={accion} />
                )}
              </div>
            )}
            {!prim && <CapturaEquipo d={d} ruta={ruta} accion={accion} />}
            <LigasSimuladas d={d} ruta={ruta} />
          </div>
        );
        return <Fragment key={ruta.id}>{tabla}</Fragment>;
      })}
    </>
  );
}

// Varias rutas sin primario: la mejor oferta de cada una (la más barata que
// pasa sus candados) se adjudica con un solo motivo y una confirmación. Cada
// ruta se puede quitar del lote y adjudicarse a mano abajo.
function AdjudicarEnLote({ d, ctx, accion }: { d: Detalle; ctx: Contexto; accion: Props["accion"] }) {
  const s = useSesion();
  const m = useMotivo();
  const motivo = m.motivo;
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const propuesta = propuestaPrimarios(d, ctx);
  const elegibles = propuesta.filter((x) => x.p);
  if (propuesta.length < 2 || !elegibles.length) return null;
  const lote = elegibles.filter((x) => !fuera.has(x.ruta.id));
  const alternar = (id: string) => setFuera((f) => {
    const n = new Set(f);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <div className="tarjeta">
      <h2>Adjudicar la mejor oferta de cada ruta</h2>
      <p className="tenue ayuda">La más barata de cada ruta que pasa todos sus candados. Quita las que quieras decidir a mano abajo.</p>
      <div className="tabla-envoltura">
        <table className="tabla tabla-tarjetas">
          <thead>
            <tr><th aria-label="Incluir"></th><th>Ruta</th><th>Carrier</th><th>All-in</th><th>Contra objetivo</th></tr>
          </thead>
          <tbody>
            {propuesta.map((x) => {
              const v = x.p ? versionVigente(x.p) : null;
              const dif = v && x.ruta.objetivo ? v.tarifaAllIn - x.ruta.objetivo : null;
              return (
                <tr key={x.ruta.id}>
                  <td>{x.p && <input type="checkbox" aria-label={`Incluir la ruta ${x.ruta.numero}`} checked={!fuera.has(x.ruta.id)} onChange={() => alternar(x.ruta.id)} />}</td>
                  <td data-etiqueta="Ruta">{x.ruta.numero} · {x.ruta.origen} → {x.ruta.destino}</td>
                  <td data-etiqueta="Carrier">{x.p ? <b>{x.p.carrier}</b> : <span className="tenue">A mano: {x.motivo}</span>}</td>
                  <td data-etiqueta="All-in" className="mono">{v ? dinero(v.tarifaAllIn, v.moneda) : "—"}</td>
                  <td data-etiqueta="Contra objetivo" className={dif !== null && dif > 0 ? "alerta" : ""}>
                    {dif === null ? "—" : dif === 0 ? "igual" : `${dif > 0 ? "+" : "−"}${dinero(Math.abs(dif), v!.moneda)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Motivo opciones={MOTIVOS_LOTE} m={m} etiqueta="Motivo para todas" placeholder="Ej.: mejor all-in de cada ruta con candados en orden" />
      <Confirmar
        etiqueta={`Adjudicar ${plural(lote.length, "ruta")} como primario`}
        deshabilitado={!lote.length || !motivo}
        advertencia={<>Se adjudican {lote.map((x) => `ruta ${x.ruta.numero} a ${x.p!.carrier}`).join(", ")}. No se envía nada al carrier; el aviso se desbloquea con el recibo de Rateware. {ADVERTENCIA_REAL(s, d)}</>}
        onConfirmar={() =>
          accion(async () => {
            let hechas = 0;
            for (const x of lote) {
              const v = versionVigente(x.p!)!;
              try {
                await s.api.adjudicar({
                  eventId: d.evento.id,
                  participacionId: x.p!.id,
                  rol: "primario",
                  motivo,
                  operationId: operacionAdjudicacion(d.evento.id, x.p!.id, "primario", v.huella),
                  confirmaSinVigencia: false
                });
              } catch (e) {
                throw new Error(`${hechas} de ${lote.length} rutas adjudicadas. Se detuvo en la ruta ${x.ruta.numero}: ${e instanceof Error ? e.message : String(e)}`);
              }
              hechas += 1;
            }
            return hechas;
          }, (n) => `${plural(n, "ruta adjudicada", "rutas adjudicadas")} como primario.`)
        }
      />
    </div>
  );
}

function ResumenCondiciones({ ruta, p }: { ruta: Ruta; p: Participacion }) {
  const r = revisarCondiciones(ruta, p);
  if (r.bloquean.length) return <span className="error-texto" title={r.bloquean.join(", ")}>Bloquea {r.bloquean.length}</span>;
  return <span title={r.marcadas.join(", ")}>{r.cumplidas}/{r.total}{r.marcadas.length ? ` · ${r.marcadas.length} con nota` : ""}</span>;
}

// Motivos de un clic: un chip basta; el detalle es opcional.
const MOTIVOS_PRIMARIO = ["Mejor all-in con candados en orden", "Mejor capacidad semanal", "Mejor tránsito", "Desempeño previo con Marksman"];
const MOTIVOS_RESPALDO = ["Siguiente mejor all-in, como respaldo", "Capacidad adicional para la ruta"];
const MOTIVOS_LOTE = ["Mejor all-in de cada ruta con candados en orden"];
// Un chip ya es el motivo; el texto libre se abre con «Agregar detalle» y se
// suma al chip (o vale solo, si no se eligió ninguno).
function useMotivo() {
  const [chip, setChip] = useState("");
  const [detalle, setDetalle] = useState("");
  const [conDetalle, setConDetalle] = useState(false);
  const motivo = [chip, detalle.trim()].filter(Boolean).join(" · ");
  return { chip, setChip, detalle, setDetalle, conDetalle, setConDetalle, motivo };
}

function Motivo({ opciones, m, etiqueta = "Motivo", placeholder }: { opciones: string[]; m: ReturnType<typeof useMotivo>; etiqueta?: string; placeholder?: string }) {
  return (
    <div className="campo">
      <span>{etiqueta}</span>
      <span className="fila-botones sin-margen motivos">
        {opciones.map((o) => (
          <button key={o} type="button" className={`btn-chico ${m.chip === o ? "activo" : ""}`} aria-pressed={m.chip === o} onClick={() => m.setChip(m.chip === o ? "" : o)}>
            {o}
          </button>
        ))}
        {!m.conDetalle && <button type="button" className="btn-texto" onClick={() => m.setConDetalle(true)}>Agregar detalle</button>}
      </span>
      {m.conDetalle && <textarea value={m.detalle} onChange={(e) => m.setDetalle(e.target.value)} rows={2} autoFocus placeholder={placeholder} aria-label="Detalle del motivo" />}
    </div>
  );
}

function FilaOferta({ p, ruta, mejor = false, totalRubros, elegido, columnaElegir, elegible, onElegir, onHistorial, onPreguntar, preguntando = false }: { p: Participacion; ruta: Ruta; mejor?: boolean; totalRubros: number; elegido: boolean; columnaElegir: boolean; elegible: boolean; onElegir: () => void; onHistorial: () => void; onPreguntar?: () => void; preguntando?: boolean }) {
  const v = versionVigente(p)!;
  const rubros = Object.values(p.rubros);
  const negativa = rubros.includes("no_puedo");
  const deAcuerdo = rubros.filter((x) => x === "de_acuerdo").length;
  const anterior = p.versiones.find((x) => x.numero === v.numero - 1);
  const venta = tarifaVenta(v);
  // Contra el objetivo de la ruta: lo que orienta de un vistazo.
  const contraObjetivo = ruta.objetivo ? Math.round(((v.tarifaAllIn - ruta.objetivo) / ruta.objetivo) * 100) : null;
  return (
    <tr className={`${elegido ? "elegida" : ""} ${mejor ? "mejor" : ""}`} onClick={elegible ? onElegir : undefined} style={elegible ? { cursor: "pointer" } : undefined}>
      {columnaElegir && <td>{elegible && <input type="radio" name={`oferta-${ruta.id}`} aria-label={`Elegir ${p.carrier}`} checked={elegido} onChange={onElegir} />}</td>}
      <td>
        <b>{p.carrier}</b>
        {mejor && <span className="pill ok-pill con-icono"><I.Check size={12} />mejor</span>}
        {p.rol && <span className="pill ok-pill">{p.rol}</span>}
        <div className="acciones-fila">
          <button className="btn-texto" onClick={(e) => { e.stopPropagation(); onHistorial(); }} title="Historial de versiones">
            v{v.numero}{anterior ? ` · antes ${anterior.tarifaAllIn.toLocaleString("es-MX")}` : ""}
          </button>
        </div>
      </td>
      <td data-etiqueta="All-in">
        <span className="cifra">{dinero(v.tarifaAllIn, v.moneda)}</span>
        {contraObjetivo !== null && <span className={`delta ${contraObjetivo <= 0 ? "bajo" : "sobre"}`} title="Contra el objetivo de la ruta">{contraObjetivo > 0 ? "+" : contraObjetivo < 0 ? "−" : "±"}{Math.abs(contraObjetivo)} %</span>}
        <div className="tenue" title={describirModelo(v)}>{modeloCorto(v)}</div>
      </td>
      <td data-etiqueta="Venta">
        <span className="cifra">{dinero(venta.venta, v.moneda)}</span>
        {venta.porDefecto && <div className="tenue">% por defecto</div>}
      </td>
      <td data-etiqueta="Cap./sem">{v.capacidadSemanal ?? "—"}</td>
      <td data-etiqueta="Tránsito">{v.transitoDias !== null ? `${v.transitoDias} d` : "—"}</td>
      <td data-etiqueta="Vigencia">{v.vigenteHasta ? fecha(v.vigenteHasta) : <span className="alerta">Sin vigencia</span>}</td>
      <td data-etiqueta={ruta.condiciones.length ? "Condiciones" : "Rubros"}>{ruta.condiciones.length ? <ResumenCondiciones ruta={ruta} p={p} /> : negativa ? <span className="error-texto">No puedo</span> : totalRubros ? `${deAcuerdo}/${totalRubros}` : "—"}</td>
      <td className="celda-accion">
        {onPreguntar && (
          <button className="btn-icono" aria-expanded={preguntando} aria-label={`Preguntar a ${p.carrier}`} title={`Preguntar a ${p.carrier}`} onClick={(e) => { e.stopPropagation(); onPreguntar(); }}><I.Chat size={16} /></button>
        )}
      </td>
    </tr>
  );
}

function descargarComparativo(d: Detalle, anonimo: boolean) {
  const datos = crearXlsx([hojaComparativo(d, anonimo)]);
  const url = URL.createObjectURL(new Blob([datos], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo(d, anonimo);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// La pregunta se abre como borrador en Gmail, en el hilo de la invitación.
function PreguntaCarrier({ d, ruta, p, onCerrar }: { d: Detalle; ruta: Ruta; p: Participacion; onCerrar: () => void }) {
  const [texto, setTexto] = useState("");
  const r = preguntaAlCarrier(d, ruta, p, texto);
  return (
    <div className="aviso-caja">
      <h3>Preguntar a {p.carrier}</h3>
      <label className="campo">
        <span>Pregunta</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Por ejemplo: ¿el all-in incluye el cruce?" />
      </label>
      {texto.trim() && (
        <>
          <p className="tenue">Para: {r.para} · {r.asunto}</p>
          <p className="texto-aviso">{r.cuerpo}</p>
        </>
      )}
      <p className="tenue ayuda">Fr8Bid no envía la pregunta: «Abrir en Gmail» crea el borrador en tu cuenta y tú decides si lo envías.</p>
      <div className="fila-botones">
        {texto.trim() ? (
          <a className="btn-secundario" href={r.gmail} target="_blank" rel="noreferrer">Abrir en Gmail</a>
        ) : (
          <button className="btn-secundario" disabled>Abrir en Gmail</button>
        )}
        <button className="btn-texto" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  );
}

function Historial({ p }: { p: Participacion }) {
  return (
    <div className="historial">
      <h3>Historial de la oferta · {p.carrier}</h3>
      <ol>
        {p.versiones.map((v) => {
          const anterior = p.versiones.find((x) => x.numero === v.numero - 1);
          const cambios = anterior ? cambiosComerciales(anterior, v) : [];
          return (
            <li key={v.numero}>
              v{v.numero} · {dinero(v.tarifaAllIn, v.moneda)} · {describirModelo(v)} · {v.fuente === "portal_carrier" ? "portal del carrier" : "captura del equipo"} · {fecha(v.creadaEn)}
              {v.esFinal && " · oferta final"}
              {v.nota && <> · nota: «{v.nota}»</>} <span className="mono tenue">#{v.huella.slice(0, 8)}</span>
              {cambios.length > 0 && <div className="tenue">Cambió: {cambios.join("; ")}</div>}
            </li>
          );
        })}
      </ol>
      {p.versiones.length === 1 && <p className="nota">Con Rateware real solo llega la versión vigente: Rateware no expone el historial por acción (contrato C2 pendiente).</p>}
    </div>
  );
}

function FormAdjudicar({ d, ruta, sel, rol, ctx, accion }: { d: Detalle; ruta: Ruta; sel: Participacion; rol: "primario" | "respaldo"; ctx: Contexto; accion: Props["accion"] }) {
  const s = useSesion();
  const m = useMotivo();
  const motivo = m.motivo;
  const [confirmaVigencia, setConfirmaVigencia] = useState(false);
  const candados = candadosAdjudicacion(d, ruta, sel, ctx, rol);
  const v = versionVigente(sel);
  return (
    <div className={rol === "respaldo" ? "aviso-caja" : ""}>
      <h3>Adjudicar {rol}</h3>
      <p>
        <b>{sel.carrier}</b> · {dinero(v?.tarifaAllIn, v?.moneda)} all-in · v{v?.numero}
      </p>
      {v && <p className="tenue ayuda">{describirModelo(v)}. Se adjudica el all-in; el porcentaje no lo modifica.</p>}
      {rol === "respaldo" && <p className="tenue">El respaldo cubre la ruta si el primario no tiene capacidad. Se entrega a Rateware junto con el primario.</p>}
      <Candados lista={candados} />
      {candados.some((c) => c.confirmable) && (
        <label className="check">
          <input type="checkbox" checked={confirmaVigencia} onChange={(e) => setConfirmaVigencia(e.target.checked)} />
          Confirmo adjudicar una oferta sin vigencia declarada (D4)
        </label>
      )}
      <Motivo opciones={rol === "primario" ? MOTIVOS_PRIMARIO : MOTIVOS_RESPALDO} m={m} />
      <Confirmar
        etiqueta={`Adjudicar como ${rol}`}
        deshabilitado={!puedeAdjudicar(candados, confirmaVigencia) || !motivo}
        advertencia={<>No se envía nada al carrier. El aviso se desbloquea cuando Rateware entregue el recibo. {ADVERTENCIA_REAL(s, d)}</>}
        onConfirmar={() =>
          accion(
            () =>
              s.api.adjudicar({
                eventId: d.evento.id,
                participacionId: sel.id,
                rol,
                motivo,
                operationId: operacionAdjudicacion(d.evento.id, sel.id, rol, v!.huella),
                confirmaSinVigencia: confirmaVigencia
              }),
            `${sel.carrier} adjudicado como ${rol}.`
          )
        }
      />
    </div>
  );
}

function Respaldo({ d, ruta, p, ctx, accion }: { d: Detalle; ruta: Ruta; p: Participacion; ctx: Contexto; accion: Props["accion"] }) {
  const s = useSesion();
  return (
    <div className="aviso-caja">
      <h3>Respaldo de la ruta {ruta.numero}</h3>
      <p>
        <b>{p.carrier}</b> · {p.adjudicada ? <>v{p.adjudicada.numero} · {dinero(p.versiones.find((v) => v.numero === p.adjudicada?.numero)?.tarifaAllIn, ruta.moneda)}</> : "Versión adjudicada por revisar"}
      </p>
      <p className="tenue">Motivo: {p.motivo}</p>
      {!p.entregadaEn && ctx.rol === "admin" && (
        <Confirmar
          etiqueta="Anular respaldo"
          clase="btn-texto"
          advertencia={<>Solo antes de entregar. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() => accion(() => s.api.quitarAdjudicacion(p.id), "Respaldo anulado.")}
        />
      )}
    </div>
  );
}

function PrimarioActual({ d, ruta, p, ctx, accion }: { d: Detalle; ruta: Ruta; p: Participacion; ctx: Contexto; accion: Props["accion"] }) {
  const s = useSesion();
  const reciente = versionMasReciente(p);
  return (
    <>
      <h3>Primario de la ruta {ruta.numero}</h3>
      <p>
        <b>{p.carrier}</b> · {p.adjudicada ? <>v{p.adjudicada.numero} · {dinero(p.versiones.find((v) => v.numero === p.adjudicada?.numero)?.tarifaAllIn, ruta.moneda)}</> : "Versión adjudicada por revisar"}
      </p>
      <p className="tenue">Motivo: {p.motivo} · {p.adjudicada?.por} · {fecha(p.adjudicada?.en)}</p>
      {!p.adjudicada && <div className="estado estado-error" role="alert">Revisa la adjudicación y las fechas de sus ofertas. No se puede identificar la versión adjudicada con certeza.</div>}
      {reciente && (
        <div className="estado estado-viejo">
          Hay una versión más reciente (v{reciente.numero}, {dinero(reciente.tarifaAllIn, reciente.moneda)}). La adjudicación sigue en v{p.adjudicada?.numero}; cambiarla exige anular y adjudicar de nuevo.
        </div>
      )}
      {!p.entregadaEn && ctx.rol === "admin" && ruta.participaciones.some((x) => x.rol === "respaldo") && (
        <p className="tenue">Para anular el primario, anula primero su respaldo.</p>
      )}
      {!p.entregadaEn && ctx.rol === "admin" && !ruta.participaciones.some((x) => x.rol === "respaldo") && (
        <Confirmar
          etiqueta="Anular adjudicación"
          clase="btn-texto"
          advertencia={<>Solo antes de entregar. En Rateware esta acción no es transaccional (C3). {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() => accion(() => s.api.quitarAdjudicacion(p.id), "Adjudicación anulada.")}
        />
      )}
    </>
  );
}

function PanelEntrega({ d, ctx, accion, entrega, setEntrega, recibo, setRecibo }: Props) {
  const s = useSesion();
  const r = recorrido(d, ctx);
  const decidido = r.pasos[7].estado === "hecho";
  const prims = d.rutas.map(primario).filter(Boolean) as Participacion[];
  // Un respaldo abierto y sin adjudicar se perdería al entregar: se dice antes.
  const [respaldoAbierto, setRespaldoAbierto] = useState<string | null>(null);
  const respaldoPendiente = respaldoAbierto ? d.rutas.flatMap((x) => x.participaciones).find((x) => x.id === respaldoAbierto && !x.rol) : undefined;
  const confirmar = (op: string) =>
    accion(async () => {
      setEntrega({ estado: "enviada", operationId: op, error: null });
      const res = await s.api.confirmarEntrega(d.evento.id, op);
      setEntrega(res.entrega);
      if (res.recibo) setRecibo(res.recibo);
      if (res.entrega.estado !== "confirmada") throw new Error(res.entrega.error || "La entrega no se confirmó.");
    }, "Recibo de Rateware confirmado.");

  const [verTraza, setVerTraza] = useState(false);
  const candadosEntrega = [
    { regla: "I4", ok: decidido, texto: decidido ? "Todas las rutas decididas" : "Faltan rutas por decidir" },
    { regla: "I2", ok: d.rutas.flatMap((ruta) => ruta.participaciones).filter((p) => p.rol).every((p) => p.adjudicada && !versionMasReciente(p)), texto: d.rutas.some((ruta) => ruta.participaciones.some((p) => p.rol && !p.adjudicada)) ? "Revisa la adjudicación: versión no identificada" : "Lo adjudicado es la versión vigente" },
    { regla: "I5", ok: entrega.estado !== "incierta", texto: entrega.estado === "incierta" ? "Incierta: concilia con la misma operación" : "Sin entregas inciertas" },
    { regla: "rol", ok: ctx.rol === "admin", texto: ctx.rol === "admin" ? "Tu rol: Administrador" : "Solo el Administrador entrega" }
  ];
  return (
    <>
      <div className="tarjeta">
        <div className="fila">
          <h2>Entrega a Rateware</h2>
          <span className="pill">{r.entregaConfirmada ? "confirmada" : entrega.estado.replace("_", " ")}</span>
        </div>
        {d.rutas.map((ruta) => {
          const p = primario(ruta);
          const resp = ruta.participaciones.filter((x) => x.rol === "respaldo");
          const monto = (x: Participacion) => dinero(x.versiones.find((v) => v.numero === x.adjudicada?.numero)?.tarifaAllIn, ruta.moneda);
          return (
            <p key={ruta.id}>
              Ruta {ruta.numero} · {ruta.origen} → {ruta.destino}:{" "}
              {p ? <><b>{p.carrier}</b> {p.adjudicada ? <>{monto(p)} (v{p.adjudicada.numero})</> : "Versión adjudicada por revisar"}</> : <span className="tenue">{ruta.desiertaMotivo ? "desierta" : "sin primario"}</span>}
              {resp.map((x) => <span key={x.id} className="tenue"> · respaldo {x.carrier} {monto(x)}</span>)}
            </p>
          );
        })}
        {(entrega.operationId || recibo) && (
          <p className="tenue">
            Operación <span className="mono">{(recibo?.operationId ?? entrega.operationId)?.slice(0, 8)}…</span> · la misma en cada reintento
          </p>
        )}
        {recibo && (
          <p>
            Recibo {fecha(recibo.momento)} · {plural(recibo.insertados, "tarifa insertada", "tarifas insertadas")} · {recibo.enRevision} en Revisión
            {recibo.conservadosAprobados > 0 && <> · {plural(recibo.conservadosAprobados, "conservada como aprobada", "conservadas como aprobadas")}</>}
          </p>
        )}
        {r.entregaConfirmada && !recibo && <p>Rateware ya tiene esta entrega (evento entregado y primarios con cierre registrado).</p>}
        {r.entregaConfirmada && <p className="nota">La tarifa queda en Revisión de Rateware. Fr8Bid no la aprueba (I6).</p>}
        {entrega.error && entrega.estado !== "confirmada" && <div className="estado estado-error">{entrega.error}</div>}

        {!r.entregaConfirmada && decidido && ctx.rol === "admin" && (entrega.estado === "sin_preparar" || entrega.estado === "rechazada") && (
          <OfrecerRespaldo d={d} ctx={ctx} accion={accion} abierta={respaldoAbierto} setAbierta={setRespaldoAbierto} />
        )}
        {!r.entregaConfirmada && <Candados lista={candadosEntrega} />}
        {!r.entregaConfirmada && decidido && ctx.rol === "admin" && (
          <div className="fila-botones">
            {entrega.estado === "sin_preparar" || entrega.estado === "rechazada" ? (
              <Confirmar
                etiqueta="Entregar a Rateware"
                advertencia={
                  <>
                    {respaldoPendiente && <b>Abriste el respaldo de {respaldoPendiente.carrier} y no lo adjudicaste: si entregas ahora, va sin ese respaldo y ya no se puede agregar. </b>}
                    Rateware guarda {plural(prims.length, "tarifa")} en Revisión (pending_review) y devuelve el recibo. {ADVERTENCIA_REAL(s, d)}
                  </>
                }
                onConfirmar={() => {
                  // Comprobación local (versión adjudicada = vigente) y, si pasa, la entrega.
                  const preparada = s.api.prepararEntrega(d);
                  setEntrega(preparada);
                  if (preparada.estado === "preparada") return confirmar(preparada.operationId!);
                }}
              />
            ) : entrega.estado === "incierta" ? (
              <Confirmar etiqueta="Reintentar con la misma operación" advertencia={<>Mismo operation_id: si Rateware ya la guardó, devuelve el recibo original. {ADVERTENCIA_REAL(s, d)}</>} onConfirmar={() => confirmar(entrega.operationId!)} />
            ) : entrega.estado === "preparada" ? (
              <Confirmar etiqueta="Confirmar entrega a Rateware" advertencia={ADVERTENCIA_REAL(s, d)} onConfirmar={() => confirmar(entrega.operationId!)} />
            ) : null}
          </div>
        )}
        {!decidido && <p className="tenue">Primero adjudica todas las rutas.</p>}
        {!r.entregaConfirmada && decidido && <p className="nota">Nunca hay reintento automático.</p>}
        {/* Loads y la trazabilidad se pliegan aquí: Fr8Bid no consulta a Loads, lo infiere del recibo. */}
        {r.entregaConfirmada && (
          <div className="pie-entrega">
            <p className="fila-icono">
              <I.Check size={16} className="ok-icono" />
              <span>
                <b>Visible en Loads</b> <span className="tenue">· inferido del recibo; Fr8Bid no consulta a Loads</span>{" "}
                <button className="btn-texto" onClick={() => setVerTraza(!verTraza)}>{verTraza ? "Ocultar trazabilidad" : "Ver trazabilidad"}</button>
              </span>
            </p>
            {verTraza && (
              <>
                {prims.map((p) => {
                  const proy = proyeccionLoads(d, p.id);
                  return proy ? (
                    <details key={p.id}>
                      <summary className="tenue">Datos que Loads puede mostrar de {p.carrier}</summary>
                      <pre className="mono codigo">{JSON.stringify(proy, null, 2)}</pre>
                    </details>
                  ) : null;
                })}
                <Cadena d={d} recibo={recibo} entrega={entrega} incrustada />
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// Antes de entregar: rutas con primario, sin respaldo y con otra oferta
// vigente. Se ofrece la siguiente mejor (por all-in) como respaldo; es opcional.
function OfrecerRespaldo({ d, ctx, accion, abierta, setAbierta }: { d: Detalle; ctx: Contexto; accion: Props["accion"]; abierta: string | null; setAbierta: (id: string | null) => void }) {
  if (d.evento.estado !== "cerrado") return null;
  const candidatas = d.rutas.flatMap((ruta) => {
    const prim = primario(ruta);
    if (!prim || ruta.participaciones.some((x) => x.rol === "respaldo")) return [];
    const otra = [...conOferta(ruta)]
      .filter((p) => !p.rol && p.carrierId !== prim.carrierId)
      .sort((a, b) => versionVigente(a)!.tarifaAllIn - versionVigente(b)!.tarifaAllIn)[0];
    return otra ? [{ ruta, p: otra }] : [];
  });
  if (!candidatas.length) return null;
  return (
    <div className="aviso-caja">
      <p><b>¿Adjudicar respaldo?</b> Es opcional, pero después de entregar ya no se puede agregar. Si no lo quieres, entrega sin respaldo.</p>
      {candidatas.map(({ ruta, p }) => (
        <div key={ruta.id}>
          <p>
            Ruta {ruta.numero}: siguiente mejor oferta <b>{p.carrier}</b> · {dinero(versionVigente(p)!.tarifaAllIn, versionVigente(p)!.moneda)}{" "}
            <button className="btn-texto" onClick={() => setAbierta(abierta === p.id ? null : p.id)}>{abierta === p.id ? "Ocultar" : "Adjudicar como respaldo"}</button>
          </p>
          {abierta === p.id && <FormAdjudicar d={d} ruta={ruta} sel={p} rol="respaldo" ctx={ctx} accion={accion} />}
        </div>
      ))}
    </div>
  );
}

function PanelAviso({ d, ctx, accion }: Props) {
  const s = useSesion();
  const r = recorrido(d, ctx);
  const prims = d.rutas.map(primario).filter(Boolean) as Participacion[];
  const faltan = prims.filter((p) => !avisoDe(d, p.id, "adjudicacion"));
  const principales = [...new Map(prims.map((p) => {
    const a = avisoDe(d, p.id, "adjudicacion");
    return [a?.id ?? p.id, { p, a }] as const;
  })).values()].filter((x) => x.a);
  const idsPrincipales = new Set(principales.map(({ a }) => a!.id));
  const otros = d.avisos.filter((a) => a.tipo === "adjudicacion" && a.resultado !== "adjudicado" && !idsPrincipales.has(a.id));
  // Con el botón general, el de cada aviso solo sale si lo abres a propósito o tiene algo pendiente.
  const general = ctx.rol === "admin" && avisosListos(d, ctx).length >= 2;
  return (
    <div className="tarjeta">
      <h2 className="fila-icono"><I.Megafono size={17} />Aviso de adjudicación</h2>
      {!r.entregaConfirmada && <p className="tenue fila-icono"><I.Candado size={15} />Requiere el recibo de Rateware (I8). El carrier no se entera de algo que Rateware no tiene.</p>}
      {r.entregaConfirmada && faltan.length > 0 && ctx.rol === "admin" && (
        <Confirmar
          etiqueta="Preparar los avisos"
          icono={<I.Sobre size={15} />}
          clase="btn-primario"
          advertencia={<>Rateware prepara un borrador por carrier que participó (adjudicado o no). No envía nada. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() => accion(() => s.api.generarAvisosAdjudicacion(d.evento.id), "Avisos preparados. Revisa cada texto y apruébalo aquí.")}
        />
      )}
      <AprobarTodos d={d} ctx={ctx} accion={accion} />
      {d.avisos.some((a) => a.tipo === "adjudicacion") && (
        <p className="nota">Textos de Rateware (en inglés en Rateware real; se editan en su Cola). Salen por Gmail desde sales@heymarksman.com.</p>
      )}
      {principales.map(({ p, a }) => {
        return a ? <TarjetaAviso key={a.id} d={d} a={a} titulo={p.carrier} tipo="adjudicado" abierto general={general} ctx={ctx} accion={accion} /> : null;
      })}
      {otros.length > 0 && (
        <>
          {otros.map((a) => (
            <TarjetaAviso
              key={a.id}
              d={d}
              a={a}
              titulo={d.rutas.flatMap((r) => r.participaciones).find((x) => x.id === a.participacionId)?.carrier ?? a.destinatario}
              tipo={a.resultado === "respaldo" ? "respaldo" : "no adjudicado"}
              general={general}
              ctx={ctx}
              accion={accion}
            />
          ))}
        </>
      )}
    </div>
  );
}

// Todos los avisos listos (adjudicado, respaldo y no adjudicados) con una sola
// confirmación, en tandas y con la versión exacta de cada uno. Los que tienen un
// candado pendiente se quedan para aprobarse uno por uno.
const avisosListos = (d: Detalle, ctx: Contexto) =>
  d.avisos.filter((a) => a.tipo === "adjudicacion" && (a.estado === "borrador" || a.estado === "fallido" || a.estado === "en_cola") && candadosAviso(d, a, ctx).every((c) => c.ok));

function AprobarTodos({ d, ctx, accion }: { d: Detalle; ctx: Contexto; accion: Props["accion"] }) {
  const s = useSesion();
  const [avance, setAvance] = useState<AvanceEnvio | null>(null);
  if (ctx.rol !== "admin") return null;
  const listos = avisosListos(d, ctx);
  if (listos.length < 2) return null;
  const tandas = planearTandas(listos).length;
  return (
    <div className="bloque-envio">
      <p className="fila-icono"><I.Sobre size={16} /><span><b>{plural(listos.length, "aviso listo", "avisos listos")}</b> <span className="tenue">· revisa los textos abajo antes de aprobar</span></span></p>
      {avance && (
        <p className={avance.detenido ? "estado estado-error" : "tenue"}>
          Tanda {avance.hechas} de {avance.tandas}: {avance.enviados} aceptado(s) por Gmail{avance.enCola ? `, ${avance.enCola} en cola` : ""}. {avance.detenido ?? ""}
        </p>
      )}
      <Confirmar
        etiqueta={`Aprobar y enviar los ${listos.length} avisos`}
        icono={<I.Enviar size={15} />}
        advertencia={
          <>
            Se envían por Gmail exactamente los textos que ves abajo{tandas > 1 ? `, en ${tandas} tandas de hasta ${TAMANO_TANDA}` : ""}. Si alguien cambió uno en la Cola, Rateware lo rechaza y lo vuelves a revisar. {ADVERTENCIA_REAL(s, d)}
          </>
        }
        onConfirmar={() =>
          accion(
            async () => {
              const r = await s.api.enviarPorTandas(d.evento.id, listos, { alAvanzar: setAvance });
              setAvance(r);
              if (r.detenido) throw new Error(`${r.enviados} de ${listos.length} aceptados por Gmail. ${r.detenido}`);
              return r;
            },
            (r) => `${plural(r.enviados, "aviso aceptado", "avisos aceptados")} por Gmail.`
          )
        }
      />
    </div>
  );
}

// Un aviso con su texto exacto, candados y el botón de enviar esa versión.
// Un renglón por aviso: quién, qué resultado y en qué va. El texto exacto se
// abre con el ojo (el del adjudicado ya abierto) y se envía desde ahí.
function TarjetaAviso({ d, a, titulo, tipo, abierto = false, general = false, ctx, accion }: { d: Detalle; a: Aviso; titulo: string; tipo: "adjudicado" | "respaldo" | "no adjudicado"; abierto?: boolean; general?: boolean; ctx: Contexto; accion: Props["accion"] }) {
  const s = useSesion();
  const [ver, setVer] = useState(abierto);
  const [aProposito, setAProposito] = useState(false);
  const candados = candadosAviso(d, a, ctx);
  const enviable = ctx.rol === "admin" && (a.estado === "borrador" || a.estado === "fallido" || a.estado === "en_cola");
  const pendiente = !candados.every((c) => c.ok) || a.estado === "fallido" || a.estado === "en_cola";
  // Sin botón general, cada aviso trae el suyo; con él, solo si lo abriste tú o tiene algo pendiente.
  const conBoton = enviable && (!general ? ver || pendiente : aProposito || pendiente);
  const tono = a.estado === "aceptado" ? "ok" : a.estado === "rebotado" || a.estado === "fallido" ? "err" : a.estado === "en_cola" || a.estado === "por_verificar" ? "warn" : "";
  return (
    <div className={`renglon-aviso ${ver ? "abierto" : ""}`}>
      <div className="fila">
        <span className="fila-icono">
          {tipo === "adjudicado" ? <I.Check size={16} className="ok-icono" /> : tipo === "respaldo" ? <I.Reloj size={16} /> : <I.Salir size={16} />}
          <b>{titulo}</b>
          <span className={`pill ${tipo === "adjudicado" ? "ok" : ""}`}>{tipo}</span>
        </span>
        <span className="fila-botones sin-margen">
          <span className={`pill ${tono}`}>{a.estado === "por_verificar" ? "aprobación no verificada" : ESTADO_INVITACION[a.estado] ?? a.estado}</span>
          <button className="btn-icono" aria-expanded={ver} aria-label={ver ? "Ocultar texto" : "Ver texto"} title={ver ? "Ocultar texto" : "Ver texto"} onClick={() => { setVer(!ver); setAProposito(!ver); }}><I.Ojo size={16} /></button>
        </span>
      </div>
      {ver && (
        <div className="cuerpo-aviso">
          <p className="tenue">Para: {a.destinatario} · versión {fecha(a.version)}</p>
          <p><b>{a.asunto}</b></p>
          <p className="texto-aviso">{a.cuerpo}</p>
        </div>
      )}
      {a.reciboProveedor && <p className="tenue">{a.estado === "aceptado" ? "Gmail aceptó el mensaje" : "Referencia del proveedor"} · id {a.reciboProveedor}</p>}
      {conBoton && <Candados lista={candados} />}
      {conBoton && (
        <Confirmar
          etiqueta="Aprobar este texto y enviar"
          clase="btn-secundario"
          icono={<I.Enviar size={15} />}
          deshabilitado={!candados.every((c) => c.ok)}
          advertencia={<>Se envía por Gmail a {a.destinatario} exactamente esta versión. Si alguien la cambia en la Cola antes, Rateware la rechaza y la vuelves a revisar. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() => accion(() => s.api.enviarAvisos(d.evento.id, [a]), "Aviso aceptado por Gmail.")}
        />
      )}
    </div>
  );
}

function Cadena({ d, recibo, entrega, incrustada = false }: { d: Detalle; recibo: Recibo | null; entrega: EntregaLocal; incrustada?: boolean }) {
  const prims = d.rutas.map(primario).filter(Boolean) as Participacion[];
  return (
    <div className={incrustada ? "cadena" : "tarjeta cadena"}>
      <h3>Trazabilidad</h3>
      {prims.map((p) => {
        const a = avisoDe(d, p.id, "adjudicacion");
        const v = p.versiones.find((x) => x.numero === p.adjudicada?.numero);
        return (
          <ol key={p.id}>
            <li>necesidad → evento {d.evento.folio} → ruta</li>
            <li>oferta v{v?.numero} {p.carrier} · {dinero(v?.tarifaAllIn, v?.moneda)} · <span className="mono">#{v?.huella.slice(0, 8)}</span></li>
            <li>adjudicación · {p.motivo} · {p.adjudicada?.por}</li>
            <li>entrega · operación <span className="mono">{(recibo?.operationId ?? entrega.operationId ?? "").slice(0, 8) || "registrada en Rateware"}</span> · recibo {fecha(recibo?.momento ?? p.entregadaEn)}</li>
            <li>aviso · {a ? `${a.estado} · versión ${fecha(a.version)}` : "pendiente"}</li>
            <li>Loads · {p.entregadaEn ? "inferido del recibo (sin confirmación de Loads)" : "pendiente"}</li>
          </ol>
        );
      })}
    </div>
  );
}
