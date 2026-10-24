import { useEffect, useState, type ReactNode } from "react";
import { ErrorApi } from "../cliente/api";
import { NOMBRE_ROL, USUARIOS_SIMULADOS, useSesion } from "./sesion";

// ——— Router mínimo: tres rutas, sin dependencia ———
export function useRuta(): string {
  const [ruta, setRuta] = useState(window.location.pathname);
  useEffect(() => {
    const f = () => setRuta(window.location.pathname);
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  return ruta;
}

export function ir(ruta: string) {
  window.history.pushState(null, "", ruta);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function Liga({ a, children, className }: { a: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={a}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        ir(a);
      }}
    >
      {children}
    </a>
  );
}

// Menú completo. Fr8Bid reemplaza a Bidware módulo por módulo: lo ya portado
// abre aquí; lo que falta abre el módulo en Bidware (pestaña nueva) mientras tanto.
export const BIDWARE = "https://bidware.heymarksman.com";
type Modulo = { etiqueta: string; a: string; bidware?: boolean; activo?: (ruta: string) => boolean };
export const MENU: { grupo: string; modulos: Modulo[] }[] = [
  {
    grupo: "Eventos",
    modulos: [
      { etiqueta: "Eventos RFx", a: "/eventos", activo: (r) => r === "/" || r.startsWith("/eventos") },
      { etiqueta: "QuoteDesk", a: "/quotedesk", bidware: true },
      { etiqueta: "Shipper intake", a: "/intake", bidware: true }
    ]
  },
  {
    grupo: "Carriers",
    modulos: [
      { etiqueta: "Carrier CRM", a: "/crm", bidware: true },
      { etiqueta: "Listas de carriers", a: "/templates", bidware: true },
      { etiqueta: "Carrier fit", a: "/carrier-fit", bidware: true },
      { etiqueta: "Plantillas de correo", a: "/plantillas", bidware: true }
    ]
  },
  {
    grupo: "Shippers y tarifas",
    modulos: [
      { etiqueta: "Shippers", a: "/shippers", bidware: true },
      { etiqueta: "Revisión de tarifas", a: "/tarifas", bidware: true },
      { etiqueta: "Tarifario", a: "/tarifario", bidware: true },
      { etiqueta: "Archivos de tarifas", a: "/archivos", bidware: true }
    ]
  },
  {
    grupo: "Más",
    modulos: [
      { etiqueta: "Tablero público", a: "/board", bidware: true },
      { etiqueta: "Integraciones", a: "/integraciones", bidware: true }
    ]
  }
];

function Menu({ ruta }: { ruta: string }) {
  const [abierto, setAbierto] = useState(false);
  const actual = MENU.flatMap((g) => g.modulos).find((m) => m.activo?.(ruta));
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
              m.bidware ? (
                <a key={m.a} href={`${BIDWARE}${m.a}`} target="_blank" rel="noreferrer" title="Todavía abre en Bidware">
                  {m.etiqueta} <span className="externo" aria-label="abre en Bidware">↗</span>
                </a>
              ) : (
                <Liga key={m.a} a={m.a} className={m.activo?.(ruta) ? "activo" : ""}>
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
          disabled={paso === "enviando"}
          onClick={async () => {
            setPaso("enviando");
            try {
              await onConfirmar();
            } finally {
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

// «1 ruta», «3 rutas»: sin «ruta(s)».
export const plural = (n: number, uno: string, varios = `${uno}s`) => `${n.toLocaleString("es-MX")} ${n === 1 ? uno : varios}`;
