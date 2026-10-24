import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { candidatosRecordatorio, claveIntento, ETIQUETA_SEGUIMIENTO, intentosPorPreparar, intentosWhatsapp, preguntaAlCarrier, PROFUNDIDAD_MINIMA, recordatorio, rutasSinProfundidad, seguimiento, siguienteIntento, textoIntento, type EstadoSeguimiento } from "../dominio/seguimiento";
import { crearXlsx } from "../dominio/xlsx";
import type { CarrierFit } from "../dominio/carrierFit";
import type { Telefono } from "../dominio/telefonos";
import type { ContactosCarrier } from "../dominio/contactos";
import type { CorreoRevelado, PersonaApollo } from "../dominio/apollo";
import { NOMBRE_FAMILIA, type HistorialSegmento } from "../dominio/segmento";
import { planearTandas, TAMANO_TANDA } from "../dominio/tandas";
import type { Aviso, Detalle, EntregaLocal, Participacion, Recibo, Ruta } from "../dominio/tipos";
import { EditorCondiciones, ListaCondiciones, MatrizCondiciones } from "./condiciones";
import { aCarga, Confirmar, Desactualizado, dinero, EstadoVista, fecha, Liga, plural, Prueba, type Carga } from "./comun";
import { useSesion } from "./sesion";

const SIN_ENTREGA: EntregaLocal = { estado: "sin_preparar", operationId: null, error: null };

// Los 11 pasos se agrupan en seis etapas: cada etapa es una vista. Así cada
// clic en el riel cambia lo que se ve y no hay pasos que muestren lo mismo.
type ClaveEtapa = "evento" | "carriers" | "ofertas" | "entrega" | "aviso" | "loads";
const ETAPAS: { clave: ClaveEtapa; titulo: string; pasos: ClavePaso[] }[] = [
  { clave: "evento", titulo: "Necesidad y evento", pasos: ["necesidad", "evento"] },
  { clave: "carriers", titulo: "Carriers e invitación", pasos: ["carriers", "invitacion"] },
  { clave: "ofertas", titulo: "Ofertas y adjudicación", pasos: ["ofertas", "comparar", "cierre", "adjudicar"] },
  { clave: "entrega", titulo: "Entrega a Rateware", pasos: ["entrega"] },
  { clave: "aviso", titulo: "Aviso al carrier", pasos: ["aviso"] },
  { clave: "loads", titulo: "Visible en Loads", pasos: ["loads"] }
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

  const leer = useCallback(async () => {
    try {
      const datos = await s.api.detalle(id, recibo);
      setCarga({ tipo: "ok", datos, leidoEn: Date.now() });
    } catch (e) {
      setCarga(aCarga(e));
    }
  }, [s.api, id, recibo]);
  useEffect(() => {
    if (s.listo) leer();
  }, [s.listo, leer]);

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
  const etapaActual: ClaveEtapa = r.actual ? etapaDe(r.actual.clave) : "loads";
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
          <h1>{d.rutas.map((x) => `${x.origen} → ${x.destino}`).join(" · ") || d.evento.nombre}</h1>
          <p className="tenue">
            {[...new Set(d.rutas.map((x) => x.equipo))].join(", ")} · {plural(d.rutas.length, "ruta")} · {d.evento.shipper} · plazo {fecha(d.evento.cierre?.plazoOriginal ?? d.evento.plazo)}
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
                    <small>{e.foco.detalle}</small>
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
              <span>
                Siguiente: <b>{r.siguiente.accion}</b> · {r.siguiente.teToca ? "te toca a ti" : `le toca ${r.siguiente.quien === "Carriers" ? "a los carriers" : r.siguiente.quien === "Sistema" ? "a Loads" : `al ${r.siguiente.quien}`}`}
              </span>
            ) : (
              <span>✓ Recorrido completo</span>
            )}
            {actual !== etapaActual && r.actual && <button className="btn-texto" onClick={() => setVista(null)}>Ir al paso actual →</button>}
          </div>
          {verInvitacion && <PanelInvitacion {...p} />}
          {verInvitacion && <PanelCarrierFit {...p} />}
          {verInvitacion && <PanelHistorialSegmento {...p} />}
          {actual === "evento" && <PanelEvento {...p} />}
          {actual === "ofertas" && d.evento.estado === "abierto" && <PanelSeguimiento d={d} ctx={ctx} accion={accion} />}
          {actual === "ofertas" && <PanelComparar {...p} />}
          {actual === "entrega" && <PanelEntrega {...p} />}
          {actual === "aviso" && <PanelAviso {...p} />}
          {actual === "loads" && <PanelLoads d={d} />}
          {r.entregaConfirmada && (actual === "entrega" || actual === "loads") && <Cadena d={d} recibo={recibo} entrega={entrega} />}
          {s.modo === "rateware" && <MasDelEvento id={id} borrador={d.evento.estado === "borrador"} />}
        </div>
      </div>
    </section>
  );
}

