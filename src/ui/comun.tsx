import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ErrorApi } from "../cliente/api";
import { USUARIOS_SIMULADOS, useSesion } from "./sesion";
import { setLang, useLang } from "@/i18n/language";
import { tr } from "@/i18n/common";
import { TEAM_ROLE_LABEL } from "@/lib/roles";
import * as I from "./Iconos";
import { ContextoEventos, useEventos } from "./Eventos";
import { grupoDe } from "./eventosVista";
import { hoyMexico } from "../dominio/recorrido";
import { BotonAyudas } from "./BotonAyudas";
import { Buscador, BotonBuscar, useAtajoBuscar } from "./Buscador";
import { esActivo, MENU, MODULOS, moduloDe, seccionActiva, type Modulo } from "./navegacion";

// ——— Rutas: react-router (las comparten la Mesa y los módulos de Bidware) ———
export function useRuta(): string {
  return useLocation().pathname;
}

// «1 ruta», «3 rutas»: sin «ruta(s)».
export const plural = (n: number, uno: string, varios = `${uno}s`) => `${n.toLocaleString("es-MX")} ${n === 1 ? uno : varios}`;

let navegar: ((ruta: string) => void) | null = null;

// Deja ir() disponible fuera de los componentes (p. ej. tras guardar).
export function NavegadorGlobal() {
  const n = useNavigate();
  useEffect(() => {
    navegar = (ruta) => n(ruta);
    return () => {
      navegar = null;
    };
  }, [n]);
  return null;
}

export function ir(ruta: string) {
  if (navegar) navegar(ruta);
  else window.location.assign(ruta);
}

export function Liga({ a, children, className, title, "aria-current": actual }: { a: string; children: ReactNode; className?: string; title?: string; "aria-current"?: "page" }) {
  return (
    <Link to={a} className={className} title={title} aria-current={actual}>
      {children}
    </Link>
  );
}

// Menú: cinco entradas en español y «Más» plegado (navegacion.ts).
export { MENU };


function Entrada({ m, ruta, contador }: { m: Modulo; ruta: string; contador?: number }) {
  const Ic = m.icono;
  if (m.publica)
    return (
      <a href={m.a} target="_blank" rel="noreferrer" title="La vista pública, en otra pestaña">
        <Ic size={17} /> <span className="menu-texto">{m.etiqueta}</span> <I.Externo size={13} className="externo" aria-label="abre en otra pestaña" />
      </a>
    );
  const activo = esActivo(m, ruta);
  return (
    <Liga a={m.a} className={activo ? "activo" : ""} aria-current={activo ? "page" : undefined}>
      <Ic size={17} /> <span className="menu-texto">{m.etiqueta}</span>
      {contador ? <span className="contador" title={`${contador} te toca`}>{contador}</span> : null}
    </Liga>
  );
}

function Menu({ ruta, teToca }: { ruta: string; teToca: number }) {
  const masActivo = MENU.some((g) => g.plegado && g.modulos.some((m) => !m.publica && esActivo(m, ruta)));
  const [mas, setMas] = useState(masActivo);
  useEffect(() => { if (masActivo) setMas(true); }, [masActivo]);
  return (
    <nav className="menu" aria-label="Módulos">
      <div className="menu-grupos">
        {MENU.map((g) =>
          g.plegado ? (
            <div key={g.grupo} className="menu-grupo">
              <button type="button" className="menu-titulo menu-plegable" aria-expanded={mas} onClick={() => setMas(!mas)}>
                <I.Puntos size={17} /> <span className="menu-texto">{g.grupo}</span> <span aria-hidden className="chevron">{mas ? "▴" : "▾"}</span>
              </button>
              {mas && g.modulos.map((m) => <Entrada key={m.a} m={m} ruta={ruta} />)}
            </div>
          ) : (
            <div key={g.grupo || "principal"} className="menu-grupo">
              {g.grupo && <span className="menu-titulo">{g.grupo}</span>}
              {g.modulos.map((m) => <Entrada key={m.a} m={m} ruta={ruta} contador={m.a === "/eventos" ? teToca : undefined} />)}
            </div>
          )
        )}
      </div>
    </nav>
  );
}

