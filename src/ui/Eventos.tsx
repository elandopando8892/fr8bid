import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ResumenEvento } from "../dominio/tipos";
import { hoyMexico } from "../dominio/recorrido";
import { aCarga, Desactualizado, EstadoVista, fecha, ir, Liga, plural, Prueba, type Carga } from "./comun";
import { cuantasRutas, ESTADO_EVENTO, grupoDe, nombreEvento, porUrgencia, resumenRutas, siguiente, type Grupo } from "./eventosVista";
import * as I from "./Iconos";
import { useSesion } from "./sesion";

// Lectura del listado, compartida por el menú, Hoy y Eventos. Retira los datos
// antes de pintar otra fuente o cuenta y descarta respuestas viejas. Con
// activo=false no lee: la pantalla usa la lectura que el marco ya comparte.
export function useEventos(activo = true) {
  const { api, rol, listo: sesionLista, modo, correo, usuarioSimulado } = useSesion();
  const listo = sesionLista && activo;
  const [carga, setCarga] = useState<Carga<ResumenEvento[]>>({ tipo: "cargando" });
  const secuencia = useRef(0);
  const contexto = JSON.stringify([modo, rol, correo, usuarioSimulado]);
  const dueno = useRef<{ api: typeof api; contexto: string } | null>(null);
  // Retirar datos antes de pintar otra fuente/cuenta, aunque conserve el mismo cliente API.
  useLayoutEffect(() => {
    dueno.current = listo ? { api, contexto } : null;
    secuencia.current++;
    setCarga({ tipo: "cargando" });
    return () => { dueno.current = null; secuencia.current++; };
  }, [api, contexto, listo]);
  const leer = useCallback(async () => {
    if (!listo || dueno.current?.api !== api || dueno.current.contexto !== contexto) return;
    const lectura = ++secuencia.current;
    const vigente = () => secuencia.current === lectura && dueno.current?.api === api && dueno.current.contexto === contexto;
    setCarga({ tipo: "cargando" });
    try {
      const datos = await api.eventos();
      if (vigente()) setCarga({ tipo: "ok", datos, leidoEn: Date.now() });
    } catch (e) {
      if (vigente()) setCarga(aCarga(e));
    }
  }, [api, contexto, listo]);
  useEffect(() => {
    if (listo) void leer();
  }, [listo, leer]);

  return { carga, leer };
}

export type LecturaEventos = ReturnType<typeof useEventos>;
export const ContextoEventos = createContext<LecturaEventos | null>(null);

// La lectura del marco si existe (una sola llamada a Rateware por página); si
// no hay marco, como en las pruebas de navegador, la pantalla lee sola.
export function useEventosCompartidos(): LecturaEventos {
  const compartida = useContext(ContextoEventos);
  const propia = useEventos(!compartida);
  return compartida ?? propia;
}

