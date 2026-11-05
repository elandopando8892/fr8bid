// Inicio del equipo, como «Hoy» de Fr8Growth: un siguiente paso grande, lo
// demás que te espera y lo que está en manos de los carriers.
import { hoyMexico } from "../dominio/recorrido";
import type { ResumenEvento } from "../dominio/tipos";
import { Desactualizado, EstadoVista, fecha, ir, Liga, plural, Prueba } from "./comun";
import { useEventosCompartidos } from "./Eventos";
import { cuantasRutas, grupoDe, nombreEvento, porUrgencia, resumenRutas, siguiente } from "./eventosVista";
import * as I from "./Iconos";
import { useSesion } from "./sesion";

function saludo(ahora = new Date()) {
  const h = Number(ahora.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Mexico_City" }));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

const detalleRutas = (e: ResumenEvento) => {
  const n = cuantasRutas(e);
  return [resumenRutas(e.rutas) || null, n > 1 || (!e.rutas.length && n) ? plural(n, "ruta") : null].filter(Boolean).join(" · ");
};

function porQue(e: ResumenEvento): string {
  const s = siguiente(e).accion;
  if (s === "Adjudicar y entregar") return `Cerrado a ofertas con ${plural(e.ofertas, "oferta")}. Elige primario y respaldo por ruta y entrégalo a Rateware.`;
  if (s === "Cerrar a ofertas") return `Ya respondieron todos (${e.ofertas} de ${e.participaciones}). Puedes cerrar antes del plazo.`;
  if (s === "Avisar a los carriers") return "Entregado a Rateware. Falta aprobar los avisos a los carriers.";
  if (s === "Publicar e invitar") return `Sigue en borrador${e.plazo ? `; el plazo es el ${fecha(e.plazo)}` : ""}. Los carriers no pueden ofertar hasta publicarlo.`;
  return "";
}

export function Hoy() {
  const { rol, modo, correo } = useSesion();
  const { carga, leer } = useEventosCompartidos();
  const eventos = carga.tipo === "ok" ? carga.datos : [];
  const hoy = hoyMexico();
  const esAdmin = rol === "admin";
  const tuyos = eventos.filter((e) => grupoDe(e, hoy, esAdmin) === "te_toca").sort(porUrgencia);
  const enCarriers = eventos.filter((e) => grupoDe(e, hoy, esAdmin) === "carriers").sort((a, b) => (a.plazo || "9999").localeCompare(b.plazo || "9999"));
  const viejos = eventos.filter((e) => grupoDe(e, hoy, esAdmin) === "borradores_viejos").length;
  const pruebas = eventos.filter((e) => e.prueba).length;
  const [primero, ...resto] = tuyos;
  const puedeCrear = modo === "rateware" && rol !== "viewer";

  return (
    <section className="pagina hoy">
      <header className="cabecera">
        <div>
          <p className="miga">Hoy</p>
          <h1>{saludo()}</h1>
          {correo && <p className="tenue">{correo}</p>}
        </div>
      </header>
      {carga.tipo === "ok" && <Desactualizado leidoEn={carga.leidoEn} actualizar={leer} />}
      <EstadoVista carga={carga} reintentar={leer} />
      {carga.tipo === "ok" && (
        <div className="hoy-columna">
          {primero ? (
            <div className="tarjeta siguiente-paso">
              <div className="ceja">Evento RFx · siguiente paso</div>
              <h2>{nombreEvento(primero)}</h2>
              <p className="tenue">
                {[primero.shipper !== "—" && !nombreEvento(primero).includes(primero.shipper) ? primero.shipper : null, detalleRutas(primero) || null, `folio ${primero.folio}`].filter(Boolean).join(" · ")}
                {primero.prueba && <> <Prueba /></>}
              </p>
              <p>{porQue(primero)}</p>
              <div>
                <button className="btn-primario grande" onClick={() => ir(`/eventos/${primero.id}`)}>
                  {siguiente(primero).accion} <I.Flecha size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="tarjeta siguiente-paso tranquilo">
              <div className="ceja">Al día</div>
              <h2>{esAdmin ? "Ningún evento espera una decisión tuya" : "Nada pendiente para tu rol"}</h2>
              <p className="tenue">{enCarriers.length ? `${plural(enCarriers.length, "evento")} ${enCarriers.length === 1 ? "espera" : "esperan"} ofertas de los carriers.` : "No hay eventos abiertos."}</p>
              {puedeCrear && (
                <div>
                  <Liga a="/rfx/new" className="btn-primario grande">
                    <I.Mas size={16} /> Nuevo evento
                  </Liga>
                </div>
              )}
            </div>
          )}

          {resto.length > 0 && (
            <div className="tarjeta">
              <h3 className="fila-icono"><I.Mano size={16} />También te toca</h3>
              {resto.slice(0, 8).map((e) => (
                <Liga key={e.id} a={`/eventos/${e.id}`} className="pendiente">
                  <span className="crece">
                    <b>{nombreEvento(e)}</b>
                    <span className="tenue"> · {detalleRutas(e) || e.folio}{e.plazo ? ` · plazo ${fecha(e.plazo)}` : ""}</span>
                  </span>
                  <span className="pendiente-cta">{siguiente(e).accion} <I.Flecha size={14} /></span>
                </Liga>
              ))}
              {resto.length > 8 && (
                <Liga a="/eventos" className="pendiente mas">
                  <span className="crece tenue">{plural(resto.length - 8, "evento")} más</span>
                  <span className="pendiente-cta">Ver en Eventos <I.Flecha size={14} /></span>
                </Liga>
              )}
            </div>
          )}

          {enCarriers.length > 0 && (
          <div className="tarjeta">
            <h3 className="fila-icono"><I.Reloj size={16} />Esperando a los carriers</h3>
            {enCarriers.slice(0, 8).map((e) => (
                <Liga key={e.id} a={`/eventos/${e.id}`} className="pendiente">
                  <span className="crece">
                    <b>{nombreEvento(e)}</b>
                    <span className="tenue"> · {detalleRutas(e) || e.folio}</span>
                  </span>
                  <span className="mono tenue pendiente-dato">{e.ofertas}/{e.participaciones} ofertas · plazo {fecha(e.plazo)}</span>
                </Liga>
              ))}
          </div>
          )}

          <div className="atajos">
            {puedeCrear && (
              <Liga a="/rfx/new" className="atajo">
                <I.Martillo size={18} /> <span><b>Nuevo evento RFx</b><span className="tenue">Rutas, carriers, ofertas y adjudicación</span></span>
              </Liga>
            )}
            <Liga a="/quotedesk" className="atajo">
              <I.Calculadora size={18} /> <span><b>QuoteDesk</b><span className="tenue">Cotiza un spot con tarifario y margen</span></span>
            </Liga>
            <Liga a="/crm" className="atajo">
              <I.Camion size={18} /> <span><b>Carrier CRM</b><span className="tenue">Ficha, etapa y contacto de cada carrier</span></span>
            </Liga>
          </div>
          {(viejos > 0 || pruebas > 0) && (
            <p className="nota">
              No cuentan como pendientes: {[viejos ? `${plural(viejos, "borrador")} con el plazo vencido` : null, pruebas ? `${plural(pruebas, "evento")} de prueba` : null].filter(Boolean).join(" y ")}. <Liga a="/eventos">Verlos en Eventos</Liga>.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
