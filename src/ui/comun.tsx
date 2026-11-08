import { useEffect, useRef, useState, type ReactNode } from "react";
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

export function Liga({ a, children, className, title }: { a: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <Link to={a} className={className} title={title}>
      {children}
    </Link>
  );
}

// Menú completo: la página del evento y los módulos traídos de Bidware, todos
// aquí, con el mismo trazo de iconos que Fr8Growth. «Más» va plegado.
type Modulo = { etiqueta: string; a: string; icono: (p: { size?: number }) => JSX.Element; publica?: boolean; activo?: (ruta: string) => boolean };
const bajo = (a: string) => (ruta: string) => ruta === a || ruta.startsWith(`${a}/`);
export const MENU: { grupo: string; plegado?: boolean; modulos: Modulo[] }[] = [
  {
    grupo: "",
    modulos: [
      { etiqueta: "Hoy", a: "/", icono: I.Casa, activo: (r) => r === "/" },
      { etiqueta: "Eventos RFx", a: "/eventos", icono: I.Martillo, activo: (r) => bajo("/eventos")(r) || bajo("/rfx")(r) },
      { etiqueta: "QuoteDesk", a: "/quotedesk", icono: I.Calculadora },
      { etiqueta: "Shipper intake", a: "/intake", icono: I.Bandeja }
    ]
  },
  {
    grupo: "Carriers",
    modulos: [
      { etiqueta: "Carrier CRM", a: "/crm", icono: I.Camion },
      { etiqueta: "Listas de carriers", a: "/templates", icono: I.Lista },
      { etiqueta: "Carrier fit", a: "/carrier-fit", icono: I.Mira },
      { etiqueta: "Plantillas de correo", a: "/plantillas", icono: I.Sobre }
    ]
  },
  {
    grupo: "Shippers y tarifas",
    modulos: [
      { etiqueta: "Shippers", a: "/shippers", icono: I.Edificio },
      { etiqueta: "Revisión de tarifas", a: "/tarifas", icono: I.Etiqueta },
      { etiqueta: "Tarifario", a: "/tarifario", icono: I.Libro },
      { etiqueta: "Archivos de tarifas", a: "/archivos", icono: I.Carpeta }
    ]
  },
  {
    grupo: "Más",
    plegado: true,
    modulos: [
      { etiqueta: "Integraciones", a: "/integraciones", icono: I.Enchufe },
      // La vista que ven los carriers: se abre aparte, sin el marco del equipo.
      { etiqueta: "Tablero público", a: "/board", icono: I.Pantalla, publica: true }
    ]
  }
];

const esActivo = (m: Modulo, ruta: string) => (m.activo ?? bajo(m.a))(ruta);

function Entrada({ m, ruta, contador }: { m: Modulo; ruta: string; contador?: number }) {
  const Ic = m.icono;
  if (m.publica)
    return (
      <a href={m.a} target="_blank" rel="noreferrer" title="La vista pública, en otra pestaña">
        <Ic size={17} /> <span className="menu-texto">{m.etiqueta}</span> <I.Externo size={13} className="externo" aria-label="abre en otra pestaña" />
      </a>
    );
  return (
    <Liga a={m.a} className={esActivo(m, ruta) ? "activo" : ""}>
      <Ic size={17} /> <span className="menu-texto">{m.etiqueta}</span>
      {contador ? <span className="contador" title={`${contador} te toca`}>{contador}</span> : null}
    </Liga>
  );
}

function Menu({ ruta, teToca }: { ruta: string; teToca: number }) {
  const [abierto, setAbierto] = useState(false);
  const todos = MENU.flatMap((g) => g.modulos);
  const actual = todos.find((m) => !m.publica && esActivo(m, ruta));
  const masActivo = MENU.some((g) => g.plegado && g.modulos.some((m) => !m.publica && esActivo(m, ruta)));
  const [mas, setMas] = useState(masActivo);
  useEffect(() => setAbierto(false), [ruta]);
  useEffect(() => { if (masActivo) setMas(true); }, [masActivo]);
  const Actual = actual?.icono;
  return (
    <nav className={`menu ${abierto ? "abierto" : ""}`} aria-label="Módulos">
      <button className="menu-boton" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        {Actual && <Actual size={17} />} {actual?.etiqueta ?? "Menú"} <span aria-hidden>▾</span>
      </button>
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

export function Marco({ children }: { children: ReactNode }) {
  const s = useSesion();
  useLang(); // el rol y el aviso cambian de idioma con los módulos
  const ruta = useRuta();
  // Una sola lectura de eventos por página: la usan el contador del menú, Hoy y Eventos.
  const eventos = useEventos();
  const teToca = eventos.carga.tipo === "ok" && s.rol === "admin" ? eventos.carga.datos.filter((e) => grupoDe(e, hoyMexico(), true) === "te_toca").length : 0;
  return (
    <ContextoEventos.Provider value={eventos}>
    <div className="marco">
      <aside className="lateral">
        <Liga a="/" className="marca">
          <span className="logo">MARKS<b>MAN</b></span>
          <span className="sub">Fr8Bid · Bid Room</span>
        </Liga>
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
        {children}
      </main>
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

export const dinero = (n: number | null | undefined, moneda = "USD") =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${moneda}`;

export const fecha = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", ...(iso.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "America/Mexico_City" });
};

// Botón de dos tiempos para acciones que escriben: primero explica, luego confirma.
export function Confirmar({
  etiqueta,
  advertencia,
  onConfirmar,
  deshabilitado,
  clase = "btn-primario",
  icono
}: {
  etiqueta: string;
  icono?: ReactNode;
  advertencia: ReactNode;
  onConfirmar: () => Promise<void> | void;
  deshabilitado?: boolean;
  clase?: string;
}) {
  const [paso, setPaso] = useState<"inicio" | "confirmar" | "enviando">("inicio");
  const enCurso = useRef(false);
  if (paso === "inicio")
    return (
      <button className={clase} disabled={deshabilitado} onClick={() => setPaso("confirmar")}>
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