// Las pantallas de Bidware del mismo evento, mientras se integran a la Mesa.
function MasDelEvento({ id, borrador }: { id: string; borrador: boolean }) {
  const ligas: [string, string][] = [
    ...(borrador ? ([[`/rfx/new/${id}`, "Editar el borrador"]] as [string, string][]) : []),
    [`/rfx/${id}/review`, "Revisión de contactos"],
    [`/rfx/${id}/message`, "Mensaje a carriers"],
    [`/rfx/${id}/delivery`, "Cola de envío"],
    [`/rfx/${id}/chat`, "Chat del Bid Room"],
    [`/rfx/${id}/detalle`, "Detalle completo"]
  ];
  return (
    <p className="mas-del-evento tenue">
      Más del evento:{" "}
      {ligas.map(([a, t], i) => (
        <span key={a}>
          {i > 0 && " · "}
          <Liga a={a}>{t}</Liga>
        </span>
      ))}
    </p>
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
function LigasSimuladas({ d }: { d: Detalle }) {
  const s = useSesion();
  if (!s.sim || d.evento.estado !== "abierto") return null;
  return (
    <div className="nota">
      Ligas de carrier (simulado):{" "}
      {d.rutas.flatMap((r) => r.participaciones).map((p) => (
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
  return (
    <div className="tarjeta">
      <h2>Necesidad y evento</h2>
      <p>
        {d.evento.nombre} · shipper {d.evento.shipper} ·{" "}
        {d.evento.cierre ? `cerrado a ofertas el ${fecha(d.evento.cierre.el)} (plazo original ${fecha(d.evento.cierre.plazoOriginal)})` : `plazo ${fecha(d.evento.plazo)}`}
      </p>
      {d.rutas.map((r) => (
        <div key={r.id} className="ruta-evento">
          <p>
            Ruta {r.numero}: {r.origen} → {r.destino} · {r.equipo} · {r.volumenSemanal ?? "—"}/sem · objetivo {dinero(r.objetivo, r.moneda)}
          </p>
          <ListaCondiciones condiciones={r.condiciones} />
          {editable && <EditorCondiciones d={d} ruta={r} accion={accion} />}
        </div>
      ))}
      <p className="nota">En la opción (a) la necesidad entra como evento directo en Rateware; el RFI del shipper llega después del MVP.</p>
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
  // Lo ya enviado se resume en una línea; el texto completo solo importa en lo
  // que falta aprobar (un texto de muestra y los demás a pedido).
  const enviadas = invitaciones.filter((a) => !enviables.includes(a));
  const porEstado = [...new Set(enviadas.map((a) => a.estado))].map((e) => `${enviadas.filter((a) => a.estado === e).length} ${ESTADO_ENVIADAS[e] ?? e}`).join(", ");
  return (
    <div className="tarjeta">
      <h2>Invitación</h2>
      {d.evento.estado === "borrador" && ctx.rol === "admin" && (
        <div className="aviso-caja">
          <p>El evento sigue en borrador: los carriers no pueden ofertar hasta publicarlo.</p>
          <Confirmar
            etiqueta="Publicar evento"
            clase="btn-secundario"
            advertencia={<>Abre el evento a ofertas hasta el {fecha(d.evento.plazo)}. No envía nada. {ADVERTENCIA_REAL(s, d)}</>}
            onConfirmar={() => accion(() => s.api.publicar(d.evento.id), "Evento publicado.")}
          />
        </div>
      )}
      {!d.revisiones && (
        <p className="estado estado-error">No se pudo consultar qué carriers están revisados. No se prepara ni envía ninguna invitación hasta poder consultarlo.</p>
      )}
      {audiencia.omitidas.length > 0 && d.revisiones && (
        <div className="aviso-caja">
          <p>
            <b>{resumenOmisiones(audiencia)}</b> Revisa su contacto y márcalos «Revisado» si deben recibirla.
            {s.modo === "rateware" && <> <Liga a={`/rfx/${d.evento.id}/review`}>Revisar contactos →</Liga></>}
          </p>
          <ul>
            {[...new Map(audiencia.omitidas.map((o) => [o.p.carrierId, o])).values()].map((o) => (
              <li key={o.p.carrierId}>
                {o.p.carrier}: {o.motivo} · {o.p.correo || "sin correo en Rateware"}
                {!o.p.correo && ctx.rol !== "viewer" && <ContactosSugeridos vendorId={o.p.carrierId} />}
                {ctx.rol === "admin" && o.estado === "sin_revision" && o.p.correo && (
                  <Confirmar
                    etiqueta="Marcar «Revisado»"
                    clase="btn-texto"
                    advertencia={<>Confirmas que revisaste el contacto de {o.p.carrier} ({o.p.correo}) y que puede recibir la invitación. Queda registrado en Rateware, igual que en Revisión de contactos. No envía nada. {ADVERTENCIA_REAL(s, d)}</>}
                    onConfirmar={() => accion(() => s.api.marcarRevisado(d.evento.id, o.p), `${o.p.carrier} marcado «Revisado».`)}
                  />
                )}
              </li>
            ))}
          </ul>
          {audiencia.omitidas.some((o) => o.estado === "revocada") && <p className="tenue">Una revisión revocada se vuelve a dar en Revisión de contactos.</p>}
        </div>
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
      {verEnviadas && (
        <ul className="lista-compacta">
          {enviadas.map((a) => (
            <li key={a.id}>
              <b>{carrierDe(a)?.carrier}</b> · {a.destinatario} · <span className="tenue">{ESTADO_INVITACION[a.estado] ?? a.estado}</span>
            </li>
          ))}
        </ul>
      )}
      {enviables.length > 0 && (
        <div className="aviso-caja">
          <p><b>{plural(enviables.length, "invitación por enviar", "invitaciones por enviar")}</b> · Gmail desde sales@heymarksman.com</p>
          <ul className="lista-compacta">
            {enviables.map((a) => {
              const p = carrierDe(a);
              return (
                <li key={a.id}>
                  <b>{p?.carrier}</b> · {a.destinatario} · <span className="tenue">{ESTADO_INVITACION[a.estado] ?? a.estado}</span>
                  {a.estado === "en_cola" && <span className="tenue"> ({a.motivo && /dailyLimit|daily_cap|quota/i.test(a.motivo) ? "cuota diaria de Gmail" : a.motivo || "todavía no sale"})</span>}
                  {p && !revisada(a) && <span className="pill">{MOTIVO_OMISION[estadoRevision(d, p.carrierId) as keyof typeof MOTIVO_OMISION]}</span>}
                </li>
              );
            })}
          </ul>
          <button className="btn-texto" onClick={() => setVerTextos(!verTextos)}>{verTextos ? "Ocultar textos" : enviables.length > 1 ? "Ver los textos exactos" : "Ver el texto exacto"}</button>
          {verTextos &&
            enviables.map((a) => (
              <div key={a.id} className="aviso-caja">
                <p className="tenue">Para: {carrierDe(a)?.carrier} · {a.destinatario}</p>
                <p><b>{a.asunto}</b></p>
                <p className="texto-aviso">{a.cuerpo}</p>
              </div>
            ))}
        </div>
      )}
      {detenidas.length > 0 && (
        <p className="tenue">{plural(detenidas.length, "borrador", "borradores")} no se envían porque su carrier no tiene «Revisado» vigente.</p>
      )}
      {avance && (
        <p className={avance.detenido ? "estado estado-error" : "tenue"}>
          Tanda {avance.hechas} de {avance.tandas}: {avance.enviados} aceptada(s) por Gmail{avance.enCola ? `, ${avance.enCola} en cola` : ""}
          {avance.inciertos ? `, ${avance.inciertos} incierta(s)` : ""}. {avance.detenido ?? ""}
        </p>
      )}
      {porEnviar.length > 0 && ctx.rol === "admin" && (
        <Confirmar
          etiqueta={`Aprobar y enviar ${plural(porEnviar.length, "invitación", "invitaciones")}`}
          advertencia={
            <>
              Se envían por Gmail desde sales@heymarksman.com, exactamente con el texto de «Ver los textos exactos»
              {tandas > 1 ? `, en ${tandas} tandas de hasta ${TAMANO_TANDA} con un minuto entre tandas` : ""}. Si Gmail llega a su cuota diaria, el envío se detiene y lo pendiente queda en cola, sin reintentos automáticos. {ADVERTENCIA_REAL(s, d)}
            </>
          }
          onConfirmar={() =>
            accion(
              async () => {
                const r = await s.api.enviarPorTandas(d.evento.id, porEnviar, { alAvanzar: setAvance });
                setAvance(r);
                if (r.detenido) throw new Error(`${r.enviados} de ${porEnviar.length} aceptadas por Gmail. ${r.detenido}`);
                return r;
              },
              (r) => `${plural(r.enviados, "invitación aceptada", "invitaciones aceptadas")} por Gmail.`
            )
          }
        />
      )}
      {audiencia.aptas.length > 0 && ctx.rol === "admin" && (
        <div className="aviso-caja">
          <p>¿La invitación ya salió por otro canal (correo propio, WhatsApp, llamada)? Márcalos como invitados para poder capturar sus ofertas. Solo aparecen los carriers revisados.</p>
          <Confirmar
            etiqueta={`Marcar ${plural(audiencia.aptas.length, "carrier", "carriers")} como invitados sin enviar`}
            clase="btn-secundario"
            advertencia={<>Solo cambia el estado en Rateware: {audiencia.aptas.map((x) => x.carrier).join(", ")}. Fr8Bid no envía nada. {ADVERTENCIA_REAL(s, d)}</>}
            onConfirmar={() => accion(() => s.api.marcarInvitadas(d.evento.id, audiencia.aptas.map((x) => x.id)), "Marcados como invitados.")}
          />
        </div>
      )}
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

function PanelCarrierFit({ d, ctx, accion }: Props) {
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
  return (
    <div className="tarjeta">
      <h2>Carriers sugeridos</h2>
      <p className="tenue">
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

function PanelHistorialSegmento({ d, ctx, accion }: Props) {
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
  return (
    <div className="tarjeta">
      <h2>Historial del segmento</h2>
      <p className="tenue">
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
  const hayPendientes = filas.some((x) => x.estado === "sin_abrir" || x.estado === "abrio" || x.estado === "rebote");
  const candidatos = new Set(candidatosRecordatorio(d, ctx.hoy).map((x) => x.carrierId));
  const conteo = (e: EstadoSeguimiento) => filas.filter((x) => x.estado === e).length;
  const orden: EstadoSeguimiento[] = ["sin_abrir", "abrio", "rebote", "respondio", "declino", "oferto"];
  const ordenadas = [...filas].sort((a, b) => orden.indexOf(a.estado) - orden.indexOf(b.estado) || (b.diasSinRespuesta ?? 0) - (a.diasSinRespuesta ?? 0));
  const ahora = new Date();
  const flacas = rutasSinProfundidad(d);
  const siguiente = new Map(filas.map((x) => [x.carrierId, siguienteIntento(d, x, ahora)]));
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
      <h2>Seguimiento</h2>
      <p className="tenue">
        {plural(filas.length, "invitado")}: {conteo("oferto")} ofertaron
        {conteo("abrio") ? `, ${conteo("abrio")} abrieron sin ofertar` : ""}
        {conteo("sin_abrir") ? `, ${conteo("sin_abrir")} no han abierto la liga` : ""}
        {conteo("respondio") ? `, ${conteo("respondio")} respondieron por otro canal` : ""}
        {conteo("declino") ? `, ${conteo("declino")} declinaron` : ""}
        {conteo("rebote") ? `, ${conteo("rebote")} rebotaron` : ""}.
        {!hayPendientes && (
          <> <button className="btn-texto" onClick={() => setVerTabla(!verTabla)}>{verTabla ? "Ocultar detalle" : "Ver por carrier"}</button></>
        )}
      </p>
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
              <p className="tenue">
                Texto del {muestra.paso.intento}º intento. Rateware lo pone dentro de su plantilla con el resumen de la ruta y el botón a la liga privada. Va en el hilo solo si el carrier ya
                escribió; si no, sale como correo nuevo con asunto «{d.evento.folio} | Question about …» (el asunto lo fija Rateware, en inglés):
              </p>
              <p className="texto-aviso">{textoIntento(d, muestra.ruta, muestra.paso)}</p>
              <Confirmar
                etiqueta={`Preparar ${plural(porPreparar.length, "intento", "intentos")}`}
                clase="btn-secundario"
                advertencia={`Rateware deja ${porPreparar.length} borrador(es) en la Cola, uno por carrier sin respuesta. No se envía nada: el envío lo apruebas aquí mismo.`}
                onConfirmar={() =>
                  accion(async () => {
                    let listos = 0;
                    for (const x of porPreparar) {
                      await s.api.prepararIntento(d.evento.id, x.participacion.id, textoIntento(d, x.ruta, x.paso), claveIntento(d.evento.id, x.participacion.id, x.paso.intento));
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
          <tr><th>Carrier</th><th>Estado</th><th>Rutas</th><th>Invitado</th><th>Abrió</th><th>Siguiente intento</th><th></th></tr>
        </thead>
        <tbody>
          {ordenadas.map((x) => {
            const r = candidatos.has(x.carrierId) ? recordatorio(d, x) : null;
            return (
              <Fragment key={x.carrierId}>
                <tr>
                  <td><b>{x.carrier}</b></td>
                  <td data-etiqueta="Estado">
                    {x.estado === "respondio" && x.respondioPor.length
                      ? `respondió por ${x.respondioPor.map((c) => (c === "correo" ? "correo" : "chat del Bid Room")).join(" y ")}`
                      : ETIQUETA_SEGUIMIENTO[x.estado]}
                    {x.diasSinRespuesta !== null ? ` · ${plural(x.diasSinRespuesta, "día")}` : ""}
                  </td>
                  <td data-etiqueta="Rutas">{x.estado === "oferto" && x.ofertadas < x.rutas ? `${x.ofertadas} de ${x.rutas}` : x.rutas}</td>
                  <td data-etiqueta="Invitado">{fecha(x.invitadaEn)}</td>
                  <td data-etiqueta="Abrió">{fecha(x.vistaEn)}</td>
                  <td data-etiqueta="Siguiente intento">
                    {(() => {
                      const sig = siguiente.get(x.carrierId);
                      if (!sig) return "—";
                      return <>{sig.intento}º por {sig.canal === "whatsapp" ? "WhatsApp" : "correo"} · {sig.enCola ? "borrador por aprobar" : sig.vencido ? <span className="pill alerta">ya toca</span> : fecha(sig.tocaEn)}</>;
                    })()}
                  </td>
                  <td>
                    {whatsappDe.get(x.carrierId)?.liga && ctx.rol !== "viewer" && (
                      <a className="btn-texto" href={whatsappDe.get(x.carrierId)!.liga!} target="_blank" rel="noreferrer" title={`+${whatsappDe.get(x.carrierId)!.numero} · ${whatsappDe.get(x.carrierId)!.telefono.motivo}`}>
                        WhatsApp{whatsappDe.get(x.carrierId)!.telefono.certeza === "dudoso" ? " (por confirmar)" : ""}
                      </a>
                    )}
                    {(x.estado === "rebote" || (whatsappDe.has(x.carrierId) && !whatsappDe.get(x.carrierId)!.liga)) && ctx.rol !== "viewer" && (
                      <button className="btn-texto" onClick={() => setAbierto(abierto === `c:${x.carrierId}` ? null : `c:${x.carrierId}`)}>
                        {abierto === `c:${x.carrierId}` ? "Ocultar" : "Otros contactos"}
                      </button>
                    )}
                    {r && ctx.rol !== "viewer" && (
                      <button className="btn-texto" onClick={() => setAbierto(abierto === x.carrierId ? null : x.carrierId)}>
                        {abierto === x.carrierId ? "Ocultar" : "Recordatorio"}
                      </button>
                    )}
                    {(x.estado === "sin_abrir" || x.estado === "abrio") && ctx.rol !== "viewer" && d.evento.estado === "abierto" && (
                      <button className="btn-texto" onClick={() => setAbierto(abierto === `r:${x.carrierId}` ? null : `r:${x.carrierId}`)}>
                        {abierto === `r:${x.carrierId}` ? "Ocultar" : "Ya respondió"}
                      </button>
                    )}
                  </td>
                </tr>
                {abierto === `c:${x.carrierId}` && (
                  <tr>
                    <td colSpan={7}>
                      <ContactosSugeridos vendorId={x.carrierId} abrir />
                    </td>
                  </tr>
                )}
                {abierto === `r:${x.carrierId}` && (
                  <tr>
                    <td colSpan={7}>
                      <YaRespondio d={d} s={x} accion={accion} />
                    </td>
                  </tr>
                )}
                {r && abierto === x.carrierId && (
                  <tr>
                    <td colSpan={7}>
                      <div className="aviso-caja">
                        <p className="tenue">Para: {r.para} · Gmail</p>
                        <p><b>{r.asunto}</b></p>
                        <p className="texto-aviso">{r.cuerpo}</p>
                        <p className="tenue">Fr8Bid no envía este recordatorio. «Abrir en Gmail» crea el borrador en tu cuenta; revísalo y envíalo tú si estás de acuerdo.</p>
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
  const vigentes = new Set(seguimiento(d, ctx.hoy).filter((x) => x.estado === "sin_abrir" || x.estado === "abrio").map((x) => x.carrierId));
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
  const candidatas = ruta.participaciones.filter((x) => !["preseleccionada", "declino"].includes(x.estado) && !x.rol);
  const vacio = { id: "", tarifa: "", moneda: "USD", vigencia: "", capacidad: "", transito: "", canal: "email" as const, notas: "" };
  const [f, setF] = useState<{ id: string; tarifa: string; moneda: string; vigencia: string; capacidad: string; transito: string; canal: "email" | "phone" | "whatsapp" | "other"; notas: string }>(vacio);
  const [abierto, setAbierto] = useState(false);
  if (s.rol === "viewer" || !candidatas.length || d.evento.estado === "adjudicado" || d.evento.estado === "archivado") return null;
  if (!abierto) return <button className="btn-texto" onClick={() => setAbierto(true)}>Capturar oferta recibida por otro canal</button>;
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
  const [elegido, setElegido] = useState<string | null>(null);
  const [historial, setHistorial] = useState<string | null>(null);
  const [preguntaA, setPreguntaA] = useState<string | null>(null);
  const hayOfertas = d.rutas.some((r) => conOferta(r).length > 0);
  const abierto = d.evento.estado === "abierto";
  const pendientes = seguimiento(d, ctx.hoy).filter((x) => x.estado === "sin_abrir" || x.estado === "abrio").length;

  return (
    <>
      {abierto && ctx.rol === "admin" && hayOfertas && (
        <div className="tarjeta accion-principal">
          <p>
            {pendientes
              ? `${plural(pendientes, "carrier")} sin ofertar todavía. Puedes esperar o cerrar ya para adjudicar.`
              : "Ya respondieron todos los invitados. Cierra a ofertas para adjudicar."}
          </p>
          <Confirmar
            etiqueta="Cerrar a ofertas"
            clase={pendientes ? "btn-secundario" : "btn-primario"}
            advertencia={<>La liga de cada carrier dejará de aceptar ofertas en todas las rutas. Así el importe que adjudiques no cambia sin otra decisión. {ADVERTENCIA_REAL(s, d)}</>}
            onConfirmar={() => accion(() => s.api.cerrarAOfertas(d.evento.id), "Evento cerrado a ofertas.")}
          />
        </div>
      )}
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
              <p className="tenue descargas">
                Comparativo en Excel:{" "}
                <button className="btn-texto" onClick={() => descargarComparativo(d, false)}>interno</button> ·{" "}
                <button className="btn-texto" onClick={() => descargarComparativo(d, true)} title="Sin nombres de carrier, modelo comercial ni porcentajes">para el shipper (anónimo)</button>
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
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((p) => (
                      <FilaOferta
                        key={p.id}
                        p={p}
                        ruta={ruta}
                        totalRubros={totalRubros}
                        elegido={elegido === p.id}
                        columnaElegir={puedeElegir}
                        elegible={puedeElegir && !p.rol}
                        onElegir={() => setElegido(p.id)}
                        onHistorial={() => setHistorial(historial === p.id ? null : p.id)}
                        onPreguntar={ctx.rol !== "viewer" && p.correo && d.evento.estado !== "adjudicado" ? () => setPreguntaA(preguntaA === p.id ? null : p.id) : undefined}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!filas.length && <p className="tenue">Aún no llegan ofertas en esta ruta.</p>}
            {!abierto && !prim && !sel && filas.length > 0 && (
              <p className="tenue">{puedeElegir ? "Elige la oferta a adjudicar como primario: sus candados y el motivo aparecen abajo." : ctx.rol !== "admin" ? "Solo el Administrador adjudica." : ""}</p>
            )}
            {declinaron.length > 0 && <p className="tenue">Declinaron: {declinaron.join(", ")}.</p>}
            <MatrizCondiciones ruta={ruta} carriers={filas} />
            {historial && ruta.participaciones.some((x) => x.id === historial) && <Historial p={ruta.participaciones.find((x) => x.id === historial)!} />}
            {preguntaA && ruta.participaciones.some((x) => x.id === preguntaA) && (
              <PreguntaCarrier d={d} ruta={ruta} p={ruta.participaciones.find((x) => x.id === preguntaA)!} onCerrar={() => setPreguntaA(null)} />
            )}
            {!prim && <CapturaEquipo d={d} ruta={ruta} accion={accion} />}
            <LigasSimuladas d={d} />
          </div>
        );
        // La tabla siempre a todo el ancho; lo que se decide va debajo, en la
        // misma columna, para no apretar el comparativo.
        if (abierto || (!prim && !sel)) return <Fragment key={ruta.id}>{tabla}</Fragment>;
        return (
          <Fragment key={ruta.id}>
            {tabla}
            <div className="tarjeta lado">
              {prim ? (
                <>
                  <PrimarioActual d={d} ruta={ruta} p={prim} ctx={ctx} accion={accion} />
                  {respaldos.map((r) => (
                    <Respaldo key={r.id} d={d} ruta={ruta} p={r} ctx={ctx} accion={accion} />
                  ))}
                  {sel && !sel.rol ? (
                    <FormAdjudicar key={sel.id} d={d} ruta={ruta} sel={sel} rol="respaldo" ctx={ctx} accion={accion} />
                  ) : (
                    puedeElegir && <p className="tenue">Opcional: elige otra oferta para adjudicarla como respaldo.</p>
                  )}
                </>
              ) : (
                sel && <FormAdjudicar key={sel.id} d={d} ruta={ruta} sel={sel} rol="primario" ctx={ctx} accion={accion} />
              )}
            </div>
          </Fragment>
        );
      })}
    </>
  );
}

function ResumenCondiciones({ ruta, p }: { ruta: Ruta; p: Participacion }) {
  const r = revisarCondiciones(ruta, p);
  if (r.bloquean.length) return <span className="error-texto" title={r.bloquean.join(", ")}>Bloquea {r.bloquean.length}</span>;
  return <span title={r.marcadas.join(", ")}>{r.cumplidas}/{r.total}{r.marcadas.length ? ` · ${r.marcadas.length} con nota` : ""}</span>;
}

function FilaOferta({ p, ruta, totalRubros, elegido, columnaElegir, elegible, onElegir, onHistorial, onPreguntar }: { p: Participacion; ruta: Ruta; totalRubros: number; elegido: boolean; columnaElegir: boolean; elegible: boolean; onElegir: () => void; onHistorial: () => void; onPreguntar?: () => void }) {
  const v = versionVigente(p)!;
  const rubros = Object.values(p.rubros);
  const negativa = rubros.includes("no_puedo");
  const deAcuerdo = rubros.filter((x) => x === "de_acuerdo").length;
  const anterior = p.versiones.find((x) => x.numero === v.numero - 1);
  const venta = tarifaVenta(v);
  return (
    <tr className={elegido ? "elegida" : ""} onClick={elegible ? onElegir : undefined} style={elegible ? { cursor: "pointer" } : undefined}>
      {columnaElegir && <td>{elegible && <input type="radio" name={`oferta-${ruta.id}`} aria-label={`Elegir ${p.carrier}`} checked={elegido} onChange={onElegir} />}</td>}
      <td>
        <b>{p.carrier}</b>
        {p.rol && <span className="pill ok-pill">{p.rol}</span>}
        <div className="acciones-fila">
          <button className="btn-texto" onClick={(e) => { e.stopPropagation(); onHistorial(); }} title="Historial de versiones">
            v{v.numero}{anterior ? ` · antes ${anterior.tarifaAllIn.toLocaleString("es-MX")}` : ""}
          </button>
          {onPreguntar && (
            <button className="btn-texto" onClick={(e) => { e.stopPropagation(); onPreguntar(); }}>Preguntar</button>
          )}
        </div>
      </td>
      <td data-etiqueta="All-in">
        <span className="mono">{dinero(v.tarifaAllIn, v.moneda)}</span>
        <div className="tenue" title={describirModelo(v)}>{modeloCorto(v)}</div>
      </td>
      <td data-etiqueta="Venta">
        <span className="mono">{dinero(venta.venta, v.moneda)}</span>
        {venta.porDefecto && <div className="tenue">% por defecto</div>}
      </td>
      <td data-etiqueta="Cap./sem">{v.capacidadSemanal ?? "—"}</td>
      <td data-etiqueta="Tránsito">{v.transitoDias !== null ? `${v.transitoDias} d` : "—"}</td>
      <td data-etiqueta="Vigencia">{v.vigenteHasta ? fecha(v.vigenteHasta) : <span className="alerta">Sin vigencia</span>}</td>
      <td data-etiqueta={ruta.condiciones.length ? "Condiciones" : "Rubros"}>{ruta.condiciones.length ? <ResumenCondiciones ruta={ruta} p={p} /> : negativa ? <span className="error-texto">No puedo</span> : `${deAcuerdo}/${totalRubros}`}</td>
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
      <p className="tenue">Fr8Bid no envía la pregunta: «Abrir en Gmail» crea el borrador en tu cuenta y tú decides si lo envías.</p>
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
  const [motivo, setMotivo] = useState("");
  const [confirmaVigencia, setConfirmaVigencia] = useState(false);
  const candados = candadosAdjudicacion(d, ruta, sel, ctx, rol);
  const v = versionVigente(sel);
  return (
    <div className={rol === "respaldo" ? "aviso-caja" : ""}>
      <h3>Adjudicar {rol}</h3>
      <p>
        <b>{sel.carrier}</b> · {dinero(v?.tarifaAllIn, v?.moneda)} all-in · v{v?.numero}
      </p>
      {v && <p className="tenue">{describirModelo(v)}. Se adjudica el all-in; el porcentaje no lo modifica.</p>}
      {rol === "respaldo" && <p className="tenue">El respaldo cubre la ruta si el primario no tiene capacidad. Se entrega a Rateware junto con el primario.</p>}
      <Candados lista={candados} />
      {candados.some((c) => c.confirmable) && (
        <label className="check">
          <input type="checkbox" checked={confirmaVigencia} onChange={(e) => setConfirmaVigencia(e.target.checked)} />
          Confirmo adjudicar una oferta sin vigencia declarada (D4)
        </label>
      )}
      <label className="campo">
        <span>Motivo (obligatorio)</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
      </label>
      <Confirmar
        etiqueta={`Adjudicar como ${rol}`}
        deshabilitado={!puedeAdjudicar(candados, confirmaVigencia) || !motivo.trim()}
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
        <b>{p.carrier}</b> · v{p.adjudicada?.numero} · {dinero(p.versiones.find((v) => v.numero === p.adjudicada?.numero)?.tarifaAllIn, ruta.moneda)}
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
        <b>{p.carrier}</b> · v{p.adjudicada?.numero} · {dinero(p.versiones.find((v) => v.numero === p.adjudicada?.numero)?.tarifaAllIn, ruta.moneda)}
      </p>
      <p className="tenue">Motivo: {p.motivo} · {p.adjudicada?.por} · {fecha(p.adjudicada?.en)}</p>
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
  const confirmar = (op: string) =>
    accion(async () => {
      setEntrega({ estado: "enviada", operationId: op, error: null });
      const res = await s.api.confirmarEntrega(d.evento.id, op);
      setEntrega(res.entrega);
      if (res.recibo) setRecibo(res.recibo);
      if (res.entrega.estado !== "confirmada") throw new Error(res.entrega.error || "La entrega no se confirmó.");
    }, "Recibo de Rateware confirmado.");

  return (
    <div className="dos-columnas">
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
              {p ? <><b>{p.carrier}</b> {monto(p)} (v{p.adjudicada?.numero})</> : <span className="tenue">{ruta.desiertaMotivo ? "desierta" : "sin primario"}</span>}
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
          <OfrecerRespaldo d={d} ctx={ctx} accion={accion} />
        )}
        {!r.entregaConfirmada && decidido && ctx.rol === "admin" && (
          <div className="fila-botones">
            {entrega.estado === "sin_preparar" || entrega.estado === "rechazada" ? (
              <Confirmar
                etiqueta="Entregar a Rateware"
                advertencia={<>Rateware guarda {plural(prims.length, "tarifa")} en Revisión (pending_review) y devuelve el recibo. {ADVERTENCIA_REAL(s, d)}</>}
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
      </div>
      <aside className="tarjeta lado">
        <Candados
          lista={[
            { regla: "I4", ok: decidido, texto: decidido ? "Todas las rutas decididas" : "Faltan rutas por decidir" },
            { regla: "I2", ok: prims.every((p) => !versionMasReciente(p)), texto: "Lo adjudicado es la versión vigente" },
            { regla: "I5", ok: entrega.estado !== "incierta", texto: entrega.estado === "incierta" ? "Incierta: concilia con la misma operación" : "Sin entregas inciertas" },
            { regla: "rol", ok: ctx.rol === "admin", texto: ctx.rol === "admin" ? "Tu rol: Administrador" : "Solo el Administrador entrega" }
          ]}
        />
        <p className="nota">Nunca hay reintento automático.</p>
      </aside>
    </div>
  );
}

// Antes de entregar: rutas con primario, sin respaldo y con otra oferta
// vigente. Se ofrece la siguiente mejor (por all-in) como respaldo; es opcional.
function OfrecerRespaldo({ d, ctx, accion }: { d: Detalle; ctx: Contexto; accion: Props["accion"] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
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
  const otros = d.avisos.filter((a) => a.tipo === "adjudicacion" && a.resultado !== "adjudicado");
  return (
    <div className="tarjeta">
      <h2>Aviso de adjudicación</h2>
      {!r.entregaConfirmada && <p className="tenue">Requiere el recibo de Rateware (I8). El carrier no se entera de algo que Rateware no tiene.</p>}
      {r.entregaConfirmada && faltan.length > 0 && ctx.rol === "admin" && (
        <Confirmar
          etiqueta="Preparar los avisos"
          clase="btn-primario"
          advertencia={<>Rateware prepara un borrador por carrier que participó (adjudicado o no). No envía nada. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() => accion(() => s.api.generarAvisosAdjudicacion(d.evento.id), "Avisos preparados. Revisa cada texto y apruébalo aquí.")}
        />
      )}
      {d.avisos.some((a) => a.tipo === "adjudicacion") && (
        <p className="nota">El texto lo arma Rateware (en Rateware real sale en inglés) y se edita en su Cola; al volver, Fr8Bid muestra la versión nueva. Se envían desde sales@heymarksman.com por Gmail, que llega hasta «aceptado»; un rebote se muestra aquí.</p>
      )}
      {prims.map((p) => {
        const a = avisoDe(d, p.id, "adjudicacion");
        return a ? <TarjetaAviso key={a.id} d={d} a={a} titulo={p.carrier} ctx={ctx} accion={accion} /> : null;
      })}
      {otros.length > 0 && (
        <>
          <h3>No adjudicados y respaldo</h3>
          {otros.map((a) => (
            <TarjetaAviso
              key={a.id}
              d={d}
              a={a}
              titulo={`${d.rutas.flatMap((r) => r.participaciones).find((x) => x.id === a.participacionId)?.carrier ?? a.destinatario} · ${a.resultado === "respaldo" ? "respaldo" : "no adjudicado"}`}
              ctx={ctx}
              accion={accion}
            />
          ))}
        </>
      )}
    </div>
  );
}

// Un aviso con su texto exacto, candados y el botón de enviar esa versión.
function TarjetaAviso({ d, a, titulo, ctx, accion }: { d: Detalle; a: Aviso; titulo: string; ctx: Contexto; accion: Props["accion"] }) {
  const s = useSesion();
  const candados = candadosAviso(d, a, ctx);
  const enviable = ctx.rol === "admin" && (a.estado === "borrador" || a.estado === "fallido" || a.estado === "en_cola");
  return (
    <div className="aviso-caja">
      <div className="fila">
        <b>{titulo}</b>
        <span className="pill">{ESTADO_INVITACION[a.estado] ?? a.estado}</span>
      </div>
      <p className="tenue">Para: {a.destinatario} · versión {fecha(a.version)}</p>
      <p><b>{a.asunto}</b></p>
      <p className="texto-aviso">{a.cuerpo}</p>
      {a.reciboProveedor && <p className="tenue">Gmail aceptó el mensaje · id {a.reciboProveedor}</p>}
      {enviable && <Candados lista={candados} />}
      {enviable && (
        <Confirmar
          etiqueta="Aprobar este texto y enviar"
          deshabilitado={!candados.every((c) => c.ok)}
          advertencia={<>Se envía por Gmail a {a.destinatario} exactamente esta versión. Si alguien la cambia en la Cola antes, Rateware la rechaza y la vuelves a revisar. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() => accion(() => s.api.enviarAvisos(d.evento.id, [a]), "Aviso aceptado por Gmail.")}
        />
      )}
    </div>
  );
}

function PanelLoads({ d }: { d: Detalle }) {
  const prims = d.rutas.map(primario).filter(Boolean) as Participacion[];
  return (
    <div className="tarjeta">
      <h2>Visible en Loads</h2>
      <p className="tenue">Fr8Bid no consulta a Loads: este paso se deduce del recibo de Rateware. Confírmalo abriendo Loads.</p>
      {prims.map((p) => {
        const proy = proyeccionLoads(d, p.id);
        return (
          <div key={p.id}>
            <p>
              <b>{p.carrier}</b> {proy ? "debería verse «adjudicado» en Loads." : "todavía no: falta el recibo de Rateware."}
            </p>
            {proy && (
              <details>
                <summary className="tenue">Datos que Loads puede mostrar</summary>
                <pre className="mono codigo">{JSON.stringify(proy, null, 2)}</pre>
              </details>
            )}
          </div>
        );
      })}
      {!prims.length && <p className="tenue">Sin primario todavía.</p>}
    </div>
  );
}

function Cadena({ d, recibo, entrega }: { d: Detalle; recibo: Recibo | null; entrega: EntregaLocal }) {
  const prims = d.rutas.map(primario).filter(Boolean) as Participacion[];
  return (
    <div className="tarjeta cadena">
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
