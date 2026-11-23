// «Reportar a Fr8Desk» en la Mesa: abre un caso en Fr8Desk ligado al evento y
// lista los casos que ya tiene. Fr8Desk solo recibe lo que la persona escribe y
// la referencia del evento; el detalle del RFx se queda en Fr8Bid.

import { useCallback, useEffect, useState } from "react";
import { ErrorApi } from "../cliente/api";
import { IMPACTOS, MAX_ASUNTO, MAX_DESCRIPCION, type Impacto } from "../servidor/fr8desk";
import type { CasoFr8Desk } from "../servidor/fr8desk";
import * as I from "./Iconos";
import { useSesion } from "./sesion";

export const ETIQUETA_IMPACTO: Record<Impacto, string> = {
  detiene: "Detiene el evento",
  retrasa: "Retrasa el evento",
  molesta: "Molesta, pero se puede seguir",
  consulta: "Solo es una consulta"
};

export function nuevoRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  h[12] = "4";
  h[16] = "89ab"[Math.floor(Math.random() * 4)];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

interface Formulario {
  requestId: string;
  asunto: string;
  descripcion: string;
  impacto: Impacto;
}

export function ReportarFr8Desk({ eventoId, asuntoInicial }: { eventoId: string; asuntoInicial: string }) {
  const s = useSesion();
  const [casos, setCasos] = useState<CasoFr8Desk[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ folio: string; url: string; repetido: boolean } | null>(null);

  const leer = useCallback(async () => {
    try {
      setCasos(await s.api.casosFr8Desk(eventoId));
      setErrorLista(null);
    } catch (e) {
      setCasos(null);
      setErrorLista(e instanceof Error ? e.message : String(e));
    }
  }, [s.api, eventoId]);
  useEffect(() => {
    setForm(null);
    setCreado(null);
    setError(null);
    void leer();
  }, [leer]);

  // El request_id nace al abrir el formulario y se reúsa en cada reintento.
  const abrir = () => {
    setCreado(null);
    setError(null);
    setForm({ requestId: nuevoRequestId(), asunto: asuntoInicial.slice(0, MAX_ASUNTO), descripcion: "", impacto: "retrasa" });
  };

  const enviar = async () => {
    if (!form || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await s.api.reportarFr8Desk(eventoId, form);
      setCreado(r);
      setForm(null);
      await leer();
    } catch (e) {
      const incierta = e instanceof ErrorApi && e.incierta;
      setError((e instanceof Error ? e.message : String(e)) + (incierta && !/reintentar/i.test(String((e as Error).message)) ? " Puedes reintentar: no se duplica el caso." : ""));
    } finally {
      setEnviando(false);
    }
  };

  const noConfigurado = errorLista !== null && /no configurada/i.test(errorLista);
  const valido = form && form.asunto.trim() && form.descripcion.trim();

  return (
    <div className="tarjeta fr8desk" aria-label="Fr8Desk">
      <div className="fr8desk-cabeza">
        <h2>Casos en Fr8Desk</h2>
        {!form && !noConfigurado && (
          <button className="btn-secundario con-icono" onClick={abrir}>
            <I.Megafono size={15} />Reportar a Fr8Desk
          </button>
        )}
      </div>

      {creado && (
        <div className="estado estado-ok" role="status">
          {creado.repetido ? "Ya estaba registrado: " : "Caso creado: "}
          <a href={creado.url} target="_blank" rel="noreferrer" className="mono">{creado.folio}</a>
        </div>
      )}

      {form && (
        <form
          className="aviso-caja"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <label className="campo"><span>Asunto</span>
            <input value={form.asunto} maxLength={MAX_ASUNTO} required onChange={(e) => setForm({ ...form, asunto: e.target.value })} />
          </label>
          <label className="campo"><span>Qué pasa</span>
            <textarea value={form.descripcion} maxLength={MAX_DESCRIPCION} rows={4} required placeholder="Qué intentabas hacer, qué pasó y desde cuándo" onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </label>
          <label className="campo"><span>Impacto</span>
            <select value={form.impacto} onChange={(e) => setForm({ ...form, impacto: e.target.value as Impacto })}>
              {IMPACTOS.map((i) => (
                <option key={i} value={i}>{ETIQUETA_IMPACTO[i]}</option>
              ))}
            </select>
          </label>
          <p className="tenue">Fr8Desk recibe solo este texto y la referencia del evento.</p>
          {error && <div className="estado estado-error" role="alert">{error}</div>}
          <div className="fila-botones">
            <button type="submit" className="btn-primario" disabled={!valido || enviando}>{enviando ? "Enviando…" : error ? "Reintentar" : "Enviar a Fr8Desk"}</button>
            <button type="button" className="btn-texto" disabled={enviando} onClick={() => { setForm(null); setError(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      {noConfigurado ? (
        <p className="tenue">Integración con Fr8Desk no configurada.</p>
      ) : errorLista ? (
        <p className="tenue">No se pudieron leer los casos: {errorLista} <button className="btn-texto" onClick={() => void leer()}>Reintentar</button></p>
      ) : casos === null ? (
        <p className="tenue">Cargando casos…</p>
      ) : casos.length === 0 ? (
        <p className="tenue">Este evento no tiene casos en Fr8Desk.</p>
      ) : (
        <ul className="fr8desk-casos">
          {casos.map((c) => (
            <li key={c.folio}>
              <a href={c.url} target="_blank" rel="noreferrer" className="mono">{c.folio}</a>
              <span className="fr8desk-asunto">{c.asunto}</span>
              <span className="pill">{c.estado}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
