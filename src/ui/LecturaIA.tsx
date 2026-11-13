// «Leer respuesta con IA»: el carrier contestó por correo o WhatsApp. Se pega
// su texto o se sube su cotización (PDF o imagen), la IA propone la oferta por
// ruta y el equipo la revisa. Nada se
// guarda hasta confirmar; cada oferta entra como una versión más.

import { useState } from "react";
import { ErrorApi } from "../cliente/api";
import type { AdjuntoLectura, CanalLectura, Lectura, TipoAdjunto } from "../dominio/lectura";
import { bytesBase64, MAX_ADJUNTOS_LECTURA, MAX_BYTES_ADJUNTOS, MAX_TEXTO_LECTURA, TIPOS_ADJUNTO } from "../dominio/lectura";
import type { Detalle, Participacion, Ruta } from "../dominio/tipos";
import { Confirmar, dinero, plural } from "./comun";
import * as I from "./Iconos";
import { useSesion } from "./sesion";

type Accion = <T>(f: () => Promise<T>, ok?: string | ((r: T) => string)) => Promise<void>;

interface Fila {
  ruta: Ruta;
  p: Participacion | null; // null: el carrier no está invitado en esa ruta
  incluir: boolean;
  tarifa: string;
  moneda: string; // "" = falta elegir
  vigencia: string;
  capacidad: string;
  transito: string;
  notas: string;
  cita: string;
  dudas: string[];
}

const TIPO: Record<Lectura["tipo"], string> = { oferta: "Mandó oferta", rechazo: "Rechazó", pregunta: "Hizo una pregunta", otro: "Sin oferta" };

// Mismas reglas que la captura a mano: sin primario en la ruta y sin rol.
function aBase64(f: File): Promise<string> {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(",")[1] || "");
    lector.onerror = () => mal(lector.error);
    lector.readAsDataURL(f);
  });
}

const capturable = (ruta: Ruta, p: Participacion) => !["preseleccionada", "declino"].includes(p.estado) && !p.rol && !ruta.participaciones.some((x) => x.rol === "primario");