// Pestañas de la entrada activa (Carriers: directorio, listas, a quién invitar y plantillas).
export function Secciones({ ruta }: { ruta: string }) {
  const m = moduloDe(ruta);
  if (!m?.secciones) return null;
  const actual = seccionActiva(m, ruta);
  return (
    <nav className="secciones" aria-label={`Secciones de ${m.etiqueta}`}>
      {m.secciones.map((s) => (
        <Liga key={s.a} a={s.a} className={s === actual ? "activa" : ""} aria-current={s === actual ? "page" : undefined}>
          {s.etiqueta}
        </Liga>
      ))}
    </nav>
  );
}

// Teléfono: las cuatro entradas de diario abajo, al alcance del pulgar; el resto en «Más».
const ABAJO: { etiqueta: string; a: string; icono: (p: { size?: number }) => JSX.Element }[] = [
  { etiqueta: "Hoy", a: "/", icono: I.Casa },
  { etiqueta: "Eventos", a: "/eventos", icono: I.Martillo },
  { etiqueta: "Cotizar", a: "/quotedesk", icono: I.Calculadora },
  { etiqueta: "Carriers", a: "/crm", icono: I.Camion }
];
function BarraInferior({ ruta, teToca, onBuscar }: { ruta: string; teToca: number; onBuscar: () => void }) {
  const [mas, setMas] = useState(false);
  useEffect(() => setMas(false), [ruta]);
  const actual = moduloDe(ruta);
  const enAbajo = ABAJO.some((x) => actual?.a === x.a);
  const resto = MODULOS.filter((m) => !ABAJO.some((x) => x.a === m.a));
  return (
    <>
      {mas && (
        <div className="hoja-mas-fondo" onClick={() => setMas(false)}>
          <nav className="hoja-mas" aria-label="Más secciones" onClick={(ev) => ev.stopPropagation()}>
            <button type="button" className="hoja-mas-fila" onClick={() => { setMas(false); onBuscar(); }}>
              <I.Lupa size={18} /> Buscar
            </button>
            {resto.map((m) => {
              const Ic = m.icono;
              return m.publica ? (
                <a key={m.a} href={m.a} target="_blank" rel="noreferrer" className="hoja-mas-fila"><Ic size={18} /> {m.etiqueta} <I.Externo size={13} /></a>
              ) : (
                <Liga key={m.a} a={m.a} className={`hoja-mas-fila ${esActivo(m, ruta) ? "activo" : ""}`}><Ic size={18} /> {m.etiqueta}</Liga>
              );
            })}
          </nav>
        </div>
      )}
      <nav className="barra-inferior" aria-label="Módulos">
        {ABAJO.map((x) => {
          const Ic = x.icono;
          const activo = actual?.a === x.a;
          return (
            <Liga key={x.a} a={x.a} className={activo ? "activo" : ""} aria-current={activo ? "page" : undefined}>
              <span className="barra-icono"><Ic size={20} />{x.a === "/eventos" && teToca > 0 && <span className="contador">{teToca}</span>}</span>
              {x.etiqueta}
            </Liga>
          );
        })}
        <button type="button" className={!enAbajo || mas ? "activo" : ""} aria-expanded={mas} onClick={() => setMas(!mas)}>
          <span className="barra-icono"><I.Puntos size={20} /></span>
          Más
        </button>
      </nav>
    </>
  );
}

