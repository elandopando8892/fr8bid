// Búsqueda global: eventos por nombre, folio, shipper o ciudad, las secciones y
// los trabajos de todos los días. Se abre con «/» o Ctrl+K desde cualquier
// pantalla del equipo; Enter abre el primero y las flechas se mueven.
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ContextoEventos } from "./Eventos";
import { porUrgencia } from "./eventosVista";
import { buscar, entradasDeEventos, entradasDeNavegacion, type Resultado } from "./navegacion";
import * as I from "./Iconos";

const escribiendo = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

export function useAtajoBuscar(abrir: () => void) {
  useEffect(() => {
    const alTeclear = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      if ((k === "k" && (ev.ctrlKey || ev.metaKey)) || (ev.key === "/" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !escribiendo(ev.target))) {
        ev.preventDefault();
        abrir();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abrir]);
}

export function BotonBuscar({ onAbrir, compacto }: { onAbrir: () => void; compacto?: boolean }) {
  return (
    <button type="button" className={`buscar-global ${compacto ? "compacto" : ""}`} onClick={onAbrir} aria-label="Buscar eventos y secciones" aria-keyshortcuts="/ Control+K">
      <I.Lupa size={16} />
      {!compacto && <span className="buscar-texto">Buscar</span>}
      {!compacto && <kbd aria-hidden>/</kbd>}
    </button>
  );
}

export function Buscador({ abierto, cerrar, ir }: { abierto: boolean; cerrar: () => void; ir: (a: string, externa?: boolean) => void }) {
  const lectura = useContext(ContextoEventos);
  const eventos = lectura?.carga.tipo === "ok" ? lectura.carga.datos : null;
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const entradas = useMemo(() => [...entradasDeEventos(eventos ?? []), ...entradasDeNavegacion()], [eventos]);
  // Sin texto: los eventos que esperan una decisión, para no empezar en blanco.
  const sugeridos = useMemo(
    () => entradasDeEventos([...(eventos ?? [])].filter((e) => !e.prueba && ["cerrado", "abierto", "borrador"].includes(e.estado)).sort(porUrgencia).slice(0, 5)),
    [eventos]
  );
  const resultados: Resultado[] = q.trim() ? buscar(q, entradas) : sugeridos;

  const caja = useRef<HTMLDivElement>(null);
  // Al cerrar, el foco regresa a donde estaba (el botón Buscar o la pantalla).
  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    return () => { if (previo && document.contains(previo)) previo.focus(); };
  }, [abierto]);
  useEffect(() => {
    if (!abierto) return;
    setQ("");
    setCursor(0);
    const t = setTimeout(() => campo.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [abierto]);
  // Si la lista cambia (llegan los eventos o cambia el texto), el cursor vuelve al primero.
  useEffect(() => setCursor(0), [q, resultados.length]);

  if (!abierto) return null;
  const elegir = (r: Resultado | undefined) => {
    if (!r) return;
    cerrar();
    ir(r.a, r.externa);
  };
  return (
    <div className="buscador-fondo" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) cerrar(); }}>
      <div
        ref={caja}
        className="buscador-global"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en Fr8Bid"
        onKeyDown={(ev) => {
          // Escape cierra desde cualquier parte del diálogo; Tab no sale de él.
          if (ev.key === "Escape") { ev.preventDefault(); cerrar(); return; }
          if (ev.key !== "Tab" || !caja.current) return;
          const enfocables = [...caja.current.querySelectorAll<HTMLElement>("input, button")].filter((el) => !el.hasAttribute("disabled"));
          if (!enfocables.length) return;
          const primero = enfocables[0];
          const ultimo = enfocables[enfocables.length - 1];
          if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
          else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
        }}
      >
        <label className="buscador-campo">
          <I.Lupa size={18} />
          <input
            ref={campo}
            type="search"
            value={q}
            placeholder="Evento, folio, shipper o sección…"
            aria-label="Buscar en Fr8Bid"
            aria-controls="buscador-resultados"
            aria-activedescendant={resultados[cursor] ? `buscador-r${cursor}` : undefined}
            onChange={(ev) => setQ(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "ArrowDown") { ev.preventDefault(); setCursor((c) => Math.max(0, Math.min(c + 1, resultados.length - 1))); }
              else if (ev.key === "ArrowUp") { ev.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (ev.key === "Enter") { ev.preventDefault(); elegir(resultados[cursor]); }
            }}
          />
          <button type="button" className="btn-texto" onClick={cerrar}>Cerrar</button>
        </label>
        {!q.trim() && resultados.length > 0 && <p className="buscador-titulo">Te esperan</p>}
        <ul id="buscador-resultados" role="listbox" aria-label="Resultados" className="buscador-resultados">
          {resultados.map((r, i) => (
            <li key={`${r.tipo}${r.a}${r.etiqueta}`} id={`buscador-r${i}`} role="option" aria-selected={i === cursor}>
              <button type="button" className={i === cursor ? "activo" : ""} onMouseEnter={() => setCursor(i)} onClick={() => elegir(r)}>
                {r.tipo === "evento" ? <I.Martillo size={16} /> : r.tipo === "accion" ? <I.Mas size={16} /> : <I.Flecha size={16} />}
                <span className="buscador-etiqueta">{r.etiqueta}</span>
                <span className="buscador-detalle">{r.detalle}</span>
              </button>
            </li>
          ))}
        </ul>
        {q.trim() && !resultados.length && <p className="buscador-vacio">Nada coincide con «{q.trim()}». Prueba con el folio o el shipper.</p>}
        {!eventos && <p className="buscador-vacio">Los eventos aún se están leyendo; las secciones ya se pueden buscar.</p>}
      </div>
    </div>
  );
}