export function LecturaIA({ d, accion, advertenciaReal }: { d: Detalle; accion: Accion; advertenciaReal: string }) {
  const s = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [carrierId, setCarrierId] = useState("");
  const [canal, setCanal] = useState<CanalLectura>("email");
  const [texto, setTexto] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState<(Lectura & { recortado: boolean }) | null>(null);
  const [adjuntos, setAdjuntos] = useState<AdjuntoLectura[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);

  const carriers = new Map<string, string>();
  for (const r of d.rutas) for (const p of r.participaciones) if (capturable(r, p)) carriers.set(p.carrierId, p.carrier);
  if (s.rol === "viewer" || !carriers.size || d.evento.estado === "adjudicado" || d.evento.estado === "archivado") return null;
  if (!abierto)
    return (
      <p className="sin-margen">
        <button className="btn-texto con-icono" onClick={() => setAbierto(true)}><I.Mas size={14} />Leer con IA una respuesta por correo o WhatsApp</button>
      </p>
    );

  const carrier = carriers.get(carrierId) || "";
  const propia = (r: Ruta) => r.participaciones.find((p) => p.carrierId === carrierId) ?? null;
  const limpiar = () => {
    setLectura(null);
    setFilas([]);
    setError(null);
  };
  const cerrar = () => {
    limpiar();
    setTexto("");
    setAdjuntos([]);
    setCarrierId("");
    setAbierto(false);
  };

  const subir = async (archivos: FileList | null) => {
    limpiar();
    const nuevos: AdjuntoLectura[] = [];
    for (const f of Array.from(archivos || [])) {
      if (!TIPOS_ADJUNTO.includes(f.type as TipoAdjunto)) return setError(`«${f.name}» no es PDF, PNG, JPG ni WebP. Si es Excel, captura la oferta a mano.`);
      nuevos.push({ nombre: f.name, tipo: f.type as TipoAdjunto, base64: await aBase64(f) });
    }
    const todos = [...adjuntos, ...nuevos];
    if (todos.length > MAX_ADJUNTOS_LECTURA) return setError(`Sube hasta ${MAX_ADJUNTOS_LECTURA} archivos.`);
    if (todos.reduce((n, a) => n + bytesBase64(a.base64), 0) > MAX_BYTES_ADJUNTOS) return setError("Los archivos pasan de 3 MB entre todos. Sube solo la cotización.");
    setAdjuntos(todos);
  };

  const leer = async () => {
    limpiar();
    setLeyendo(true);
    try {
      const l = await s.api.leerRespuesta({ texto, canal, carrier, adjuntos, rutas: d.rutas.map((r) => ({ id: r.id, numero: r.numero, origen: r.origen, destino: r.destino, equipo: r.equipo })) });
      setLectura(l);
      setFilas(
        l.ofertas.flatMap((o) => {
          const ruta = d.rutas.find((r) => r.id === o.rutaId);
          if (!ruta) return [];
          const p = propia(ruta);
          const sirve = p && capturable(ruta, p) ? p : null;
          return [{
            ruta,
            p: sirve,
            incluir: Boolean(sirve) && o.tarifa !== null,
            tarifa: o.tarifa === null ? "" : String(o.tarifa),
            moneda: o.moneda || "",
            vigencia: o.vigencia || "",
            capacidad: o.capacidadSemanal === null ? "" : String(o.capacidadSemanal),
            transito: o.diasTransito === null ? "" : String(o.diasTransito),
            notas: o.notas,
            cita: o.cita,
            dudas: o.dudas
          }];
        })
      );
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "La IA no pudo leer esta respuesta. Captúrala a mano.");
    } finally {
      setLeyendo(false);
    }
  };

  const cambiar = (i: number, c: Partial<Fila>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...c } : f)));
  const numero = (x: string) => (x.trim() === "" ? null : Number(x));
  const valida = (f: Fila) => Number(f.tarifa.replace(/,/g, "")) > 0 && Boolean(f.moneda) && [f.capacidad, f.transito].every((x) => x.trim() === "" || Number.isFinite(Number(x)));
  const elegidas = filas.filter((f) => f.incluir && f.p);
  // Rechazo o pregunta: sale de los intentos en las rutas donde aún no oferta.
  const sinOferta = d.rutas.flatMap((r) => r.participaciones.filter((p) => p.carrierId === carrierId && !p.versiones.length && ["invitada", "vista"].includes(p.estado)));

  return (
    <div className="tarjeta">
      <h2>Leer respuesta con IA</h2>
      <div className="rejilla">
        <label className="campo"><span>Carrier</span>
          <select value={carrierId} onChange={(e) => { setCarrierId(e.target.value); limpiar(); }}>
            <option value="">Elige…</option>
            {[...carriers].sort((a, b) => a[1].localeCompare(b[1])).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </label>
        <label className="campo"><span>Llegó por</span>
          <select value={canal} onChange={(e) => setCanal(e.target.value as CanalLectura)}>
            <option value="email">Correo</option><option value="whatsapp">WhatsApp</option>
          </select>
        </label>
      </div>
      <label className="campo"><span>Lo que contestó el carrier</span>
        <textarea rows={6} value={texto} maxLength={MAX_TEXTO_LECTURA} placeholder="Pega aquí el correo o el mensaje de WhatsApp" onChange={(e) => { setTexto(e.target.value); limpiar(); }} />
      </label>
      <label className="campo"><span>Su cotización en PDF o imagen (opcional)</span>
        <input type="file" multiple accept={TIPOS_ADJUNTO.join(",")} onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} />
      </label>
      {adjuntos.length > 0 && (
        <ul className="tenue">
          {adjuntos.map((a, i) => (
            <li key={i}>{a.nombre} <button className="btn-texto" onClick={() => { limpiar(); setAdjuntos(adjuntos.filter((_, j) => j !== i)); }}>Quitar</button></li>
          ))}
        </ul>
      )}
      {!lectura && (
        <div className="fila-botones">
          <button className="btn-primario" disabled={!carrierId || (texto.trim().length < 3 && !adjuntos.length) || leyendo} onClick={leer}>{leyendo ? "Leyendo…" : "Leer con IA"}</button>
          <button className="btn-texto" onClick={cerrar}>Cancelar</button>
        </div>
      )}
      {error && <div className="estado estado-error" role="alert">{error}</div>}

      {lectura && (
        <div className="aviso-caja">
          <h3>Borrador de la IA · {TIPO[lectura.tipo]}</h3>
          {lectura.resumen && <p>{lectura.resumen}</p>}
          {lectura.recortado && <p className="tenue">No se leyó el correo citado (nuestra invitación con el objetivo).</p>}
          {lectura.dudas.length > 0 && <ul className="tenue">{lectura.dudas.map((x, i) => <li key={i}>{x}</li>)}</ul>}

          {filas.map((f, i) => (
            <div key={f.ruta.id} className="aviso-caja atencion">
              <label className="fila-icono">
                <input type="checkbox" checked={f.incluir} disabled={!f.p} onChange={(e) => cambiar(i, { incluir: e.target.checked })} />
                <strong>Ruta {f.ruta.numero} · {f.ruta.origen} → {f.ruta.destino}</strong>
              </label>
              {!f.p && <p className="tenue">{carrier} no tiene una invitación capturable en esta ruta.</p>}
              {f.cita && <p className="tenue">«{f.cita}»</p>}
              {f.dudas.length > 0 && <ul>{f.dudas.map((x, j) => <li key={j}>{x}</li>)}</ul>}
              {f.p && (
                <>
                  <div className="rejilla">
                    <label className="campo"><span>Tarifa all-in</span><input inputMode="decimal" value={f.tarifa} onChange={(e) => cambiar(i, { tarifa: e.target.value })} /></label>
                    <label className="campo"><span>Moneda</span>
                      <select value={f.moneda} onChange={(e) => cambiar(i, { moneda: e.target.value })}><option value="">Elige…</option><option>USD</option><option>MXN</option></select>
                    </label>
                    <label className="campo"><span>Vigente hasta</span><input type="date" value={f.vigencia} onChange={(e) => cambiar(i, { vigencia: e.target.value })} /></label>
                    <label className="campo"><span>Capacidad semanal</span><input inputMode="numeric" value={f.capacidad} onChange={(e) => cambiar(i, { capacidad: e.target.value })} /></label>
                    <label className="campo"><span>Tránsito (días)</span><input inputMode="numeric" value={f.transito} onChange={(e) => cambiar(i, { transito: e.target.value })} /></label>
                  </div>
                  <label className="campo"><span>Nota</span><input value={f.notas} maxLength={500} onChange={(e) => cambiar(i, { notas: e.target.value })} /></label>
                </>
              )}
            </div>
          ))}

          <div className="fila-botones">
            {filas.length > 0 && (
              <Confirmar
                etiqueta={`Guardar ${plural(elegidas.length, "oferta")} como nueva versión`}
                deshabilitado={!elegidas.length || !elegidas.every(valida)}
                advertencia={<>{carrier}: {elegidas.map((f) => `ruta ${f.ruta.numero}, ${dinero(Number(f.tarifa.replace(/,/g, "")), f.moneda)}`).join("; ")}. Cada una queda como una versión más; las anteriores no cambian. {advertenciaReal}</>}
                onConfirmar={async () => {
                  await accion(async () => {
                    for (const f of elegidas)
                      await s.api.capturarOferta({
                        eventId: d.evento.id,
                        participacionId: f.p!.id,
                        tarifa: Number(f.tarifa.replace(/,/g, "")),
                        moneda: f.moneda,
                        vigencia: f.vigencia || null,
                        capacidadSemanal: numero(f.capacidad),
                        diasTransito: numero(f.transito),
                        canal,
                        notas: f.notas,
                        leidaConIA: true
                      });
                    return elegidas.length;
                  }, (n) => `${plural(n, "oferta capturada", "ofertas capturadas")}.`);
                  cerrar();
                }}
              />
            )}
            {(lectura.tipo === "rechazo" || lectura.tipo === "pregunta") && sinOferta.length > 0 && (
              <Confirmar
                etiqueta={lectura.tipo === "rechazo" ? "Marcar que rechazó" : "Marcar que respondió"}
                clase="btn-secundario"
                advertencia={`${carrier} queda como ${lectura.tipo === "rechazo" ? "«declinó»" : "«respondió»"} en ${plural(sinOferta.length, "ruta")} y ya no recibe intentos. No se envía nada. ${advertenciaReal}`}
                onConfirmar={async () => {
                  await accion(async () => {
                    for (const p of sinOferta) await s.api.marcarRespondio({ eventId: d.evento.id, participacionId: p.id, rechazo: lectura.tipo === "rechazo", canal, nota: lectura.resumen.slice(0, 300) });
                    return sinOferta.length;
                  }, () => `${carrier} ya no recibe intentos.`);
                  cerrar();
                }}
              />
            )}
            <button className="btn-texto" onClick={cerrar}>Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}
