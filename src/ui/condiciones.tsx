// Condiciones de ruta (parche R1): editor del equipo por ruta, matriz del
// comparativo y textos compartidos con la liga del carrier.

import { useEffect, useMemo, useState } from "react";
import type { EntradaCatalogo } from "../dominio/condiciones-r1";
import { revisarCondiciones } from "../dominio/recorrido";
import type { CondicionRuta, Detalle, Participacion, Ruta } from "../dominio/tipos";
import { useSesion } from "./sesion";

export const GRUPOS: Record<string, string> = {
  equipment: "Equipo",
  capacity: "Capacidad y tiempos",
  cross_border: "Cruce fronterizo",
  compliance: "Seguro y cumplimiento",
  pricing: "Tarifa y accesoriales",
  service: "Servicio y seguridad",
  payment: "Pago"
};

const UNIDADES: Record<string, string> = {
  years: "años",
  loads_per_week: "cargas/sem",
  hours: "h",
  days: "días",
  USD: "USD",
  USD_per_hour: "USD/h"
};

const OPCIONES: Record<string, string> = { direct: "directo", transfer: "transfer" };

export function textoValor(v: unknown, unidad?: string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return `${v.toLocaleString("es-MX")}${unidad ? ` ${UNIDADES[unidad] || unidad}` : ""}`;
  return OPCIONES[String(v)] || String(v);
}

export function textoObjetivo(c: { comparador?: string | null; comparator?: string | null; objetivo?: unknown; target?: unknown; unidad?: string | null; unit?: string | null }): string {
  const objetivo = c.objetivo !== undefined ? c.objetivo : c.target;
  if (objetivo === null || objetivo === undefined || objetivo === "") return "";
  const comp = c.comparador ?? c.comparator;
  const pre = comp === "min" ? "al menos " : comp === "max" ? "a lo más " : "";
  return pre + textoValor(objetivo, c.unidad ?? c.unit);
}

// Juegos sugeridos por tipo de ruta; el Operador los ajusta.
const JUEGOS: Record<string, string[]> = {
  "Cruce MX-US": ["trailer_spec", "weekly_capacity_loads", "transit_days", "crossing_model", "crossing_port", "ctpat_oea", "scac_caat", "cargo_insurance_usd", "carta_porte_cfdi", "allin_inclusions", "detention_rate_usd_hour", "tracking_link"],
  "Nacional MX": ["trailer_spec", "weekly_capacity_loads", "transit_days", "cargo_insurance_usd", "mx_sct_permit", "carta_porte_cfdi", "allin_inclusions", "tracking_link", "mx_security"],
  Local: ["trailer_spec", "assignment_lead_hours", "appointment_windows", "cargo_insurance_usd", "carta_porte_cfdi", "pod_hours"]
};

type Fila = { usar: boolean; obligatoria: boolean; objetivo: string; nota: string };

const aTexto = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "si" : "no") : String(v));

