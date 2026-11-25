// «Leer respuesta con IA»: el carrier contestó por correo o WhatsApp. Se pega
// su texto o se sube su cotización (PDF o imagen), la IA propone la oferta por
// ruta y el equipo la revisa. Nada se
// guarda hasta confirmar; cada oferta entra como una versión más.

import { useEffect, useRef, useState } from "react";
import { ErrorApi } from "../cliente/api";
import type { AdjuntoLectura, AnexoTexto, CanalLectura, CorreoTraido, Lectura, TipoAdjunto } from "../dominio/lectura";
import { bytesBase64, MAX_ADJUNTOS_LECTURA, MAX_BYTES_ADJUNTOS, MAX_TEXTO_LECTURA, TIPOS_ADJUNTO } from "../dominio/lectura";
import { cargarLecturas, combinarLecturas, correosPendientes, guardarLecturas, lecturasPorRevisar, type LecturaGuardada } from "../dominio/lecturaAutomatica";
import type { Desenlace } from "../dominio/bandeja";
import type { CorreoRespuesta, Detalle, Participacion, Ruta } from "../dominio/tipos";
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
  guardada: boolean; // este navegador vio que entró como versión: un reintento no la repite
  // Rateware ya tiene una oferta igual capturada por el equipo después del correo: puede ser esta (respuesta
  // perdida, otra persona u otro equipo) o una independiente. Lo decide quien revisa; no se marca sola.
  posibleDuplicado: string | null;
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

const rutasLectura = (d: Detalle) => d.rutas.map((r) => ({ id: r.id, numero: r.numero, origen: r.origen, destino: r.destino, equipo: r.equipo, objetivo: r.objetivo }));
const fecha = (en: string) => new Date(en).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Monterrey" });

// Propuesta de la IA convertida en filas editables, solo en rutas donde ese carrier admite captura.
// Oferta del equipo en Rateware, posterior al correo, con alguno de los importes que este borrador pudo
// guardar (el de la IA, el editado o el de un intento cuya respuesta se perdió). Solo es un indicio.
type Importe = { tarifa: number; moneda: string };
function coincidencia(p: Participacion | null, importes: Importe[], desde: string): string | null {
  if (!p || !desde) return null;
  const v = p.versiones.find((x) => x.fuente === "captura_equipo" && x.creadaEn >= desde && importes.some((i) => i.tarifa === x.tarifaAllIn && i.moneda === x.moneda));
  return v ? `Rateware ya tiene una oferta de ${dinero(v.tarifaAllIn, v.moneda)} capturada por el equipo el ${fecha(v.creadaEn)}, después de este correo. Puede ser esta misma: revisa antes de guardar otra.` : null;
}
const importe = (tarifa: string, moneda: string): Importe[] => {
  const n = Number(tarifa.replace(/,/g, ""));
  return n > 0 && moneda ? [{ tarifa: n, moneda }] : [];
};

// previa: lo que este navegador recuerda de ese correo (rutas que entraron e intentos con su importe).
function aFilas(d: Detalle, l: Lectura, carrierId: string, previa: LecturaGuardada | undefined, desde = ""): Fila[] {
  const guardadas = previa?.rutasGuardadas ?? [];
  return l.ofertas.flatMap((o) => {
    const ruta = d.rutas.find((r) => r.id === o.rutaId);
    if (!ruta) return [];
    const p = ruta.participaciones.find((x) => x.carrierId === carrierId) ?? null;
    const sirve = p && capturable(ruta, p) ? p : null;
    const ya = guardadas.includes(ruta.id);
    const intento = previa?.intentos?.[ruta.id];
    const posible = ya ? null : coincidencia(p, [...importe(o.tarifa === null ? "" : String(o.tarifa), o.moneda || ""), ...(intento ? [intento] : [])], desde);
    return [{
      ruta,
      p: sirve,
      incluir: Boolean(sirve) && o.tarifa !== null && !ya && !posible,
      tarifa: o.tarifa === null ? "" : String(o.tarifa),
      moneda: o.moneda || "",
      vigencia: o.vigencia || "",
      capacidad: o.capacidadSemanal === null ? "" : String(o.capacidadSemanal),
      transito: o.diasTransito === null ? "" : String(o.diasTransito),
      notas: o.notas,
      cita: o.cita,
      dudas: o.dudas,
      guardada: ya,
      posibleDuplicado: posible
    }];
  });
}

