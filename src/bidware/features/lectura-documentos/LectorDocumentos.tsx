import { useMemo, useRef, useState } from "react";
import { mismoValor, type CampoDocumento, type LecturaDocumentos, type OrigenDocumentos, type ValorLeido } from "../../../dominio/documentos";
import { ACEPTA, leerDocumentos, prepararArchivo, problemaDeTamano, type Elegido, type Lang } from "./documentos.client";

/**
 * «Sube tus documentos y llenamos por ti» (prioridad 8, 26-nov): el carrier o
 * el shipper suelta su constancia, W-9, autoridad MC, póliza, o su correo y
 * su Excel de rutas; la IA propone y la persona confirma qué usa. Lo
 * confirmado entra al formulario como si lo hubiera tecleado: se guarda con
 * el botón de siempre. Los archivos no se guardan.
 */

const COPY = {
  es: {
    titulo: {
      perfil_carrier: "Sube tus documentos y llenamos el perfil por ti",
      perfil_shipper: "Sube tus documentos y llenamos el perfil por ti",
      solicitud: "Pega tu correo o suelta tu archivo tal como lo tienes",
    },
    sub: {
      perfil_carrier: "Constancia de situación fiscal, W-9, autoridad MC/USDOT, póliza de seguro o carta de presentación. Solo confirmas lo que leímos.",
      perfil_shipper: "Constancia de situación fiscal, W-9 o tu carta de presentación. Solo confirmas lo que leímos.",
      solicitud: "Un correo, un Excel en cualquier formato o un PDF. Armamos las rutas y tú solo confirmas.",
    },
    subir: "Subir archivos",
    soltar: "o suéltalos aquí · PDF, foto, Excel o CSV",
    pegar: "Pegar texto",
    pegarAyuda: "Correo o mensaje",
    leer: "Leer",
    leyendo: "Leyendo…",
    quitar: "Quitar",
    revisa: "Revisa lo que leímos",
    ahora: "Ahora",
    usar: (n: number) => (n === 1 ? "Usar este dato" : `Usar estos ${n} datos`),
    agregarRutas: (n: number) => (n === 1 ? "Agregar esta ruta" : `Agregar estas ${n} rutas`),
    descartar: "Descartar",
    nada: "No encontramos datos para este formulario. Prueba con otro documento o llénalo a mano.",
    yaCoinciden: (n: number) => (n === 1 ? "1 dato ya coincidía con tu perfil." : `${n} datos ya coincidían con tu perfil.`),
    revisar: "Revisa antes de usar",
    privacidad: "Leemos tus archivos para llenar este formulario y no los guardamos.",
    ruta: "Ruta",
  },
  en: {
    titulo: {
      perfil_carrier: "Upload your documents and we fill in the profile for you",
      perfil_shipper: "Upload your documents and we fill in the profile for you",
      solicitud: "Paste your email or drop your file as you have it",
    },
    sub: {
      perfil_carrier: "W-9, MC/USDOT authority, insurance certificate, Mexican tax certificate or company letter. You just confirm what we read.",
      perfil_shipper: "W-9, Mexican tax certificate or your company letter. You just confirm what we read.",
      solicitud: "An email, an Excel in any layout or a PDF. We build the lanes and you just confirm.",
    },
    subir: "Upload files",
    soltar: "or drop them here · PDF, photo, Excel or CSV",
    pegar: "Paste text",
    pegarAyuda: "Email or message",
    leer: "Read",
    leyendo: "Reading…",
    quitar: "Remove",
    revisa: "Review what we read",
    ahora: "Now",
    usar: (n: number) => (n === 1 ? "Use this detail" : `Use these ${n} details`),
    agregarRutas: (n: number) => (n === 1 ? "Add this lane" : `Add these ${n} lanes`),
    descartar: "Discard",
    nada: "We found nothing for this form. Try another document or fill it in by hand.",
    yaCoinciden: (n: number) => (n === 1 ? "1 detail already matched your profile." : `${n} details already matched your profile.`),
    revisar: "Check before using",
    privacidad: "We read your files to fill in this form and don't keep them.",
    ruta: "Lane",
  },
};

export interface LectorProps {
  origen: OrigenDocumentos;
  token: string;
  lang: Lang;
  campos: CampoDocumento[];
  /** Valor actual de un campo del perfil (para no proponer lo que ya está y mostrar «Ahora»). */
  actual?: (clave: string) => string | string[] | undefined;
  /** Cómo se lee un valor en pantalla (la etiqueta de una opción). */
  mostrar?: (clave: string, valor: string) => string;
  onUsar?: (valores: ValorLeido[]) => void;
  /** Solicitud: campos de cada ruta, una línea por ruta y lo que pasa al agregarlas. */
  camposRuta?: CampoDocumento[];
  resumenRuta?: (campos: ValorLeido[]) => { titulo: string; datos: string[]; faltan?: string[] };
  onRutas?: (rutas: ValorLeido[][]) => void;
  /** Solicitud: un Excel en nuestra plantilla se importa sin IA. true = ya se encargó. */
  probarSinIA?: (archivo: File) => Promise<boolean>;
}

