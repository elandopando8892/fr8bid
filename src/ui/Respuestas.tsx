// Bandeja de respuestas con IA (prioridad 6 del rediseño, 25-nov-2026): lo que los carriers
// contestaron por correo en todos los eventos abiertos, ya leído por la IA, en una sola lista.
// Cada respuesta se revisa en la página de su evento con un botón; al guardar, marcar o
// descartar sale de aquí para todo el equipo.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BOTON_BANDEJA, ligaRespuesta, TIPO_BANDEJA, type RespuestaBandeja } from "../dominio/bandeja";
import { aCarga, Desactualizado, EstadoVista, fecha, Liga, plural, type Carga } from "./comun";
import * as I from "./Iconos";
import { useSesion } from "./sesion";

type Bandeja = { respuestas: RespuestaBandeja[]; hayMas: boolean };

// Una sola lectura vigente: la de esta sesión y fuente, y la última que se pidió.
export function useBandeja(activo = true) {
  const { api, listo: sesionLista, modo, rol, correo, usuarioSimulado } = useSesion();
  const listo = sesionLista && activo;
  const [carga, setCarga] = useState<Carga<Bandeja>>({ tipo: "cargando" });
  const secuencia = useRef(0);
  const contexto = JSON.stringify([modo, rol, correo, usuarioSimulado]);
  useLayoutEffect(() => {
    secuencia.current++;
    setCarga({ tipo: "cargando" });
  }, [api, contexto, listo]);
  const leer = useCallback(async () => {
    if (!listo) return;
    const lectura = ++secuencia.current;
    setCarga({ tipo: "cargando" });
    try {
      const datos = await api.bandejaRespuestas();
      if (secuencia.current === lectura) setCarga({ tipo: "ok", datos, leidoEn: Date.now() });
    } catch (e) {
      if (secuencia.current === lectura) setCarga(aCarga(e));
    }
  }, [api, listo]);
  useEffect(() => {
    if (listo) void leer();
  }, [listo, leer, contexto]);
  // Al volver a la pestaña se relee: otra persona pudo dejar respuestas listas.
  useEffect(() => {
    if (!listo) return;
    const alVolver = () => { if (document.visibilityState === "visible") void leer(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [listo, leer]);
  return { carga, leer };
}

const CLASE_TIPO: Record<RespuestaBandeja["tipo"], string> = { oferta: "pill ok", rechazo: "pill", pregunta: "pill info", otro: "pill", fallo: "pill warn" };

export function Respuestas() {
  const { rol } = useSesion();
  const { carga, leer } = useBandeja();
  const datos = carga.tipo === "ok" ? carga.datos : null;
  const respuestas = datos?.respuestas ?? [];
  const ofertas = respuestas.filter((r) => r.tipo === "oferta").length;
  const consulta = rol === "viewer";

  return (
    <section className="pagina">
      <header className="cabecera">
        <div>
          <h1>Respuestas</h1>
          {respuestas.length > 0 && (
            <p className="tenue">
              {plural(respuestas.length, "respuesta")} por atender{ofertas ? ` · ${plural(ofertas, "trae", "traen")} oferta` : ""}
            </p>
          )}
        </div>
      </header>
      {carga.tipo === "ok" && <Desactualizado leidoEn={carga.leidoEn} actualizar={leer} />}
      <EstadoVista carga={carga} reintentar={leer} />
      {datos && !respuestas.length && (
        <div className="estado vacio">
          <p>No hay respuestas por atender. Cada 15 minutos la IA lee los correos nuevos de los carriers y los deja aquí.</p>
        </div>
      )}
      {respuestas.length > 0 && (
        <div className="tarjeta lista-eventos lista-respuestas">
          {respuestas.map((r) => (
            <div key={`${r.eventoId}:${r.correoId}`} className="fila-evento">
              <div className="fila-evento-principal">
                <div>
                  <b>{r.carrier}</b>{" "}
                  <span className={CLASE_TIPO[r.tipo]}>{TIPO_BANDEJA[r.tipo]}{r.tipo === "oferta" && r.rutas > 0 ? ` en ${plural(r.rutas, "ruta")}` : ""}</span>
                </div>
                <div className="tenue">
                  <Liga a={`/eventos/${r.eventoId}`}>{r.evento}</Liga>
                  {` · ${fecha(r.en)}`}
                </div>
                {(r.fallo ?? r.resumen) && <p className="sin-margen">{r.fallo ?? r.resumen}</p>}
              </div>
              <div className="fila-evento-accion">
                <Liga a={ligaRespuesta(r)} className={r.tipo === "oferta" && !consulta ? "btn-primario" : "btn-secundario"}>
                  {consulta ? "Ver" : BOTON_BANDEJA[r.tipo]} <I.Flecha size={14} />
                </Liga>
              </div>
            </div>
          ))}
        </div>
      )}
      {datos?.hayMas && <p className="nota">Hay más respuestas de las que caben aquí. Atiende estas y la lista se completa sola.</p>}
      {respuestas.length > 0 && !consulta && <p className="nota">Son borradores de la IA: nada se guarda hasta que lo confirmes en la página del evento.</p>}
    </section>
  );
}