// abrir: correo que llega de la bandeja (?respuesta=…); alAbrir lo quita de la dirección una vez atendido.
export function LecturaIA({ d, accion, advertenciaReal, abrir = null, alAbrir }: { d: Detalle; accion: Accion; advertenciaReal: string; abrir?: string | null; alAbrir?: () => void }) {
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
  const [trayendo, setTrayendo] = useState<string | null>(null);
  const [traido, setTraido] = useState<(CorreoTraido & { id: string }) | null>(null);
  const [anexos, setAnexos] = useState<AnexoTexto[]>([]);
  const [leidas, setLeidas] = useState<Record<string, LecturaGuardada>>(() => cargarLecturas(d.evento.id));
  const [leyendoAuto, setLeyendoAuto] = useState<string | null>(null);
  const [revisando, setRevisando] = useState<LecturaGuardada | null>(null);
  // Ya se sumó lo que leyó el servidor: hasta entonces no se sabe si el correo de la bandeja está aquí.
  const [conServidor, setConServidor] = useState(false);
  // Rateware no contestó la lista de borradores: no se lee nada nuevo (se pagaría dos veces) hasta reintentar.
  const [servidorFallo, setServidorFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  // Fecha del correo que se está atendiendo: una oferta igual capturada después ya cuenta como guardada.
  const [desde, setDesde] = useState("");
  // Aviso al llegar de la bandeja; con «quitar», la respuesta se puede retirar de Respuestas sin capturarla.
  const [nota, setNota] = useState<{ texto: string; quitar?: LecturaGuardada } | null>(null);
  const enCurso = useRef(false);

  const carriers = new Map<string, string>();
  for (const r of d.rutas) for (const p of r.participaciones) if (capturable(r, p)) carriers.set(p.carrierId, p.carrier);
  const puedeLeer = s.rol !== "viewer" && ["abierto", "cerrado"].includes(d.evento.estado);

  // Deja la respuesta lista para todo el equipo. Si el servidor no contesta, queda pendiente en este
  // navegador y se reintenta al volver a abrir el evento. false = el servidor no la tiene (la leyó
  // solo este navegador): no está en la bandeja y no hay nada que avisar.
  // desenlace null: Rateware ya la tiene marcada; solo se limpia lo pendiente aquí.
  const avisarEquipo = async (correoId: string, desenlace: Desenlace | null) => {
    let ok = true;
    try {
      if (desenlace) await s.api.marcarLectura(d.evento.id, correoId, desenlace);
    } catch {
      ok = false;
    }
    const previa = cargarLecturas(d.evento.id);
    if (!previa[correoId]) return ok;
    const { marcaPendiente: _, marcaDe: __, ...sin } = previa[correoId];
    const todas = { ...previa, [correoId]: ok || !desenlace ? sin : { ...sin, marcaPendiente: desenlace, marcaDe: s.correo ?? null } };
    guardarLecturas(d.evento.id, todas);
    setLeidas(todas);
    return ok;
  };

  // Lectura automática: Rateware revisa cada 15 min y deja borradores; al abrir el evento se suman y la IA
  // lee aquí solo los correos que falten (hasta 5 por apertura).
  // Solo deja borradores; guardar una oferta sigue pidiendo confirmación.
  useEffect(() => {
    // Cerrado a ofertas (plazo vencido) sigue admitiendo captura: se suman los borradores del servidor,
    // pero la IA solo lee aquí correos nuevos mientras el evento está abierto.
    // Sin carriers capturables igual se suman (para explicar una liga de la bandeja y poder quitarla).
    if (enCurso.current || !puedeLeer) return;
    enCurso.current = true;
    void (async () => {
      // Primero lo que ya leyó la revisión programada de Rateware: no se paga dos veces.
      let servidor;
      try {
        servidor = await s.api.lecturasServidor(d.evento.id);
      } catch {
        setServidorFallo(true);
        enCurso.current = false;
        return;
      }
      setServidorFallo(false);
      const delServidor = combinarLecturas(cargarLecturas(d.evento.id), servidor, carriers);
      guardarLecturas(d.evento.id, delServidor);
      setLeidas(delServidor);
      setConServidor(true);
      // Marcas que no llegaron al equipo la vez pasada. Si Rateware ya la tiene (la respuesta se perdió pero la
      // marca entró) no se escribe nada; si no, la misma cuenta la repite: la marca entra una sola vez.
      for (const g of Object.values(delServidor)) {
        if (!g.marcaPendiente) continue;
        if (servidor.some((f) => f.gmail_message_id === g.correoId && f.reviewed_at)) await avisarEquipo(g.correoId, null);
        else if (g.marcaDe === (s.correo ?? null)) await avisarEquipo(g.correoId, g.marcaPendiente);
        else {
          // La dejó otra cuenta y no llegó al equipo: para esta cuenta sigue por atender (Rateware manda).
          const todas = cargarLecturas(d.evento.id);
          const { marcaPendiente: _, marcaDe: __, ...sin } = todas[g.correoId];
          todas[g.correoId] = { ...sin, revisado: false };
          guardarLecturas(d.evento.id, todas);
          delServidor[g.correoId] = todas[g.correoId];
          setLeidas({ ...delServidor });
        }
      }
      const pendientes = d.evento.estado === "abierto" && carriers.size ? correosPendientes(d, carriers, delServidor) : [];
      for (const x of pendientes) {
        setLeyendoAuto(x.carrier);
        const base = { correoId: x.correo.id, carrierId: x.carrierId, carrier: x.carrier, en: x.correo.en, leidoEn: new Date().toISOString(), revisado: false };
        let registro: LecturaGuardada;
        try {
          const t = await s.api.traerCorreo(d.evento.id, x.correo.id);
          const l = await s.api.leerRespuesta({ texto: t.texto, canal: "email", carrier: x.carrier, adjuntos: t.adjuntos, anexos: t.anexos, rutas: rutasLectura(d) });
          registro = { ...base, lectura: l, fallo: null };
        } catch (e) {
          registro = { ...base, lectura: null, fallo: e instanceof ErrorApi ? e.message : "La IA no pudo leer este correo." };
        }
        const todas = { ...cargarLecturas(d.evento.id), [x.correo.id]: registro };
        guardarLecturas(d.evento.id, todas);
        setLeidas(todas);
      }
      setLeyendoAuto(null);
      enCurso.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.evento.id, d.evento.estado, d.respuestas, s.rol, intento]);

  // Después de cada intento la página relee el evento: lo que Rateware ya tiene (aunque la respuesta se haya
  // perdido) se marca como guardado y no se vuelve a ofrecer.
  useEffect(() => {
    if (!desde) return;
    setFilas((xs) => {
      const nuevas = xs.map((x) => {
        if (x.guardada || x.posibleDuplicado || !x.p) return x;
        const fresca = d.rutas.find((r) => r.id === x.ruta.id)?.participaciones.find((p) => p.id === x.p!.id) ?? null;
        const posible = coincidencia(fresca, importe(x.tarifa, x.moneda), desde);
        return posible ? { ...x, posibleDuplicado: posible, incluir: false } : x;
      });
      return nuevas.some((x, i) => x !== xs[i]) ? nuevas : xs;
    });
  }, [d, desde]);

  // Llegó desde la bandeja: abre ese borrador (o el correo, si la IA no pudo leerlo) una sola vez.
  useEffect(() => {
    if (!abrir || (puedeLeer && !conServidor)) return;
    const g = puedeLeer ? leidas[abrir] : undefined;
    if (s.rol === "viewer") setNota({ texto: "Con el rol Consulta solo se ven las ofertas; la respuesta la atiende alguien del equipo." });
    else if (!puedeLeer) setNota({ texto: "Este evento ya no está abierto a ofertas: esa respuesta ya no se captura aquí." });
    else if (!g) setNota({ texto: "Esa respuesta ya no está entre los borradores de este evento." });
    else if (g.revisado) setNota({ texto: `La respuesta de ${g.carrier} ya quedó lista.` });
    else if (!carriers.has(g.carrierId))
      setNota({ texto: `${g.carrier} ya no admite captura en este evento (tiene primario, declinó o no está invitado). Puedes quitar su respuesta de la bandeja.`, quitar: g });
    else if (g.lectura) revisar(g);
    else {
      setCarrierId(g.carrierId);
      setRevisando(g);
      setError(`${g.fallo || "La IA no pudo leer este correo."} Tráelo de nuevo o pega el texto.`);
      setAbierto(true);
    }
    alAbrir?.();
    // Que se vea sin buscarlo: la etapa de Ofertas es larga.
    requestAnimationFrame(() => document.getElementById("lectura-ia")?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrir, conServidor]);

  const quitarDeBandeja = async (g: LecturaGuardada) => {
    const previa = cargarLecturas(d.evento.id);
    const todas = { ...previa, [g.correoId]: { ...(previa[g.correoId] ?? g), revisado: true } };
    guardarLecturas(d.evento.id, todas);
    setLeidas(todas);
    const ok = await avisarEquipo(g.correoId, "dismissed");
    setNota(ok ? null : { texto: "No se pudo quitar de la bandeja del equipo. Se reintenta la próxima vez que abras este evento." });
  };
  const avisoServidor = servidorFallo && (
    <div id={nota ? undefined : "lectura-ia"} className="estado estado-error" role="alert">
      No se pudieron consultar las respuestas que ya leyó la IA{abrir ? ", así que esa respuesta de la bandeja aún no se abre" : ""}.{" "}
      <button className="btn-texto" onClick={() => setIntento((n) => n + 1)}>Reintentar</button>
    </div>
  );
  const avisoNota = nota && (
    <div id="lectura-ia" className="estado" role="status">
      {nota.texto}{" "}
      {nota.quitar && <button className="btn-texto" onClick={() => void quitarDeBandeja(nota.quitar!)}>Quitar de Respuestas</button>}{" "}
      <button className="btn-texto" onClick={() => setNota(null)}>Entendido</button>
    </div>
  );

  if (s.rol === "viewer" || !carriers.size || d.evento.estado === "adjudicado" || d.evento.estado === "archivado")
    return avisoNota || avisoServidor ? <>{avisoServidor}{avisoNota}</> : null;

  const porRevisar = lecturasPorRevisar(leidas, carriers);
  const revisar = (g: LecturaGuardada) => {
    setCarrierId(g.carrierId);
    setCanal("email");
    setTexto("");
    setAdjuntos([]);
    setAnexos([]);
    setTraido(null);
    setError(null);
    setLectura(g.lectura);
    setDesde(g.en);
    setFilas(aFilas(d, g.lectura!, g.carrierId, cargarLecturas(d.evento.id)[g.correoId], g.en));
    setRevisando(g);
    setAbierto(true);
  };
  if (!abierto)
    return (
      <>
        {avisoServidor}
        {avisoNota}
        {(porRevisar.length > 0 || leyendoAuto) && (
          <div className="aviso-caja">
            <h3>Respuestas por correo leídas por la IA</h3>
            {leyendoAuto && <p className="tenue">Leyendo el correo de {leyendoAuto}…</p>}
            <ul className="sin-margen">
              {porRevisar.map((g) => (
                <li key={g.correoId}>
                  <strong>{g.carrier}</strong> · {fecha(g.en)} · {TIPO[g.lectura!.tipo]}
                  {g.lectura!.ofertas.length > 0 ? ` · ${plural(g.lectura!.ofertas.length, "ruta")}` : ""}{" "}
                  <button className="btn-texto" onClick={() => revisar(g)}>Revisar</button>
                </li>
              ))}
            </ul>
            <p className="tenue">Son borradores: nada se guarda hasta que lo confirmes.</p>
          </div>
        )}
        <p className="sin-margen">
          <button className="btn-texto con-icono" onClick={() => setAbierto(true)}><I.Mas size={14} />Leer con IA una respuesta por correo o WhatsApp</button>
        </p>
      </>
    );

  const carrier = carriers.get(carrierId) || "";
  const limpiar = () => {
    setLectura(null);
    setFilas([]);
    setError(null);
  };
  // Guardar, marcar o descartar deja el borrador listo, aquí y para todo el equipo (bandeja, 25-nov);
  // «Volver» o «Cancelar» solo lo cierran y lo dejan en la lista para después (recorrido 24-nov-2026).
  const cerrar = (desenlace: Desenlace | null = null) => {
    // El correo que se atendió: el borrador abierto o el que se trajo de Gmail para leerlo aquí.
    // Lo traído de Gmail manda: si se cambió de correo después de abrir un borrador, se marca el que se leyó.
    const correoId = traido?.id ?? revisando?.correoId ?? null;
    if (desenlace && correoId) {
      const previa = cargarLecturas(d.evento.id);
      const base: LecturaGuardada = previa[correoId] ?? (revisando?.correoId === correoId ? revisando : null) ?? { correoId, carrierId, carrier: carriers.get(carrierId) || "Carrier", en: new Date().toISOString(), leidoEn: new Date().toISOString(), lectura: null, fallo: null, revisado: false };
      const todas = { ...previa, [correoId]: { ...base, revisado: true, marcaPendiente: desenlace, marcaDe: s.correo ?? null } };
      guardarLecturas(d.evento.id, todas);
      setLeidas(todas);
      void avisarEquipo(correoId, desenlace).then((ok) => {
        if (!ok) setNota({ texto: "Quedó lista aquí, pero no se pudo avisar al equipo. Se reintenta la próxima vez que abras este evento." });
      });
    }
    setRevisando(null);
    limpiar();
    setTexto("");
    setAdjuntos([]);
    setTraido(null);
    setAnexos([]);
    setCarrierId("");
    setDesde("");
    setAbierto(false);
  };

  // Correos con que respondió este carrier (de cualquiera de sus rutas), sin repetir.
  const correos: CorreoRespuesta[] = [];
  for (const r of d.rutas)
    for (const p of r.participaciones)
      if (p.carrierId === carrierId)
        for (const c of d.respuestas?.[p.id]?.correos ?? []) if (!correos.some((x) => x.id === c.id)) correos.push(c);
  correos.sort((a, b) => b.en.localeCompare(a.en));

  const traer = async (c: CorreoRespuesta) => {
    limpiar();
    setTrayendo(c.id);
    try {
      const t = await s.api.traerCorreo(d.evento.id, c.id);
      // Desde aquí se atiende el correo traído, no el borrador con que se abrió el formulario.
      // Si Gmail falla se conserva el borrador: lo que se capture a mano lo deja listo.
      setRevisando(null);
      setDesde(c.en);
      setTraido({ ...t, id: c.id });
      setCanal("email");
      setTexto(t.texto);
      setAdjuntos(t.adjuntos);
      setAnexos(t.anexos);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo traer el correo. Pega el texto.");
    } finally {
      setTrayendo(null);
    }
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
      const l = await s.api.leerRespuesta({ texto, canal, carrier, adjuntos, anexos, rutas: rutasLectura(d) });
      setLectura(l);
      const correoId = traido?.id ?? revisando?.correoId;
      setFilas(aFilas(d, l, carrierId, correoId ? cargarLecturas(d.evento.id)[correoId] : undefined, desde));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "La IA no pudo leer esta respuesta. Captúrala a mano.");
    } finally {
      setLeyendo(false);
    }
  };

  // Se recuerda en este navegador qué rutas de este correo ya entraron, para que reabrir el borrador no las repita.
  // Antes de enviar se anota el importe (si la respuesta se pierde, sirve para reconocerla en Rateware);
  // al confirmar Rateware, la ruta queda como guardada.
  const recordar = (rutaId: string, que: { intento: Importe } | { guardada: true }) => {
    const correoId = traido?.id ?? revisando?.correoId;
    if (!correoId) return;
    const previa = cargarLecturas(d.evento.id);
    const base: LecturaGuardada = previa[correoId] ?? (revisando?.correoId === correoId ? revisando : null) ?? { correoId, carrierId, carrier, en: new Date().toISOString(), leidoEn: new Date().toISOString(), lectura: null, fallo: null, revisado: false };
    const cambio: Partial<LecturaGuardada> =
      "intento" in que
        ? { intentos: { ...(base.intentos ?? {}), [rutaId]: que.intento } }
        : { rutasGuardadas: [...new Set([...(base.rutasGuardadas ?? []), rutaId])] };
    const todas = { ...previa, [correoId]: { ...base, ...cambio } };
    guardarLecturas(d.evento.id, todas);
    setLeidas(todas);
  };
  const cambiar = (i: number, c: Partial<Fila>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...c } : f)));
  const numero = (x: string) => (x.trim() === "" ? null : Number(x));
  const valida = (f: Fila) => Number(f.tarifa.replace(/,/g, "")) > 0 && Boolean(f.moneda) && [f.capacidad, f.transito].every((x) => x.trim() === "" || Number.isFinite(Number(x)));
  const elegidas = filas.filter((f) => f.incluir && f.p && !f.guardada);
  const yaGuardadas = filas.filter((f) => f.guardada).length;
  // Rechazo o pregunta: sale de los intentos en las rutas donde aún no oferta.
  const sinOferta = d.rutas.flatMap((r) => r.participaciones.filter((p) => p.carrierId === carrierId && !p.versiones.length && ["invitada", "vista"].includes(p.estado)));

  return (
    <div id="lectura-ia" className="tarjeta">
      <h2>Leer respuesta con IA</h2>
      <div className="rejilla">
        <label className="campo"><span>Carrier</span>
          <select value={carrierId} onChange={(e) => { setCarrierId(e.target.value); setTraido(null); setAnexos([]); setRevisando(null); setDesde(""); limpiar(); }}>
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
      {correos.length > 0 && (
        <div className="campo">
          <span>Sus correos de respuesta</span>
          <ul className="sin-margen">
            {correos.slice(0, 5).map((c) => (
              <li key={c.id}>
                {fecha(c.en)}
                {c.de ? ` · ${c.de}` : ""}{" "}
                <button className="btn-texto" disabled={Boolean(trayendo) || leyendo} onClick={() => void traer(c)}>
                  {trayendo === c.id ? "Trayendo…" : traido?.id === c.id ? "Traído" : "Traer este correo"}
                </button>
              </li>
            ))}
          </ul>
          {traido && traido.anexos.length > 0 && (
            <p className="tenue">Se trajo también el correo adjunto: {traido.anexos.map((a) => a.nombre).join(", ")}.</p>
          )}
          {traido && traido.omitidos.length > 0 && (
            <p className="tenue">No se trajo: {traido.omitidos.join(", ")}. Si ahí viene la tarifa (por ejemplo, un Excel), captúrala a mano.</p>
          )}
        </div>
      )}
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
          <button className="btn-primario" disabled={!carrierId || (texto.trim().length < 3 && !adjuntos.length && !anexos.length) || leyendo} onClick={leer}>{leyendo ? "Leyendo…" : "Leer con IA"}</button>
          <button className="btn-texto" onClick={() => cerrar()}>Cancelar</button>
          {/* Un correo que la IA no pudo leer (por ejemplo, un Excel) también se puede dar por atendido. */}
          {(revisando || traido) && <button className="btn-texto" onClick={() => cerrar("dismissed")}>Descartar este correo</button>}
        </div>
      )}
      {error && <div className="estado estado-error" role="alert">{error}</div>}

      {lectura && (
        <div className="aviso-caja">
          <h3>Borrador de la IA · {TIPO[lectura.tipo]}</h3>
          {revisando && <p className="tenue">Leído automáticamente del correo del {fecha(revisando.en)}.</p>}
          {lectura.resumen && <p>{lectura.resumen}</p>}
          {lectura.recortado && <p className="tenue">No se leyó el correo citado (nuestra invitación con el objetivo).</p>}
          {lectura.dudas.length > 0 && <ul className="tenue">{lectura.dudas.map((x, i) => <li key={i}>{x}</li>)}</ul>}

          {filas.map((f, i) => (
            <div key={f.ruta.id} className="aviso-caja atencion">
              <label className="fila-icono">
                <input type="checkbox" checked={f.incluir} disabled={!f.p || f.guardada} onChange={(e) => cambiar(i, { incluir: e.target.checked })} />
                <strong>Ruta {f.ruta.numero} · {f.ruta.origen} → {f.ruta.destino}</strong>
              </label>
              {!f.p && <p className="tenue">{carrier} no tiene una invitación capturable en esta ruta.</p>}
              {f.guardada && <p className="tenue">Ya guardada como nueva versión.</p>}
              {!f.guardada && f.posibleDuplicado && <p className="nota" role="note">{f.posibleDuplicado}</p>}
              {f.cita && <p className="tenue">«{f.cita}»</p>}
              {f.dudas.length > 0 && <ul>{f.dudas.map((x, j) => <li key={j}>{x}</li>)}</ul>}
              {f.p && !f.guardada && (
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
                  // Solo queda lista si todo se guardó: con un error el borrador sigue a la vista.
                  let hecho = false;
                  await accion(async () => {
                    // Una por una; cada una que entra se marca, para que un reintento tras un error no la repita.
                    for (const f of elegidas) {
                      recordar(f.ruta.id, { intento: { tarifa: Number(f.tarifa.replace(/,/g, "")), moneda: f.moneda } });
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
                      setFilas((xs) => xs.map((x) => (x.ruta.id === f.ruta.id ? { ...x, guardada: true, incluir: false } : x)));
                      recordar(f.ruta.id, { guardada: true });
                    }
                    hecho = true;
                    return elegidas.length;
                  }, (n) => `${plural(n, "oferta capturada", "ofertas capturadas")}.`);
                  if (hecho) cerrar("captured");
                }}
              />
            )}
            {(lectura.tipo === "rechazo" || lectura.tipo === "pregunta") && sinOferta.length > 0 && (
              <Confirmar
                etiqueta={lectura.tipo === "rechazo" ? "Marcar que rechazó" : "Marcar que respondió"}
                clase="btn-secundario"
                advertencia={`${carrier} queda como ${lectura.tipo === "rechazo" ? "«declinó»" : "«respondió»"} en ${plural(sinOferta.length, "ruta")} y ya no recibe intentos. No se envía nada. ${advertenciaReal}`}
                onConfirmar={async () => {
                  let hecho = false;
                  await accion(async () => {
                    for (const p of sinOferta) await s.api.marcarRespondio({ eventId: d.evento.id, participacionId: p.id, rechazo: lectura.tipo === "rechazo", canal, nota: lectura.resumen.slice(0, 300) });
                    hecho = true;
                    return sinOferta.length;
                  }, () => `${carrier} ya no recibe intentos.`);
                  if (hecho) cerrar(lectura.tipo === "rechazo" ? "declined" : "answered");
                }}
              />
            )}
            {/* Con parte ya guardada no se vuelve a la lista: al reabrir el borrador se podría repetir. */}
            {revisando && !yaGuardadas && <button className="btn-texto" onClick={() => cerrar()}>Volver a la lista</button>}
            <button className="btn-texto" onClick={() => cerrar(yaGuardadas ? "captured" : "dismissed")}>{yaGuardadas ? "Terminar sin guardar las demás" : "Descartar"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
