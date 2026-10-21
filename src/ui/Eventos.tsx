import { useCallback, useEffect, useState } from "react";
import type { ResumenEvento } from "../dominio/tipos";
import { aCarga, Desactualizado, EstadoVista, fecha, Liga, Prueba, type Carga } from "./comun";
import { useSesion } from "./sesion";

const SIGUIENTE: Record<ResumenEvento["estado"], { accion: string; quien: string }> = {
  borrador: { accion: "Aprobar invitaciones", quien: "Administrador" },
  abierto: { accion: "Esperar ofertas o cerrar", quien: "Carriers" },
  cerrado: { accion: "Adjudicar", quien: "Administrador" },
  adjudicado: { accion: "Aviso y Loads", quien: "Administrador" },
  archivado: { accion: "—", quien: "—" }
};

export function Eventos() {
  const { api, rol, listo } = useSesion();
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
  const teToca = eventos.filter((e) => SIGUIENTE[e.estado].quien === "Administrador" && rol === "admin").length;

  return (
    <section>
      <header className="cabecera">
        <div>
          <p className="miga">Bid Room</p>
          <h1>Eventos</h1>
        </div>
      </header>
      {carga.tipo === "ok" && (
        <div className="contadores">
          <span>Te toca: <b>{teToca}</b></span>
          <span>Esperando carriers: <b>{eventos.filter((e) => e.estado === "abierto").length}</b></span>
          <span>Entregados: <b>{eventos.filter((e) => e.estado === "adjudicado").length}</b></span>
        </div>
      )}
      {carga.tipo === "ok" && <Desactualizado leidoEn={carga.leidoEn} actualizar={leer} />}
      <EstadoVista carga={carga} reintentar={leer} vacio={carga.tipo === "ok" && !eventos.length ? "Aún no hay eventos en tu organización." : undefined} />
      {carga.tipo === "ok" && eventos.length > 0 && (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Evento</th>
                <th>Ofertas</th>
                <th>Siguiente paso</th>
                <th>Quién</th>
                <th>Plazo</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="mono"><Liga a={`/eventos/${e.id}`}>{e.folio}</Liga></td>
                  <td>
                    {e.prueba && <Prueba />} <Liga a={`/eventos/${e.id}`}>{e.rutas.join(" · ") || e.nombre}</Liga>
                    <div className="tenue">{e.shipper}</div>
                  </td>
                  <td>{e.ofertas} de {e.participaciones}</td>
                  <td>{SIGUIENTE[e.estado].accion}</td>
                  <td>{SIGUIENTE[e.estado].quien === "Administrador" && rol === "admin" ? <b>Tú</b> : SIGUIENTE[e.estado].quien}</td>
                  <td>{fecha(e.plazo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="nota">Se muestran solo eventos de tu organización. Los eventos protegidos (regla I12) no se listan.</p>
    </section>
  );
}
