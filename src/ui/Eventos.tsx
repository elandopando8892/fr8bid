import { useCallback, useEffect, useState } from "react";
import type { ResumenEvento } from "../dominio/tipos";
import { aCarga, Desactualizado, EstadoVista, fecha, ir, Liga, Prueba, type Carga } from "./comun";
import { useSesion } from "./sesion";

// Igual que la Mesa: abierto con todas las ofertas dentro ya no espera a los
// carriers, le toca al Administrador cerrar.
function siguiente(e: ResumenEvento): { accion: string; quien: string } {
  switch (e.estado) {
    case "borrador":
      return { accion: "Publicar e invitar", quien: "Administrador" };
    case "abierto":
      return e.participaciones > 0 && e.ofertas >= e.participaciones ? { accion: "Cerrar a ofertas", quien: "Administrador" } : { accion: "Esperar ofertas", quien: "Carriers" };
    case "cerrado":
      return { accion: "Adjudicar y entregar", quien: "Administrador" };
    case "adjudicado":
      return { accion: "Avisar a los carriers", quien: "Administrador" };
    default:
      return { accion: "—", quien: "—" };
  }
}

export function Eventos() {
  const { api, rol, listo, modo } = useSesion();
  const [carga, setCarga] = useState<Carga<ResumenEvento[]>>({ tipo: "cargando" });
  const leer = useCallback(() => {
    setCarga({ tipo: "cargando" });
    api.eventos().then(
      (datos) => setCarga({ tipo: "ok", datos, leidoEn: Date.now() }),
      (e) => setCarga(aCarga(e))
    );
  }, [api]);
  useEffect(() => {
    if (listo) leer();
  }, [listo, leer]);

  const eventos = carga.tipo === "ok" ? carga.datos : [];
  const teToca = eventos.filter((e) => siguiente(e).quien === "Administrador" && rol === "admin").length;

  return (
    <section>
      <header className="cabecera">
        <h1>Eventos</h1>
        {modo === "rateware" && rol !== "viewer" && (
          <Liga a="/rfx/new" className="btn-primario">
            Nuevo evento
          </Liga>
        )}
      </header>
      {carga.tipo === "ok" && (
        <div className="contadores">
          {rol === "admin" && <span>Te toca: <b>{teToca}</b></span>}
          <span>Esperando carriers: <b>{eventos.filter((e) => e.estado === "abierto").length}</b></span>
          <span>Entregados: <b>{eventos.filter((e) => e.estado === "adjudicado").length}</b></span>
        </div>
      )}
      {carga.tipo === "ok" && <Desactualizado leidoEn={carga.leidoEn} actualizar={leer} />}
      <EstadoVista carga={carga} reintentar={leer} vacio={carga.tipo === "ok" && !eventos.length ? "Aún no hay eventos en tu organización." : undefined} />
      {carga.tipo === "ok" && eventos.length > 0 && (
        <div className="tabla-envoltura">
          <table className="tabla tabla-tarjetas">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Folio</th>
                <th>Ofertas</th>
                <th>Siguiente paso</th>
                <th>Plazo</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => {
                const sig = siguiente(e);
                const tuyo = sig.quien === "Administrador" && rol === "admin";
                return (
                  <tr key={e.id} className="fila-liga" onClick={() => ir(`/eventos/${e.id}`)}>
                    <td>
                      <Liga a={`/eventos/${e.id}`}><b>{e.rutas.join(" · ") || e.nombre}</b></Liga>
                      <div className="tenue">{e.shipper}{e.prueba && <> <Prueba /></>}</div>
                    </td>
                    <td className="mono" data-etiqueta="Folio">{e.folio}</td>
                    <td data-etiqueta="Ofertas">{e.ofertas} de {e.participaciones}</td>
                    <td data-etiqueta="Siguiente">
                      {sig.accion}
                      {sig.quien !== "—" && <div className={tuyo ? "alerta" : "tenue"}>{tuyo ? "Te toca" : sig.quien === "Carriers" ? "Los carriers" : sig.quien}</div>}
                    </td>
                    <td data-etiqueta="Plazo">{fecha(e.plazo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="nota">Solo eventos de tu organización.</p>
    </section>
  );
}