export function Eventos() {
  const { rol, modo } = useSesion();
  const { carga, leer } = useEventosCompartidos();
  const eventos = carga.tipo === "ok" ? carga.datos : [];
  const esAdmin = rol === "admin";
  const hoy = hoyMexico();
  const [filtro, setFiltro] = useState<Grupo>("todos");
  const [busca, setBusca] = useState("");
  const grupo = (e: ResumenEvento) => grupoDe(e, hoy, esAdmin);
  const cuenta = (g: Grupo) => eventos.filter((e) => grupo(e) === g).length;
  const teToca = cuenta("te_toca");
  const q = busca.trim().toLowerCase();
  const visibles = eventos
    .filter((e) => filtro === "todos" || grupo(e) === filtro)
    .filter((e) => !q || [e.folio, e.nombre, e.shipper, ...e.rutas].some((x) => x.toLowerCase().includes(q)))
    .sort(filtro === "te_toca" || filtro === "todos" ? porUrgencia : (a, b) => (a.plazo || "9999").localeCompare(b.plazo || "9999"));
  const pestanas: { g: Grupo; texto: string; n: number }[] = [
    ...(esAdmin ? [{ g: "te_toca" as Grupo, texto: "Te toca", n: teToca }] : []),
    { g: "carriers", texto: "Esperando carriers", n: cuenta("carriers") },
    { g: "entregados", texto: "Entregados", n: cuenta("entregados") },
    { g: "borradores_viejos", texto: "Borradores vencidos", n: cuenta("borradores_viejos") },
    { g: "pruebas", texto: "Pruebas", n: cuenta("pruebas") },
    { g: "todos", texto: "Todos", n: eventos.length }
  ];
  const vacio: Record<Grupo, string> = {
    te_toca: "Nada te espera: ningún evento necesita una decisión tuya.",
    carriers: "Ningún evento está esperando ofertas.",
    entregados: "Aún no hay eventos entregados a Rateware.",
    borradores_viejos: "No hay borradores con el plazo vencido.",
    pruebas: "No hay eventos de prueba.",
    todos: "Aún no hay eventos en tu organización."
  };

  return (
    <section className="pagina">
      <header className="cabecera">
        <div>
          <p className="miga">Eventos RFx</p>
          <h1>Eventos</h1>
          <p className="tenue">Cada evento es una página: invitar, comparar ofertas, adjudicar y entregar a Rateware.</p>
        </div>
        {modo === "rateware" && rol !== "viewer" && (
          <Liga a="/rfx/new" className="btn-primario">
            <I.Mas size={15} /> Nuevo evento
          </Liga>
        )}
      </header>
      {carga.tipo === "ok" && (
        <div className="barra-filtros">
          <div className="contadores pestanas" role="tablist" aria-label="Filtrar eventos">
            {pestanas.map((p) => (
              <button key={p.g} role="tab" aria-selected={filtro === p.g} className={`pestana ${filtro === p.g ? "activa" : ""}`} onClick={() => setFiltro(p.g)}>
                {p.texto}: <b>{p.n}</b>
              </button>
            ))}
          </div>
          <label className="buscador">
            <I.Lupa size={15} />
            <input type="search" placeholder="Buscar folio, shipper o ciudad…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar eventos" />
          </label>
        </div>
      )}
      {carga.tipo === "ok" && <Desactualizado leidoEn={carga.leidoEn} actualizar={leer} />}
      <EstadoVista carga={carga} reintentar={leer} vacio={carga.tipo === "ok" && !eventos.length ? "Aún no hay eventos en tu organización." : undefined} />
      {carga.tipo === "ok" && eventos.length > 0 && !visibles.length && <div className="estado vacio">{q ? `Nada coincide con «${busca.trim()}».` : vacio[filtro]}</div>}
      {carga.tipo === "ok" && visibles.length > 0 && (
        <div className="tarjeta lista-eventos">
          {visibles.map((e) => {
            const sig = siguiente(e);
            const tuyo = sig.quien === "Administrador" && esAdmin;
            const est = ESTADO_EVENTO[e.estado];
            const n = cuantasRutas(e);
            const rutas = resumenRutas(e.rutas);
            return (
              <div key={e.id} className="fila-evento fila-liga" onClick={(ev) => { if ((ev.target as HTMLElement).closest("a")) return; ir(`/eventos/${e.id}`); }}>
                <div className="fila-evento-principal">
                  <Liga a={`/eventos/${e.id}`}><b>{nombreEvento(e)}</b></Liga>
                  <div className="tenue">
                    {[e.shipper !== "—" && !nombreEvento(e).includes(e.shipper) ? e.shipper : null, rutas || null, n > 1 || (!rutas && n) ? plural(n, "ruta") : null].filter(Boolean).join(" · ")}
                    {e.prueba && <> <Prueba /></>}
                  </div>
                  <div className="folio mono" title={e.folio}>{e.folio}</div>
                </div>
                <div className="fila-evento-dato" data-etiqueta="Estado"><span className={`pill ${est.tono}`}>{est.texto}</span></div>
                <div className="fila-evento-dato" data-etiqueta="Ofertas">
                  <b>{e.ofertas}</b> <span className="tenue">de {e.participaciones}</span>
                </div>
                <div className="fila-evento-dato" data-etiqueta="Plazo">{fecha(e.plazo)}</div>
                <div className="fila-evento-siguiente">
                  <span className={tuyo ? "alerta" : "tenue"}>{sig.accion}</span>
                  {sig.quien !== "—" && <span className="tenue">{tuyo ? "Te toca" : sig.quien === "Carriers" ? "Los carriers" : sig.quien}</span>}
                </div>
                <I.Flecha size={16} className="fila-evento-flecha" />
              </div>
            );
          })}
        </div>
      )}
      <p className="nota">Solo eventos de tu organización.</p>
    </section>
  );
}
