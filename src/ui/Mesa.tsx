import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorApi } from "../cliente/api";
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
import type { Detalle, EntregaLocal, Participacion, Recibo, Ruta } from "../dominio/tipos";
import { EditorCondiciones, ListaCondiciones, MatrizCondiciones } from "./condiciones";
import { aCarga, Confirmar, Desactualizado, dinero, EstadoVista, fecha, Liga, Prueba, type Carga } from "./comun";
import { useSesion } from "./sesion";

const SIN_ENTREGA: EntregaLocal = { estado: "sin_preparar", operationId: null, error: null };

export function Mesa({ id }: { id: string }) {
  const s = useSesion();
  const [carga, setCarga] = useState<Carga<Detalle>>({ tipo: "cargando" });
  const [entrega, setEntrega] = useState<EntregaLocal>(SIN_ENTREGA);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [vista, setVista] = useState<ClavePaso | null>(null);
  const [aviso, setAvisoMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

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

  if (carga.tipo !== "ok") return <EstadoVista carga={carga} reintentar={leer} />;
  const d = carga.datos;
  const r = recorrido(d, ctx);
  const actual = vista ?? r.actual?.clave ?? "loads";

  const accion = async (f: () => Promise<unknown>, ok?: string) => {
    setAvisoMsg(null);
    try {
      await f();
      if (ok) setAvisoMsg({ tipo: "ok", texto: ok });
    } catch (e) {
      const extra = e instanceof ErrorApi && e.code === "ESCRITURA_NO_AUTORIZADA" ? " (FR8BID_ESCRITURAS_REALES no está activo)" : "";
      setAvisoMsg({ tipo: "error", texto: (e instanceof Error ? e.message : String(e)) + extra });
    }
    await leer();
  };

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
            {d.rutas[0]?.equipo} · {d.rutas.length} ruta(s) · {d.evento.shipper}
          </p>
        </div>
        <div className="etiquetas">
          {d.evento.prueba && <Prueba />}
          <span className="pill">{ESTADO[d.evento.estado]}</span>
        </div>
      </header>
      <Desactualizado leidoEn={carga.leidoEn} actualizar={leer} />
      {aviso && <div className={aviso.tipo === "ok" ? "estado estado-ok" : "estado estado-error"} role="status">{aviso.texto}</div>}

      <div className="paso-movil">
        Paso {r.actual?.n ?? 11} de 11 · {r.siguiente.accion}
        {r.siguiente.teToca && <b> · te toca</b>}
      </div>

      <div className="mesa">
        <nav className="riel" aria-label="Recorrido">
          <h2>Recorrido</h2>
          <ol>
            {r.pasos.map((x) => (
              <li key={x.clave} className={`paso paso-${x.estado} ${actual === x.clave ? "visto" : ""}`}>
                <button onClick={() => setVista(x.clave)}>
                  <span className="marca-paso">{x.estado === "hecho" ? "✓" : x.n}</span>
                  <span>
                    <b>{x.titulo}</b>
                    <small>{x.estado === "actual" && r.siguiente.teToca ? `Te toca · ${x.quien}` : x.detalle}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="centro">
          {(actual === "invitacion" || actual === "carriers") && <PanelInvitacion {...p} />}
          {["necesidad", "evento"].includes(actual) && <PanelEvento {...p} />}
          {["ofertas", "comparar", "cierre", "adjudicar"].includes(actual) && <PanelComparar {...p} />}
          {actual === "entrega" && <PanelEntrega {...p} />}
          {actual === "aviso" && <PanelAviso {...p} />}
          {actual === "loads" && <PanelLoads d={d} />}
          {r.entregaConfirmada && <Cadena d={d} recibo={recibo} entrega={entrega} />}
        </div>
      </div>
    </section>
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
  accion: (f: () => Promise<unknown>, ok?: string) => Promise<void>;
  entrega: EntregaLocal;
  setEntrega: (e: EntregaLocal) => void;
  recibo: Recibo | null;
  setRecibo: (r: Recibo | null) => void;
};

function Candados({ lista, titulo = "Candados" }: { lista: Candado[]; titulo?: string }) {
  return (
    <div className="candados">
      <h3>{titulo}</h3>
      <ul>
        {lista.map((c, i) => (
          <li key={i} className={c.ok ? "ok" : c.confirmable ? "confirmable" : "no"}>
            <span aria-hidden>{c.ok ? "✓" : c.confirmable ? "!" : "✕"}</span> {c.texto}
          </li>
        ))}
      </ul>
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
        {d.evento.nombre} · shipper {d.evento.shipper} · plazo {fecha(d.evento.plazo)}
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

function PanelInvitacion({ d, ctx, accion }: Props) {
  const s = useSesion();
  const invitaciones = d.avisos.filter((a) => a.tipo === "invitacion");
  const porEnviar = invitaciones.filter((a) => a.estado === "borrador" || a.estado === "fallido");
  const preseleccionadas = d.rutas.flatMap((r) => r.participaciones).filter((x) => x.estado === "preseleccionada");
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
      {!invitaciones.length && !preseleccionadas.length && <p className="tenue">El Operador aún no prepara las invitaciones.</p>}
      {!invitaciones.length && preseleccionadas.length > 0 && (
        <p className="tenue">Sin invitaciones preparadas en Fr8Bid para {preseleccionadas.length} carrier(s) preseleccionado(s).</p>
      )}
      {invitaciones.map((a) => {
        const p = d.rutas.flatMap((r) => r.participaciones).find((x) => x.id === a.participacionId);
        return (
          <div key={a.id} className="aviso-caja">
            <div className="fila">
              <b>{p?.carrier}</b>
              <span className="pill">{a.estado}</span>
            </div>
            <p className="tenue">Para: {a.destinatario} · Gmail</p>
            <p><b>{a.asunto}</b></p>
            <p className="texto-aviso">{a.cuerpo}</p>
          </div>
        );
      })}
      {porEnviar.length > 0 && ctx.rol === "admin" && (
        <Confirmar
          etiqueta={`Aprobar y enviar ${porEnviar.length} invitación(es) con este texto exacto`}
          advertencia={<>Se envían por Gmail desde sales@heymarksman.com, exactamente como se ven arriba. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() => accion(() => s.api.enviarAvisos(d.evento.id, porEnviar), "Invitaciones aceptadas por Gmail.")}
        />
      )}
      {preseleccionadas.length > 0 && ctx.rol === "admin" && (
        <div className="aviso-caja">
          <p>¿La invitación ya salió por otro canal (correo propio, WhatsApp, llamada)? Márcalos como invitados para poder capturar sus ofertas.</p>
          <Confirmar
            etiqueta={`Marcar ${preseleccionadas.length} como invitado(s) sin enviar`}
            clase="btn-secundario"
            advertencia={<>Solo cambia el estado en Rateware: {preseleccionadas.map((x) => x.carrier).join(", ")}. Fr8Bid no envía nada. {ADVERTENCIA_REAL(s, d)}</>}
            onConfirmar={() => accion(() => s.api.marcarInvitadas(d.evento.id, preseleccionadas.map((x) => x.id)), "Marcados como invitados.")}
          />
        </div>
      )}
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
  if (!candidatas.length || d.evento.estado === "adjudicado" || d.evento.estado === "archivado") return null;
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
  const [motivo, setMotivo] = useState("");
  const [confirmaVigencia, setConfirmaVigencia] = useState(false);
  const [historial, setHistorial] = useState<string | null>(null);

  return (
    <>
      {d.rutas.map((ruta) => {
        const filas = [...conOferta(ruta)].sort((a, b) => versionVigente(a)!.tarifaAllIn - versionVigente(b)!.tarifaAllIn);
        const sel = ruta.participaciones.find((x) => x.id === elegido) ?? null;
        const candados = sel ? candadosAdjudicacion(d, ruta, sel, ctx) : [];
        const prim = primario(ruta);
        const totalRubros = new Set(ruta.participaciones.flatMap((x) => Object.keys(x.rubros))).size;
        return (
          <div key={ruta.id} className="dos-columnas">
            <div className="tarjeta">
              <div className="fila">
                <h2>Ruta {ruta.numero} · ofertas vigentes</h2>
                <span className="tenue">Objetivo {dinero(ruta.objetivo, ruta.moneda)} · ordenado por all-in</span>
              </div>
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Carrier</th>
                      <th>All-in</th>
                      <th>Cap./sem</th>
                      <th>Tránsito</th>
                      <th>Vigencia</th>
                      <th>{ruta.condiciones.length ? "Condiciones" : "Rubros"}</th>
                      <th>Versión</th>
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
                        elegible={d.evento.estado === "cerrado" && ctx.rol === "admin" && !prim}
                        onElegir={() => {
                          setElegido(p.id);
                          setConfirmaVigencia(false);
                        }}
                        onHistorial={() => setHistorial(historial === p.id ? null : p.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {!filas.length && <p className="tenue">Aún no llegan ofertas.</p>}
              <MatrizCondiciones ruta={ruta} carriers={filas} />
              {!prim && <CapturaEquipo d={d} ruta={ruta} accion={accion} />}
              <LigasSimuladas d={d} />
              {historial && <Historial p={ruta.participaciones.find((x) => x.id === historial)!} />}
              {ruta.participaciones.filter((p) => p.estado === "declino").map((p) => (
                <p key={p.id} className="tenue">{p.carrier} declinó.</p>
              ))}
              {d.evento.estado === "abierto" && ctx.rol === "admin" && (
                <Confirmar
                  etiqueta="Cerrar a ofertas"
                  clase="btn-secundario"
                  advertencia={<>La liga de cada carrier dejará de aceptar ofertas (409). Así el importe que adjudiques no cambia sin otra decisión. {ADVERTENCIA_REAL(s, d)}</>}
                  onConfirmar={() => accion(() => s.api.cerrarAOfertas(d.evento.id), "Evento cerrado a ofertas.")}
                />
              )}
            </div>

            <aside className="tarjeta lado">
              {prim ? (
                <PrimarioActual d={d} ruta={ruta} p={prim} ctx={ctx} accion={accion} />
              ) : sel ? (
                <>
                  <h3>Adjudicar primario</h3>
                  <p>
                    <b>{sel.carrier}</b> · {dinero(versionVigente(sel)?.tarifaAllIn, versionVigente(sel)?.moneda)} · v{versionVigente(sel)?.numero}
                  </p>
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
                    etiqueta="Adjudicar como primario"
                    deshabilitado={!puedeAdjudicar(candados, confirmaVigencia) || !motivo.trim()}
                    advertencia={<>No se envía nada al carrier. El aviso se desbloquea cuando Rateware entregue el recibo. {ADVERTENCIA_REAL(s, d)}</>}
                    onConfirmar={() =>
                      accion(
                        () =>
                          s.api.adjudicar({
                            eventId: d.evento.id,
                            participacionId: sel.id,
                            rol: "primario",
                            motivo,
                            operationId: operacionAdjudicacion(d.evento.id, sel.id, "primario", versionVigente(sel)!.huella),
                            confirmaSinVigencia: confirmaVigencia
                          }),
                        `Adjudicado a ${sel.carrier}.`
                      )
                    }
                  />
                </>
              ) : (
                <>
                  <h3>Adjudicar</h3>
                  <p className="tenue">
                    {d.evento.estado === "abierto"
                      ? "Primero cierra a ofertas. Puedes revisar el comparativo mientras tanto."
                      : ctx.rol !== "admin"
                        ? "Solo el Administrador adjudica."
                        : "Elige una oferta para ver sus candados."}
                  </p>
                </>
              )}
            </aside>
          </div>
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

function FilaOferta({ p, ruta, totalRubros, elegido, elegible, onElegir, onHistorial }: { p: Participacion; ruta: Ruta; totalRubros: number; elegido: boolean; elegible: boolean; onElegir: () => void; onHistorial: () => void }) {
  const v = versionVigente(p)!;
  const rubros = Object.values(p.rubros);
  const negativa = rubros.includes("no_puedo");
  const deAcuerdo = rubros.filter((x) => x === "de_acuerdo").length;
  const anterior = p.versiones.find((x) => x.numero === v.numero - 1);
  return (
    <tr className={elegido ? "elegida" : ""}>
      <td>{elegible && <input type="radio" name="oferta" aria-label={`Elegir ${p.carrier}`} checked={elegido} onChange={onElegir} />}</td>
      <td>
        <b>{p.carrier}</b>
        {p.rol && <span className="pill ok-pill"> {p.rol}</span>}
      </td>
      <td className="mono">
        {dinero(v.tarifaAllIn, v.moneda)}
        <div className="tenue">{v.modeloComercial}</div>
      </td>
      <td>{v.capacidadSemanal ?? "—"}</td>
      <td>{v.transitoDias !== null ? `${v.transitoDias} d` : "—"}</td>
      <td>{v.vigenteHasta ? fecha(v.vigenteHasta) : <span className="alerta">Sin vigencia</span>}</td>
      <td>{ruta.condiciones.length ? <ResumenCondiciones ruta={ruta} p={p} /> : negativa ? <span className="error-texto">No puedo</span> : `${deAcuerdo}/${totalRubros}`}</td>
      <td>
        <button className="btn-texto" onClick={onHistorial}>
          v{v.numero}
          {anterior ? ` · antes ${anterior.tarifaAllIn.toLocaleString("es-MX")}` : ""}
        </button>
      </td>
    </tr>
  );
}

function Historial({ p }: { p: Participacion }) {
  return (
    <div className="historial">
      <h3>Historial de la oferta · {p.carrier}</h3>
      <ol>
        {p.versiones.map((v) => (
          <li key={v.numero}>
            v{v.numero} · {dinero(v.tarifaAllIn, v.moneda)} · {v.fuente === "portal_carrier" ? "portal del carrier" : "captura del equipo"} · {fecha(v.creadaEn)}
            {v.nota && <> · nota: «{v.nota}»</>} <span className="mono tenue">#{v.huella.slice(0, 8)}</span>
          </li>
        ))}
      </ol>
      {p.versiones.length === 1 && <p className="nota">Con Rateware real solo llega la versión vigente: Rateware no expone el historial por acción (contrato C2 pendiente).</p>}
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
      {!p.entregadaEn && ctx.rol === "admin" && (
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
        <p className="tenue">preparada → enviada → confirmada · otras salidas: rechazada, incierta</p>
        {prims.map((p) => (
          <p key={p.id}>
            {d.rutas.find((x) => x.participaciones.includes(p))?.origen} → … · <b>{p.carrier}</b> · primario · v{p.adjudicada?.numero} ·{" "}
            {dinero(p.versiones.find((v) => v.numero === p.adjudicada?.numero)?.tarifaAllIn)} · <span className="mono">#{p.adjudicada?.huella.slice(0, 8)}</span>
          </p>
        ))}
        {(entrega.operationId || recibo) && (
          <p>
            Operación <span className="mono">{(recibo?.operationId ?? entrega.operationId)?.slice(0, 8)}…</span> · se reutiliza en cada reintento
          </p>
        )}
        {recibo && (
          <p>
            Recibo {fecha(recibo.momento)} · {recibo.insertados} fila(s) insertada(s) · {recibo.enRevision} en <span className="mono">pending_review</span>
            {recibo.conservadosAprobados > 0 && <> · {recibo.conservadosAprobados} conservada(s) como aprobada(s)</>}
          </p>
        )}
        {r.entregaConfirmada && !recibo && <p>Rateware ya tiene esta entrega (evento entregado y primarios con cierre registrado).</p>}
        {r.entregaConfirmada && <p className="nota">La tarifa queda en Revisión de Rateware. Fr8Bid no la aprueba (I6).</p>}
        {entrega.error && entrega.estado !== "confirmada" && <div className="estado estado-error">{entrega.error}</div>}

        {!r.entregaConfirmada && decidido && ctx.rol === "admin" && (
          <div className="fila-botones">
            {entrega.estado === "sin_preparar" || entrega.estado === "rechazada" ? (
              <button className="btn-secundario" onClick={() => setEntrega(s.api.prepararEntrega(d))}>Preparar entrega</button>
            ) : entrega.estado === "incierta" ? (
              <Confirmar etiqueta="Reintentar con la misma operación" advertencia={<>Mismo operation_id: si Rateware ya la guardó, devuelve el recibo original. {ADVERTENCIA_REAL(s, d)}</>} onConfirmar={() => confirmar(entrega.operationId!)} />
            ) : entrega.estado === "preparada" ? (
              <Confirmar etiqueta="Confirmar entrega a Rateware" advertencia={ADVERTENCIA_REAL(s, d)} onConfirmar={() => confirmar(entrega.operationId!)} />
            ) : null}
          </div>
        )}
        {!decidido && <p className="tenue">Requiere adjudicación de todas las rutas.</p>}
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
          etiqueta="Generar borradores en la Cola de Rateware"
          clase="btn-secundario"
          advertencia={<>Rateware prepara un borrador por carrier que participó (adjudicado o no). No envía nada. {ADVERTENCIA_REAL(s, d)}</>}
          onConfirmar={() => accion(() => s.api.generarAvisosAdjudicacion(d.evento.id), "Borradores generados en la Cola de Rateware.")}
        />
      )}
      {prims.map((p) => {
        const a = avisoDe(d, p.id, "adjudicacion");
        if (!a) return null;
        const candados = candadosAviso(d, a, ctx);
        return (
          <div key={a.id} className="dos-columnas">
            <div className="aviso-caja">
              <div className="fila">
                <b>{p.carrier}</b>
                <span className="pill">{a.estado}</span>
              </div>
              <p className="tenue">Para: {a.destinatario} · Canal: Gmail · sales@heymarksman.com · versión {fecha(a.version)}</p>
              <p><b>{a.asunto}</b></p>
              <p className="texto-aviso">{a.cuerpo}</p>
              {a.reciboProveedor && <p className="tenue">Gmail aceptó el mensaje · id {a.reciboProveedor}</p>}
              {ctx.rol === "admin" && (a.estado === "borrador" || a.estado === "fallido") && (
                <Confirmar
                  etiqueta="Aprobar este texto exacto y enviar por Gmail"
                  deshabilitado={!candados.every((c) => c.ok)}
                  advertencia={<>Se envía a {a.destinatario} exactamente esta versión. Si alguien la cambia en la Cola antes, Rateware la rechaza y la vuelves a revisar. {ADVERTENCIA_REAL(s, d)}</>}
                  onConfirmar={() => accion(() => s.api.enviarAvisos(d.evento.id, [a]), "Aviso aceptado por Gmail.")}
                />
              )}
              <p className="nota">El texto se edita en la Cola de Rateware; al volver, Fr8Bid muestra la versión nueva. Gmail llega hasta «aceptado»; un rebote se muestra aquí.</p>
            </div>
            <aside className="lado">
              <Candados lista={candados} />
            </aside>
          </div>
        );
      })}
      {otros.length > 0 && (
        <p className="nota">
          Rateware también preparó {otros.length} aviso(s) de no adjudicación o respaldo ({otros.map((a) => a.destinatario).join(", ")}). Se revisan y envían desde la Cola de Rateware.
        </p>
      )}
    </div>
  );
}

function PanelLoads({ d }: { d: Detalle }) {
  const prims = d.rutas.map(primario).filter(Boolean) as Participacion[];
  return (
    <div className="tarjeta">
      <h2>Visible en Loads</h2>
      {prims.map((p) => {
        const proy = proyeccionLoads(d, p.id);
        return (
          <div key={p.id}>
            <p>
              <b>{p.carrier}</b> {proy ? "ve «adjudicado» en su libro de Loads." : "todavía no lo ve: falta el recibo."}
            </p>
            {proy && <pre className="mono codigo">{JSON.stringify(proy, null, 2)}</pre>}
          </div>
        );
      })}
      {!prims.length && <p className="tenue">Sin primario todavía.</p>}
      <p className="nota">Requiere L1 en Loads: mostrar «adjudicado» solo con rateware_closeout_at. Hoy Loads lee las mismas filas de Rateware; esta proyección es lo que es seguro mostrar.</p>
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
            <li>Loads · {p.entregadaEn ? "visible" : "pendiente"}</li>
          </ol>
        );
      })}
    </div>
  );
}
