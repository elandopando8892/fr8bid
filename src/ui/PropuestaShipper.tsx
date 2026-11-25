// Propuesta al shipper en la página del evento (decisión de Jose, 25-nov-2026:
// «Publicar tras adjudicar»). Con todas las rutas decididas, el Administrador
// publica la tarifa de venta por ruta en la liga que el shipper ya tiene (la de
// su solicitud) y ahí la acepta por ruta o todas. El shipper nunca ve carrier ni
// costo. Las rutas y la venta las vuelve a calcular el servidor al publicar.

import { useCallback, useEffect, useState } from "react";
import { propuestaDelEvento, textoFaltan, type PropuestaPublicada } from "../dominio/propuesta";
import { hoyMexico, type Contexto } from "../dominio/recorrido";
import type { Detalle } from "../dominio/tipos";
import { Confirmar, dinero, fecha } from "./comun";
import { useSesion } from "./sesion";
import * as I from "./Iconos";

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

  const cargar = useCallback(async () => {
    try {
      const r = await s.api.propuestaShipper(d.evento.id);
      setEstado({ cargando: false, error: null, ...r });
    } catch (e) {
      setEstado({ cargando: false, error: (e as Error).message, conSolicitud: false, propuesta: null });
    }
  }, [s.api, d.evento.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  const calculada = propuestaDelEvento(d);
  if (estado.cargando) return null;
  const { propuesta } = estado;
  const aceptadas = new Map((propuesta?.aceptadas ?? []).map((a) => [a.rutaId, a]));
  const ventaPublicada = new Map((propuesta?.lineas ?? []).map((l) => [l.rutaId, l.venta]));
  // La adjudicación cambió después de publicar: lo publicado ya no coincide.
  const distinta = Boolean(propuesta) && (
    propuesta!.lineas.length !== calculada.lineas.length ||
    calculada.lineas.some((l) => ventaPublicada.get(l.rutaId) !== l.venta)
  );
  const puedePublicar = ctx.rol === "admin" && estado.conSolicitud && !calculada.faltan.length && calculada.lineas.length > 0 && aceptadas.size === 0 && (!propuesta || distinta);

  return (
    <div className="tarjeta" data-prueba="propuesta-shipper">
      <div className="fila">
        <h2 className="fila-icono"><I.Sobre size={17} />Propuesta al shipper</h2>
        {propuesta && <span className="pill">{aceptadas.size ? `aceptó ${aceptadas.size} de ${propuesta.lineas.length}` : `publicada v${propuesta.version}`}</span>}
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
          <table className="tabla tabla-compacta">
            <thead>
              <tr><th>Ruta</th><th>Equipo</th><th>Tarifa de venta</th>{propuesta && <th>Shipper</th>}</tr>
            </thead>
            <tbody>
              {(propuesta && !distinta ? propuesta.lineas.map((l) => ({ rutaId: l.rutaId, numero: l.numero, origen: l.origen, destino: l.destino, equipo: d.rutas.find((r) => r.id === l.rutaId)?.equipo ?? "", venta: l.venta, moneda: propuesta.moneda })) : calculada.lineas).map((l) => {
                const a = aceptadas.get(l.rutaId);
                return (
                  <tr key={l.rutaId}>
                    <td>{l.numero ? `${l.numero} · ` : ""}{l.origen} → {l.destino}</td>
                    <td>{l.equipo}</td>
                    <td className="mono">{dinero(l.venta, l.moneda)}</td>
                    {propuesta && <td>{a ? <span className="pill ok">aceptó {fecha(a.en)}{a.por ? ` · ${a.por}` : ""}</span> : <span className="tenue">pendiente</span>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {calculada.desiertas > 0 && <p className="tenue">{calculada.desiertas === 1 ? "1 ruta desierta no va" : `${calculada.desiertas} rutas desiertas no van`} en la propuesta.</p>}
          {calculada.faltan.length > 0 && <p className="tenue fila-icono"><I.Candado size={15} />Antes de publicar: {textoFaltan(calculada.faltan)}.</p>}
          {distinta && aceptadas.size === 0 && <p className="nota">La adjudicación cambió después de publicar. Vuelve a publicar para que el shipper vea las tarifas de hoy.</p>}
          {distinta && aceptadas.size > 0 && <p className="nota">La adjudicación cambió, pero el shipper ya aceptó rutas de la propuesta publicada. Habla con él antes de cambiar algo.</p>}
          {puedePublicar && (
            <div className="fila-botones">
              <label className="campo"><span>Vigente hasta</span><input type="date" value={vigencia} min={hoy} onChange={(e) => setVigencia(e.target.value)} /></label>
              <Confirmar
                etiqueta={propuesta ? "Volver a publicar" : "Publicar al shipper"}
                advertencia={
                  <>
                    El shipper verá {calculada.lineas.length === 1 ? "1 ruta" : `${calculada.lineas.length} rutas`} con su tarifa de venta en la liga de su solicitud y podrá aceptarlas. No se le manda correo: avísale tú.{" "}
                    {s.modo === "simulado" ? "Rateware simulado: nada sale de este navegador." : "Esto escribe en rateware-prod."}
                  </>
                }
                onConfirmar={() =>
                  accion(async () => {
                    const r = await s.api.publicarPropuesta(d.evento.id, vigencia || null);
                    setEstado({ cargando: false, error: null, ...r });
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