export function Marco({ children }: { children: ReactNode }) {
  const s = useSesion();
  useLang(); // el rol y el aviso cambian de idioma con los módulos
  const ruta = useRuta();
  // Una sola lectura de eventos por página: la usan el contador del menú, Hoy y Eventos.
  const eventos = useEventos();
  const teToca = eventos.carga.tipo === "ok" && s.rol === "admin" ? eventos.carga.datos.filter((e) => grupoDe(e, hoyMexico(), true) === "te_toca").length : 0;
  const [buscando, setBuscando] = useState(false);
  const abrirBusqueda = useCallback(() => setBuscando(true), []);
  useAtajoBuscar(abrirBusqueda);
  useEffect(() => setBuscando(false), [ruta]);
  const irA = useCallback((a: string, externa?: boolean) => (externa ? window.open(a, "_blank", "noreferrer") : ir(a)), []);
  return (
    <ContextoEventos.Provider value={eventos}>
    <div className="marco">
      <aside className="lateral">
        <Liga a="/" className="marca">
          <span className="logo">MARKS<b>MAN</b></span>
          <span className="sub">Fr8Bid</span>
        </Liga>
        <BotonBuscar onAbrir={abrirBusqueda} />
        <Menu ruta={ruta} teToca={teToca} />
        <div className="cuenta">
          {s.modo === "simulado" ? (
            <>
              <span className="pill aviso-pill">Rateware simulado</span>
              <label className="campo ver-como">
                <span>Ver como</span>
                <select value={s.usuarioSimulado} onChange={(e) => s.cambiarUsuarioSimulado(e.target.value)}>
                  {USUARIOS_SIMULADOS.map((u) => (
                    <option key={u.clave} value={u.clave}>{u.nombre}</option>
                  ))}
                </select>
              </label>
            </>
          ) : s.correo ? (
            <div className="quien">
              <span className="inicial" aria-hidden>{s.correo.slice(0, 1).toUpperCase()}</span>
              <span className="quien-texto">
                <span className="correo" title={s.correo}>{s.correo}</span>
                {s.rolLeido && <span className="rol sidebar-role">{TEAM_ROLE_LABEL[s.rol]}</span>}
              </span>
            </div>
          ) : null}
          <div className="cuenta-acciones">
            {s.modo !== "simulado" && s.correo && (
              <button className="btn-texto salir" onClick={s.salir}>
                <I.Salir size={15} /> Salir
              </button>
            )}
            <BotonAyudas />
            <Idioma />
          </div>
        </div>
      </aside>
      <main className="contenido main-col">
        {s.modo !== "simulado" && s.correo && s.rolLeido && s.rol === "viewer" && (
          <div className="aviso-caja" role="note">
            <b>{tr("text010")}</b> {tr("text011")}
          </div>
        )}
        <Secciones ruta={ruta} />
        {children}
      </main>
      <BarraInferior ruta={ruta} teToca={teToca} onBuscar={abrirBusqueda} />
      <Buscador abierto={buscando} cerrar={() => setBuscando(false)} ir={irA} />
    </div>
    </ContextoEventos.Provider>
  );
}