export function LectorDocumentos(props: LectorProps) {
  const { origen, token, lang, campos, actual, mostrar, onUsar, camposRuta, resumenRuta, onRutas, probarSinIA } = props;
  const t = COPY[lang];
  const [elegidos, setElegidos] = useState<Elegido[]>([]);
  const [pegado, setPegado] = useState("");
  const [pegarAbierto, setPegarAbierto] = useState(origen === "solicitud");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaDocumentos | null>(null);
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [encima, setEncima] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const etiquetas = useMemo(() => new Map([...campos, ...(camposRuta ?? [])].map((c) => [c.clave, c.etiqueta])), [campos, camposRuta]);
  const ver = (clave: string, valor: string) => (mostrar ? mostrar(clave, valor) : valor);

  async function agregar(archivos: FileList | File[]) {
    setError(null);
    const lista = [...archivos];
    if (!lista.length) return;
    // La solicitud prueba primero nuestra plantilla: si la reconoce, entra sin IA.
    if (probarSinIA && lista.length === 1 && /\.(xlsx|xls|csv)$/i.test(lista[0].name)) {
      try {
        if (await probarSinIA(lista[0])) return;
      } catch {
        /* no era nuestra plantilla: la lee la IA */
      }
    }
    try {
      const nuevos = await Promise.all(lista.map((a) => prepararArchivo(a, lang)));
      setElegidos((prev) => [...prev, ...nuevos.filter((n) => !prev.some((p) => p.nombre === n.nombre && p.archivo.size === n.archivo.size))]);
      setLectura(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function leer() {
    const problema = problemaDeTamano(elegidos, pegado, lang);
    if (problema) return setError(problema);
    if (!elegidos.length && pegado.trim().length < 3) return;
    setLeyendo(true);
    setError(null);
    try {
      const l = await leerDocumentos({ origen, token, idioma: lang, elegidos, pegado, campos, camposRuta });
      setLectura(l);
      // Lo que cambiaría un dato ya guardado empieza sin marcar: la persona decide.
      setFuera(new Set(l.campos.filter((v) => tieneValor(actual?.(v.clave))).map((v) => v.clave)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  }

  const nuevos = lectura ? lectura.campos.filter((v) => !mismoValor(actual?.(v.clave), v.valores)) : [];
  const coinciden = lectura ? lectura.campos.length - nuevos.length : 0;
  const rutas = lectura?.rutas ?? [];
  const elegidosCampos = nuevos.filter((v) => !fuera.has(v.clave));
  const elegidasRutas = rutas.filter((_, i) => !fuera.has(`ruta:${i}`));
  const vacio = lectura && !nuevos.length && !rutas.length;

  function usar() {
    if (rutas.length && onRutas) onRutas(elegidasRutas.map((r) => r.campos));
    if (elegidosCampos.length && onUsar) onUsar(elegidosCampos);
    setLectura(null);
    setElegidos([]);
    setPegado("");
  }

  const alternar = (clave: string) =>
    setFuera((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });

  const cuantos = rutas.length ? elegidasRutas.length : elegidosCampos.length;

  return (
    <section className={`card lector${lectura ? " lector-leido" : ""}`} aria-labelledby={`lector-${origen}`}>
      <div className="lector-head">
        <span className="lector-icono" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
          </svg>
        </span>
        <div>
          <h2 id={`lector-${origen}`}>{t.titulo[origen]}</h2>
          <p className="ayuda">{t.sub[origen]}</p>
        </div>
      </div>

      {!lectura && (
        <>
          <div
            className={`lector-zona${encima ? " encima" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setEncima(true);
            }}
            onDragLeave={() => setEncima(false)}
            onDrop={(e) => {
              e.preventDefault();
              setEncima(false);
              void agregar(e.dataTransfer.files);
            }}
          >
            <button type="button" className="lector-subir" disabled={leyendo} onClick={() => entrada.current?.click()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m17 8-5-5-5 5M12 3v12" />
              </svg>
              {t.subir}
            </button>
            <span className="lector-soltar">{t.soltar}</span>
            <input
              ref={entrada}
              type="file"
              multiple
              accept={ACEPTA}
              hidden
              onChange={(e) => {
                const archivos = e.target.files ? [...e.target.files] : [];
                e.target.value = "";
                void agregar(archivos);
              }}
            />
          </div>

          {elegidos.length > 0 && (
            <ul className="lector-archivos">
              {elegidos.map((e) => (
                <li key={`${e.nombre}-${e.archivo.size}`}>
                  <span className="mono">{e.nombre}</span>
                  <button
                    type="button"
                    className="lector-quitar"
                    aria-label={`${t.quitar} ${e.nombre}`}
                    onClick={() => setElegidos((prev) => prev.filter((p) => p !== e))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {pegarAbierto ? (
            <label className="field lector-pegar">
              <span>{t.pegarAyuda}</span>
              <textarea rows={origen === "solicitud" ? 4 : 3} value={pegado} onChange={(e) => setPegado(e.target.value)} />
            </label>
          ) : (
            <button type="button" className="link lector-abrir-pegar" onClick={() => setPegarAbierto(true)}>
              {t.pegar}
            </button>
          )}

          {error && <p className="lector-error" role="alert">{error}</p>}

          <div className="lector-acciones">
            <span className="lector-privacidad">{t.privacidad}</span>
            <button
              type="button"
              className="primary"
              disabled={leyendo || (!elegidos.length && pegado.trim().length < 3)}
              aria-busy={leyendo || undefined}
              onClick={() => void leer()}
            >
              {leyendo ? t.leyendo : t.leer}
            </button>
          </div>
        </>
      )}

      {lectura && (
        <div className="lector-resultado" aria-live="polite">
          <h3>{t.revisa}</h3>
          {lectura.resumen && <p className="lector-resumen">{lectura.resumen}</p>}
          {vacio && <p className="lector-vacio">{t.nada}</p>}

          {nuevos.length > 0 && (
            <ul className="lector-lista">
              {nuevos.map((v) => {
                const antes = actual?.(v.clave);
                const on = !fuera.has(v.clave);
                return (
                  <li key={v.clave} className={on ? "on" : ""}>
                    <label>
                      <input type="checkbox" checked={on} onChange={() => alternar(v.clave)} />
                      <span className="lector-campo">{etiquetas.get(v.clave) ?? v.clave}</span>
                      <span className="lector-valor">{v.valores.map((x) => ver(v.clave, x)).join(" · ")}</span>
                    </label>
                    {tieneValor(antes) && (
                      <span className="lector-antes">
                        {t.ahora}: {(Array.isArray(antes) ? antes : [antes!]).map((x) => ver(v.clave, x)).join(" · ")}
                      </span>
                    )}
                    {v.cita && <span className="lector-cita">«{v.cita}»</span>}
                  </li>
                );
              })}
            </ul>
          )}

          {rutas.length > 0 && (
            <ol className="lector-lista lector-rutas">
              {rutas.map((r, i) => {
                const on = !fuera.has(`ruta:${i}`);
                const resumen = resumenRuta ? resumenRuta(r.campos) : { titulo: `${t.ruta} ${i + 1}`, datos: [] as string[], faltan: [] as string[] };
                const faltan = resumen.faltan ?? [];
                return (
                  <li key={i} className={on ? "on" : ""}>
                    <label>
                      <input type="checkbox" checked={on} onChange={() => alternar(`ruta:${i}`)} />
                      <span className="lector-num mono">{i + 1}</span>
                      <span className="lector-valor">{resumen.titulo}</span>
                    </label>
                    {resumen.datos.length + faltan.length > 0 && (
                      <span className="lector-datos">
                        {faltan.map((d) => (
                          <span key={d} className="lector-dato lector-falta">
                            {d}
                          </span>
                        ))}
                        {resumen.datos.map((d) => (
                          <span key={d} className="lector-dato">
                            {d}
                          </span>
                        ))}
                      </span>
                    )}
                    {/* De dónde sale cada valor: la misma cita que en los datos de la empresa. */}
                    {[...new Set(r.campos.map((c) => c.cita).filter(Boolean))].map((cita) => (
                      <span key={cita} className="lector-cita">«{cita}»</span>
                    ))}
                  </li>
                );
              })}
            </ol>
          )}

          {coinciden > 0 && <p className="lector-nota">{t.yaCoinciden(coinciden)}</p>}
          {lectura.dudas.length > 0 && (
            <div className="lector-dudas">
              <b>{t.revisar}</b>
              <ul>
                {lectura.dudas.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="lector-acciones">
            <button
              type="button"
              onClick={() => {
                setLectura(null);
              }}
            >
              {t.descartar}
            </button>
            {!vacio && (
              <button type="button" className="primary" disabled={cuantos === 0} onClick={usar}>
                {rutas.length ? t.agregarRutas(cuantos) : t.usar(cuantos)}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function tieneValor(v: string | string[] | undefined): boolean {
  return Array.isArray(v) ? v.length > 0 : Boolean(v && v.trim());
}
