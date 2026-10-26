import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ErrorApi } from "../cliente/api";
import { NOMBRE_ROL, USUARIOS_SIMULADOS, useSesion } from "./sesion";

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

export function Liga({ a, children, className }: { a: string; children: ReactNode; className?: string }) {
  return (
    <Link to={a} className={className}>
      {children}
    </Link>
  );
}

// Menú completo: la Mesa y los módulos traídos de Bidware, todos aquí.
type Modulo = { etiqueta: string; a: string; publica?: boolean; activo?: (ruta: string) => boolean };
const bajo = (a: string) => (ruta: string) => ruta === a || ruta.startsWith(`${a}/`);
export const MENU: { grupo: string; modulos: Modulo[] }[] = [
  {
    grupo: "Eventos",
    modulos: [
      { etiqueta: "Eventos RFx", a: "/eventos", activo: (r) => r === "/" || bajo("/eventos")(r) || bajo("/rfx")(r) },
      { etiqueta: "QuoteDesk", a: "/quotedesk" },
      { etiqueta: "Shipper intake", a: "/intake" }
    ]
  },
  {
    grupo: "Carriers",
    modulos: [
      { etiqueta: "Carrier CRM", a: "/crm" },
      { etiqueta: "Listas de carriers", a: "/templates" },
      { etiqueta: "Carrier fit", a: "/carrier-fit" },
      { etiqueta: "Plantillas de correo", a: "/plantillas" }
    ]
  },
  {
    grupo: "Shippers y tarifas",
    modulos: [
      { etiqueta: "Shippers", a: "/shippers" },
      { etiqueta: "Revisión de tarifas", a: "/tarifas" },
      { etiqueta: "Tarifario", a: "/tarifario" },
      { etiqueta: "Archivos de tarifas", a: "/archivos" }
    ]
  },
  {
    grupo: "Más",
    modulos: [
      { etiqueta: "Panel", a: "/panel" },
      { etiqueta: "Integraciones", a: "/integraciones" },
      // La vista que ven los carriers: se abre aparte, sin el marco del equipo.
      { etiqueta: "Tablero público", a: "/board", publica: true }
    ]
  }
];

const esActivo = (m: Modulo, ruta: string) => (m.activo ?? bajo(m.a))(ruta);

function Menu({ ruta }: { ruta: string }) {
  const [abierto, setAbierto] = useState(false);
  const actual = MENU.flatMap((g) => g.modulos).find((m) => !m.publica && esActivo(m, ruta));
  useEffect(() => setAbierto(false), [ruta]);
  return (
    <nav className={`menu ${abierto ? "abierto" : ""}`} aria-label="Módulos">
      <button className="menu-boton" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        {actual?.etiqueta ?? "Menú"} <span aria-hidden>▾</span>
      </button>
      <div className="menu-grupos">
        {MENU.map((g) => (
          <div key={g.grupo} className="menu-grupo">
            <span className="menu-titulo">{g.grupo}</span>
            {g.modulos.map((m) =>
              m.publica ? (
                <a key={m.a} href={m.a} target="_blank" rel="noreferrer" title="La vista pública, en otra pestaña">
                  {m.etiqueta} <span className="externo" aria-label="abre en otra pestaña">↗</span>
                </a>
              ) : (
                <Liga key={m.a} a={m.a} className={esActivo(m, ruta) ? "activo" : ""}>
                  {m.etiqueta}
                </Liga>
              )
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}

export function Marco({ children }: { children: ReactNode }) {
  const s = useSesion();
  const ruta = useRuta();
  return (
    <div className="marco">
      <aside className="lateral">
        <div className="marca">
          <span className="logo">MARKS<b>MAN</b></span>
          <span className="sub">Bid Room</span>
        </div>
        <Menu ruta={ruta} />
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
            <>
              <span className="correo">{s.correo}</span>
              <button className="btn-texto" onClick={s.salir}>Salir</button>
            </>
          ) : null}
          {s.modo !== "simulado" && s.correo && <span className="rol">{NOMBRE_ROL[s.rol]}</span>}
        </div>
      </aside>
      <main className="contenido">{children}</main>
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
  if (carga.tipo === "cargando") return <div className="estado">Leyendo Rateware…</div>;
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
  clase = "btn-primario"
}: {
  etiqueta: string;
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