// «?»: muestra u oculta las explicaciones de los módulos (ocultas por defecto).
// Idioma de los módulos traídos de Bidware (el equipo trabaja en español o en
// inglés); la página del evento sigue en español.
function Idioma() {
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <div className="idioma" role="group" aria-label={lang === "es" ? "Idioma del equipo" : "Team language"}>
      {(["es", "en"] as const).map((op) => (
        <button key={op} type="button" className="btn-texto" aria-pressed={lang === op} onClick={() => setLang(op)}>
          {op.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export type Carga<T> =
  | { tipo: "cargando" }
  | { tipo: "ok"; datos: T; leidoEn: number }
  | { tipo: "error"; mensaje: string }
  | { tipo: "sin_permiso"; mensaje: string }
  | { tipo: "no_encontrado" };

export function aCarga<T>(e: unknown): Carga<T> {
  if (e instanceof ErrorApi && e.status === 403) return { tipo: "sin_permiso", mensaje: e.message };
  if (e instanceof ErrorApi && e.status === 401) return { tipo: "sin_permiso", mensaje: "Inicia sesión para continuar." };
  if (e instanceof ErrorApi && e.status === 404) return { tipo: "no_encontrado" };
  return { tipo: "error", mensaje: e instanceof Error ? e.message : "Error desconocido" };
}

// Los cuatro estados de vista nunca se confunden: un error no se lee como cero.
export function EstadoVista({ carga, reintentar, vacio }: { carga: Carga<unknown>; reintentar: () => void; vacio?: string }) {
  if (carga.tipo === "cargando")
    return (
      <div className="cargando" role="status" aria-live="polite">
        <span className="giro" aria-hidden /> Leyendo Rateware…
        <span className="esqueleto" aria-hidden><i /><i /><i /></span>
      </div>
    );
  if (carga.tipo === "error")
    return (
      <div className="estado estado-error" role="alert">
        <b>Rateware no respondió.</b> {carga.mensaje} Los datos no son cero. <button onClick={reintentar}>Reintentar</button>
      </div>
    );
  if (carga.tipo === "sin_permiso")
    return (
      <div className="estado estado-permiso" role="alert">
        <b>Sin permiso.</b> {carga.mensaje}
      </div>
    );
  if (carga.tipo === "no_encontrado") return <div className="estado estado-permiso">No encontrado en tu organización.</div>;
  return vacio ? <div className="estado">{vacio}</div> : null;
}

export function Desactualizado({ leidoEn, actualizar }: { leidoEn: number; actualizar: () => void }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const min = Math.floor((ahora - leidoEn) / 60000);
  if (min < 10) return null;
  return (
    <div className="estado estado-viejo">
      Última lectura hace {min} min. <button onClick={actualizar}>Actualizar</button>
    </div>
  );
}

export const Prueba = () => <span className="pill prueba">PRUEBA CONTROLADA</span>;

// Dinero: entero sin decimales («4,000 USD»); con centavos, siempre dos («4,501.70 USD»).
export const dinero = (n: number | null | undefined, moneda = "USD") => {
  if (n === null || n === undefined) return "—";
  const decimales = Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2;
  return `${n.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: 2 })} ${moneda}`;
};

export const fecha = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", ...(iso.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "America/Mexico_City" });
};

// Botón de dos tiempos para acciones que escriben: primero explica, luego confirma.
/** Una confirmación abierta sigue valiendo solo si lo que se confirma no cambió desde que se abrió. */
export const confirmacionVigente = (alAbrir: string | undefined, ahora: string | undefined) => alAbrir === ahora;

export function Confirmar({
  etiqueta,
  advertencia,
  onConfirmar,
  deshabilitado,
  clase = "btn-primario",
  icono,
  firma
}: {
  etiqueta: string;
  icono?: ReactNode;
  advertencia: ReactNode;
  onConfirmar: () => Promise<void> | void;
  deshabilitado?: boolean;
  clase?: string;
  /** Lo que se está confirmando: si cambia con la confirmación abierta, se cierra sin hacer nada. */
  firma?: string;
}) {
  const [paso, setPaso] = useState<"inicio" | "confirmar" | "enviando">("inicio");
  const enCurso = useRef(false);
  const alAbrir = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (paso === "confirmar" && !confirmacionVigente(alAbrir.current, firma)) setPaso("inicio");
  }, [paso, firma]);
  if (paso === "inicio")
    return (
      <button className={clase} disabled={deshabilitado} onClick={() => { alAbrir.current = firma; setPaso("confirmar"); }}>
        {icono}
        {etiqueta}
      </button>
    );
  return (
    <div className="confirmar">
      <p>{advertencia}</p>
      <div className="fila-botones">
        <button
          className={clase}
          disabled={deshabilitado || paso === "enviando"}
          onClick={async () => {
            if (deshabilitado || enCurso.current) return;
            if (!confirmacionVigente(alAbrir.current, firma)) return setPaso("inicio");
            enCurso.current = true;
            setPaso("enviando");
            try {
              await onConfirmar();
            } finally {
              enCurso.current = false;
              setPaso("inicio");
            }
          }}
        >
          {paso === "enviando" ? "Enviando…" : "Sí, confirmar"}
        </button>
        <button className="btn-texto" disabled={paso === "enviando"} onClick={() => setPaso("inicio")}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