export function EditorCondiciones({ d, ruta, accion }: { d: Detalle; ruta: Ruta; accion: (f: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const s = useSesion();
  const [catalogo, setCatalogo] = useState<EntradaCatalogo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inicial = useMemo(() => {
    const m: Record<string, Fila> = {};
    for (const c of ruta.condiciones) m[c.clave] = { usar: true, obligatoria: c.obligatoria, objetivo: aTexto(c.objetivo), nota: c.nota || "" };
    return m;
  }, [ruta.condiciones]);
  const [filas, setFilas] = useState<Record<string, Fila>>(inicial);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => setFilas(inicial), [inicial]);
  useEffect(() => {
    if (!abierto || catalogo) return;
    s.api.catalogoCondiciones().then(setCatalogo, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [abierto, catalogo, s.api]);

  if (!abierto) return <button className="btn-texto" onClick={() => setAbierto(true)}>{ruta.condiciones.length ? "Editar condiciones" : "Elegir condiciones de la ruta"}</button>;
  if (error) return <p className="error-texto">{error}</p>;
  if (!catalogo) return <p className="tenue">Leyendo catálogo…</p>;

  const fila = (k: string): Fila => filas[k] || { usar: false, obligatoria: true, objetivo: "", nota: "" };
  const poner = (k: string, cambio: Partial<Fila>) => setFilas({ ...filas, [k]: { ...fila(k), ...cambio } });
  const elegidas = catalogo.filter((e) => fila(e.key).usar);
  const guardar = () =>
    accion(
      () =>
        s.api.guardarCondiciones(
          d.evento.id,
          ruta.id,
          elegidas.map((e) => ({
            condition_key: e.key,
            importance: fila(e.key).obligatoria ? "required" : "preferred",
            target: fila(e.key).objetivo.trim() || null,
            note: fila(e.key).nota.trim() || null
          }))
        ),
      "Condiciones guardadas. Si cambiaste una, los carriers que ya contestaron deben confirmarla otra vez."
    ).then(() => setAbierto(false));

  return (
    <div className="aviso-caja">
      <h3>Condiciones de la ruta {ruta.numero}</h3>
      <div className="fila-botones">
        <span className="tenue">Sugerido:</span>
        {Object.entries(JUEGOS).map(([nombre, claves]) => (
          <button
            key={nombre}
            className="btn-texto"
            onClick={() => {
              const m = { ...filas };
              for (const k of claves) m[k] = { ...fila(k), usar: true };
              setFilas(m);
            }}
          >
            {nombre}
          </button>
        ))}
      </div>
      {Object.entries(GRUPOS).map(([g, titulo]) => (
        <fieldset key={g} className="grupo-condiciones">
          <legend>{titulo}</legend>
          {catalogo
            .filter((e) => e.group === g)
            .map((e) => {
              const f = fila(e.key);
              return (
                <div key={e.key} className="condicion">
                  <label className="fila">
                    <input type="checkbox" checked={f.usar} onChange={(x) => poner(e.key, { usar: x.target.checked })} />
                    <span>{e.es}</span>
                  </label>
                  {f.usar && (
                    <div className="fila-botones">
                      <select value={f.obligatoria ? "si" : "no"} onChange={(x) => poner(e.key, { obligatoria: x.target.value === "si" })} aria-label="Importancia">
                        <option value="si">Obligatoria</option>
                        <option value="no">Deseable</option>
                      </select>
                      {e.kind === "boolean" ? (
                        <select value={f.objetivo} onChange={(x) => poner(e.key, { objetivo: x.target.value })} aria-label="Objetivo">
                          <option value="">Sin objetivo</option>
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      ) : e.kind === "choice" ? (
                        <select value={f.objetivo} onChange={(x) => poner(e.key, { objetivo: x.target.value })} aria-label="Objetivo">
                          <option value="">Sin objetivo</option>
                          {e.choices!.map((o) => <option key={o} value={o}>{OPCIONES[o] || o}</option>)}
                        </select>
                      ) : (
                        <input
                          placeholder={e.kind === "text" ? "Qué se pide" : `${e.comparator === "min" ? "Al menos" : e.comparator === "max" ? "A lo más" : "Objetivo"}${e.unit ? ` (${UNIDADES[e.unit] || e.unit})` : ""}`}
                          inputMode={e.kind === "text" ? "text" : "decimal"}
                          value={f.objetivo}
                          onChange={(x) => poner(e.key, { objetivo: x.target.value })}
                        />
                      )}
                      <input placeholder="Nota (opcional)" value={f.nota} onChange={(x) => poner(e.key, { nota: x.target.value })} />
                    </div>
                  )}
                </div>
              );
            })}
        </fieldset>
      ))}
      <div className="fila-botones">
        <button className="btn-secundario" onClick={guardar}>Guardar {elegidas.length === 1 ? "1 condición" : `${elegidas.length} condiciones`}</button>
        <button className="btn-texto" onClick={() => { setFilas(inicial); setAbierto(false); }}>Cancelar</button>
      </div>
    </div>
  );
}

export function ListaCondiciones({ condiciones }: { condiciones: CondicionRuta[] }) {
  if (!condiciones.length) return <p className="tenue">Sin condiciones de ruta: los carriers solo contestan los rubros generales.</p>;
  return (
    <ul className="lista-condiciones">
      {condiciones.map((c) => (
        <li key={c.clave}>
          <span className={c.obligatoria ? "pill" : "pill tenue"}>{c.obligatoria ? "Obligatoria" : "Deseable"}</span> {c.etiqueta}
          {textoObjetivo(c) && <span className="tenue"> · {textoObjetivo(c)}</span>}
          {c.nota && <span className="tenue"> · {c.nota}</span>}
        </li>
      ))}
    </ul>
  );
}

const MARCA: Record<string, string> = { de_acuerdo: "Cumple", excepcion: "Con condición", no_puedo: "No cumple", no_aplica: "No aplica", sin_respuesta: "Sin respuesta" };

// Comparativo: una fila por condición, una columna por carrier con oferta.
export function MatrizCondiciones({ ruta, carriers }: { ruta: Ruta; carriers: Participacion[] }) {
  if (!ruta.condiciones.length || !carriers.length) return null;
  return (
    <div className="tabla-envoltura">
      <h3>Condiciones por carrier</h3>
      <table className="tabla matriz-condiciones">
        <thead>
          <tr>
            <th>Condición</th>
            {carriers.map((p) => {
              const r = revisarCondiciones(ruta, p);
              return (
                <th key={p.id}>
                  {p.carrier}
                  <div className={r.bloquean.length ? "error-texto" : "tenue"}>
                    {r.bloquean.length ? `Bloquea: ${r.bloquean.length}` : `${r.cumplidas}/${r.total} cumple`}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ruta.condiciones.map((c) => (
            <tr key={c.clave}>
              <td>
                {c.etiqueta}
                <div className="tenue">{c.obligatoria ? "Obligatoria" : "Deseable"}{textoObjetivo(c) ? ` · ${textoObjetivo(c)}` : ""}</div>
              </td>
              {carriers.map((p) => {
                const r = p.condiciones[c.clave];
                const vieja = r && (r.revision === null || r.revision < c.revision);
                const estado = !r ? "sin_respuesta" : r.estado;
                const malo = vieja || estado === "no_puedo" || estado === "sin_respuesta";
                return (
                  <td key={p.id} className={malo ? (c.obligatoria ? "celda-no" : "celda-aviso") : estado === "excepcion" ? "celda-aviso" : ""}>
                    {vieja ? "Por confirmar de nuevo" : MARCA[estado]}
                    {r && r.valor !== null && <div className="mono">{textoValor(r.valor, c.unidad)}</div>}
                    {r?.comentario && <div className="tenue">{r.comentario}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
