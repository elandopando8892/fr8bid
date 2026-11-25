// Propuesta al shipper en la página del evento (decisión de Jose, 25-nov-2026:
// «Publicar tras adjudicar»). Con todas las rutas decididas, el Administrador
// publica la tarifa de venta por ruta en la liga que el shipper ya tiene (la de
// su solicitud) y ahí la acepta por ruta o todas. El shipper nunca ve carrier ni
// costo. Las rutas y la venta las vuelve a calcular el servidor al publicar.

import { useCallback, useEffect, useRef, useState } from "react";
import { compararPropuesta, huellaPropuesta, propuestaDelEvento, textoFaltan, type PropuestaPublicada } from "../dominio/propuesta";
import { hoyMexico, type Contexto } from "../dominio/recorrido";
import type { Detalle } from "../dominio/tipos";
import { Confirmar, dinero, fecha } from "./comun";
import { useSesion } from "./sesion";
import * as I from "./Iconos";
import { recargarAlVolver, turnos } from "./recargaAlVolver";

type Estado = { cargando: true } | { cargando: false; error: string | null; conSolicitud: boolean; propuesta: PropuestaPublicada | null };

const enDias = (hoy: string, dias: number) => {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

export function PanelPropuesta({ d, ctx, accion }: { d: Detalle; ctx: Contexto; accion: <T>(f: () => Promise<T>, ok?: string | ((r: T) => string)) => Promise<void> }) {
  const s = useSesion();
  const [estado, setEstado] = useState<Estado>({ cargando: true });
  const hoy = hoyMexico();
  const [vigencia, setVigencia] = useState(() => enDias(hoy, 30));

  // Solo la última lectura (o publicación) cuenta: una respuesta vieja se descarta.
  const turno = useRef(turnos()).current;
  const cargar = useCallback(async () => {
    const t = turno.pedir();
    try {
      const r = await s.api.propuestaShipper(d.evento.id);
      if (turno.vigente(t)) setEstado({ cargando: false, error: null, ...r });
    } catch (e) {
      if (turno.vigente(t)) setEstado({ cargando: false, error: (e as Error).message, conSolicitud: false, propuesta: null });
    }
  }, [s.api, d.evento.id, turno]);
  useEffect(() => { void cargar(); }, [cargar]);
  // Lo que el shipper acepta mientras el panel está abierto aparece al volver a la pestaña
  // (o con «Actualizar»): el equipo no trabaja sobre aceptaciones viejas.
  useEffect(() => recargarAlVolver(() => void cargar(), window, document), [cargar]);

  const calculada = propuestaDelEvento(d);
  if (estado.cargando) return null;
  const { propuesta } = estado;
  const aceptadas = new Map((propuesta?.aceptadas ?? []).map((a) => [a.rutaId, a]));
  const cmp = compararPropuesta(calculada, propuesta, hoy);
  const puedePublicar = ctx.rol === "admin" && !estado.error && estado.conSolicitud && cmp.puedePublicar;
  // Siempre lo publicado (con lo aceptado); antes de publicar, lo calculado.
  const filas: Fila[] = propuesta
    ? propuesta.lineas.map((l) => ({ rutaId: l.rutaId, numero: l.numero, origen: l.origen, destino: l.destino, equipo: l.equipo, caja: l.caja, servicio: l.servicio, volumenSemanal: l.volumenSemanal, venta: l.venta, moneda: propuesta.moneda }))
    : calculada.lineas;

  return (
    <div className="tarjeta" data-prueba="propuesta-shipper">
      <div className="fila">
        <h2 className="fila-icono"><I.Sobre size={17} />Propuesta al shipper</h2>
        {propuesta && <span className="pill">{aceptadas.size ? `aceptó ${aceptadas.size} de ${propuesta.lineas.length}` : `publicada v${propuesta.version}`}</span>}
        {(estado.conSolicitud || estado.error) && <button type="button" className="btn-texto" onClick={() => void cargar()}>{estado.error ? "Reintentar" : "Actualizar"}</button>}
      </div>
      {estado.error && <div className="estado estado-error">{estado.error}</div>}
      {!estado.error && !estado.conSolicitud && (
        <p className="tenue">Este evento no salió de una solicitud del shipper, así que no tiene liga donde publicar. Mándale el Excel «para el shipper» del comparativo.</p>
      )}
      {estado.conSolicitud && (
        <>
          {propuesta ? (
            <p className="tenue">
              Publicada el {fecha(propuesta.publicadaEn)}{propuesta.vigenteHasta ? <> · vigente hasta el {fecha(propuesta.vigenteHasta)}</> : null}. El shipper la ve en la liga de su solicitud.
            </p>
          ) : (
            <p className="tenue">El shipper verá en la liga de su solicitud la tarifa de venta por ruta, sin carrier ni costo, y podrá aceptarla por ruta o todas.</p>
          )}
          <TablaPropuesta filas={filas} aceptadas={propuesta ? aceptadas : null} />
          {calculada.desiertas > 0 && <p className="tenue">{calculada.desiertas === 1 ? "1 ruta desierta no va" : `${calculada.desiertas} rutas desiertas no van`} en la propuesta.</p>}
          {calculada.faltan.length > 0 && <p className="tenue fila-icono"><I.Candado size={15} />Antes de publicar: {textoFaltan(calculada.faltan)}.</p>}
          {cmp.distinta && (
            <div className="nota" data-prueba="propuesta-cambios">
              <p>
                {cmp.tocaAceptadas
                  ? "La adjudicación cambió en rutas que el shipper ya aceptó (arriba, lo que él ve). Habla con él antes de cambiar algo; con la adjudicación de hoy quedaría:"
                  : "La adjudicación cambió después de publicar. Arriba está lo que ve el shipper; vuelve a publicar para que vea lo de hoy (lo que ya aceptó se queda aceptado):"}
              </p>
              <ul>
                {cmp.cambios.map((c) => (
                  <li key={c.rutaId}>
                    {c.numero ? `${c.numero} · ` : ""}{c.origen} → {c.destino}:{" "}
                    {c.antes === null ? "no estaba publicada" : c.antes === c.ahora ? "cambiaron número, ruta, equipo, caja, servicio o volumen" : `${dinero(c.antes, propuesta!.moneda)} → ${dinero(c.ahora, c.moneda)}`}
                    {c.antes !== null && c.antes !== c.ahora && c.terminos ? " (y cambiaron número, ruta, equipo, caja, servicio o volumen)" : ""}
                    {c.aceptada ? " · ya aceptada" : ""}
                  </li>
                ))}
                {cmp.moneda && <li>La moneda cambió: {cmp.moneda.antes} → {cmp.moneda.ahora}{aceptadas.size ? " (y el shipper ya aceptó rutas en la moneda anterior)" : ""}.</li>}
                {cmp.quitadas.length > 0 && <li>{cmp.quitadas.length === 1 ? `La ruta ${cmp.quitadas[0].numero || ""} ya no va` : `Las rutas ${cmp.quitadas.map((q) => q.numero).join(", ")} ya no van`} en la propuesta.</li>}
              </ul>
            </div>
          )}
          {cmp.vencida && !cmp.distinta && <p className="nota">La vigencia ya pasó y el shipper ya no puede aceptar. Vuelve a publicar con una fecha nueva para renovarla{aceptadas.size ? "; lo que ya aceptó se queda aceptado" : ""}.</p>}
          {puedePublicar && propuesta && (
            <div data-prueba="propuesta-nueva">
              <p className="tenue">Lo que verá el shipper si vuelves a publicar{aceptadas.size ? " (lo ya aceptado se queda aceptado)" : ""}:</p>
              <TablaPropuesta filas={calculada.lineas} aceptadas={aceptadas} />
            </div>
          )}
          {puedePublicar && (
            <div className="fila-botones">
              <label className="campo"><span>Vigente hasta</span><input type="date" value={vigencia} min={hoy} onChange={(e) => setVigencia(e.target.value)} /></label>
              <Confirmar
                // Si una lectura cambia lo que se publica (o la versión vigente) con la confirmación
                // abierta, se cierra: se publica solo lo que el Administrador revisó.
                firma={`${huellaPropuesta(calculada)}|${propuesta?.id ?? ""}|${vigencia}`}
                etiqueta={propuesta ? "Volver a publicar" : "Publicar al shipper"}
                advertencia={
                  <>
                    El shipper verá {calculada.lineas.length === 1 ? "1 ruta" : `${calculada.lineas.length} rutas`} con su tarifa de venta en la liga de su solicitud y podrá aceptarlas. No se le manda correo: avísale tú.{" "}
                    {s.modo === "simulado" ? "Rateware simulado: nada sale de este navegador." : "Esto escribe en rateware-prod."}
                  </>
                }
                onConfirmar={() =>
                  accion(async () => {
                    const t = turno.pedir();
                    try {
                      const r = await s.api.publicarPropuesta(d.evento.id, vigencia || null, huellaPropuesta(calculada), propuesta?.id ?? null);
                      if (turno.vigente(t)) setEstado({ cargando: false, error: null, ...r });
                      // Una lectura que salió mientras se publicaba pudo descartar esta respuesta:
                      // se lee otra vez ya publicada, y esa lectura es la última que cuenta.
                      else await cargar();
                    } catch (e) {
                      // Respuesta perdida o rechazo: antes de ofrecer publicar otra vez se lee la
                      // propuesta vigente. Si ya quedó publicada, el botón desaparece; si la lectura
                      // también falla, el panel queda con error y sin botón. Si la lectura llega antes
                      // que el envío perdido, publicar otra vez es seguro: cada envío lleva la versión
                      // que se tenía a la vista y Rateware solo acepta el primero que llega sobre ella
                      // (el otro sale RFX_PROPOSAL_STALE); repetir lo mismo no crea otra versión.
                      await cargar();
                      throw e;
                    }
                  }, "Propuesta publicada en la liga del shipper.")
                }
              />
            </div>
          )}
          {!puedePublicar && ctx.rol !== "admin" && !propuesta && <p className="tenue">Solo el Administrador publica la propuesta.</p>}
        </>
      )}
    </div>
  );
}

type Fila = { rutaId: string; numero: number | null; origen: string; destino: string; equipo: string; caja: string; servicio: string; volumenSemanal: number | null; venta: number; moneda: string };

// Ruta, equipo, volumen y venta: lo que el shipper ve (sin carrier ni costo).
function TablaPropuesta({ filas, aceptadas }: { filas: Fila[]; aceptadas: Map<string, { en: string; por: string | null }> | null }) {
  return (
    <table className="tabla tabla-compacta">
      <thead>
        <tr><th>Ruta</th><th>Equipo</th><th>Volumen</th><th>Tarifa de venta</th>{aceptadas && <th>Shipper</th>}</tr>
      </thead>
      <tbody>
        {filas.map((l) => {
          const a = aceptadas?.get(l.rutaId);
          return (
            <tr key={l.rutaId}>
              <td>{l.numero ? `${l.numero} · ` : ""}{l.origen} → {l.destino}</td>
              <td>{[l.equipo, l.caja, l.servicio].filter(Boolean).join(" · ") || "—"}</td>
              <td>{l.volumenSemanal ?? "—"}</td>
              <td className="mono">{dinero(l.venta, l.moneda)}</td>
              {aceptadas && <td>{a ? <span className="pill ok">aceptó {fecha(a.en)}{a.por ? ` · ${a.por}` : ""}</span> : <span className="tenue">pendiente</span>}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
