// /bid/:token — liga privada del carrier sobre rfx-bid-api. Sin sesión: el
// token es la credencial y solo permite responder su propia participación.

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorApi } from "../cliente/api";
import { describirModelo, nombreModelo } from "../dominio/modelo";
import { aCarga, Confirmar, dinero, EstadoVista, fecha, Prueba, type Carga } from "./comun";
import { textoObjetivo } from "./condiciones";
import { useSesion } from "./sesion";

// rubric_key de rfx-bid-api (SEGMENT_CONFIRMATION_RUBRICS).
const RUBROS = ["logistics_model", "operation_criteria", "business_rules", "service_specifications", "carrier_requirements", "other_notes"];
const NOMBRE_RUBRO: Record<string, string> = {
  logistics_model: "Modelo logístico",
  operation_criteria: "Criterios de operación",
  business_rules: "Reglas de negocio",
  service_specifications: "Especificaciones",
  carrier_requirements: "Requisitos de carrier",
  other_notes: "Otras notas"
};

export function LigaCarrier({ token }: { token: string }) {
  const { api, listo } = useSesion();
  const [carga, setCarga] = useState<Carga<any>>({ tipo: "cargando" });
  const [form, setForm] = useState({ bid_rate: "", currency: "USD", commercial_model: "fee_plus", weekly_capacity: "", transit_days: "", valid_through: "", notes: "" });
  const [rubros, setRubros] = useState<Record<string, string>>({});
  // Condiciones de la ruta (R1): respuesta, dato y comentario por rubric_key.
  const [conds, setConds] = useState<Record<string, { answer: string; value: string; comment: string }>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const [enviando, setEnviando] = useState(false);
  const enCurso = useRef(false);

  const leer = useCallback(() => {
    return api.invitacion(token).then(
      (datos) => {
        setCarga({ tipo: "ok", datos, leidoEn: Date.now() });
        const r: Record<string, string> = {};
        const cs: Record<string, { answer: string; value: string; comment: string }> = {};
        for (const c of datos.segment_confirmations || []) {
          if (c.segment_key === "lane") cs[c.rubric_key] = { answer: c.answer === "pending" ? "" : c.answer, value: c.value === null || c.value === undefined ? "" : typeof c.value === "boolean" ? (c.value ? "si" : "no") : String(c.value), comment: c.comment || "" };
          else r[c.rubric_key] = c.answer === "pending" ? "" : c.answer;
        }
        setRubros(r);
        setConds(cs);
        // Corregir parte de la oferta vigente: solo se cambia lo que cambió.
        const v = datos.invitation;
        if (v?.bid_rate !== null && v?.bid_rate !== undefined)
          setForm((f) => (f.bid_rate ? f : {
            bid_rate: String(v.bid_rate),
            currency: v.currency || "USD",
            commercial_model: v.commercial_model || "fee_plus",
            weekly_capacity: v.weekly_capacity == null ? "" : String(v.weekly_capacity),
            transit_days: v.transit_days == null ? "" : String(v.transit_days),
            valid_through: v.valid_through || "",
            notes: ""
          }));
      },
      (e) => setCarga(aCarga(e))
    );
  }, [api, token]);
  useEffect(() => {
    if (listo) leer();
  }, [listo, leer]);

  if (carga.tipo !== "ok") return <EstadoVista carga={carga} reintentar={leer} />;
  const { invitation: inv, event, lane, bid_window_closed } = carga.datos;
  const condiciones: any[] = carga.datos.lane_conditions || [];
  const respuesta = (k: string) => conds[k] || { answer: "", value: "", comment: "" };
  const poner = (k: string, cambio: Partial<{ answer: string; value: string; comment: string }>) => setConds({ ...conds, [k]: { ...respuesta(k), ...cambio } });
  const prueba = /PRUEBA CONTROLADA/i.test(event?.name || "");

  const hacer = async (f: () => Promise<unknown>, ok: string) => {
    if (enCurso.current || bid_window_closed || inv.invitation_status === "declined") return;
    enCurso.current = true;
    setEnviando(true);
    setMsg(null);
    try {
      await f();
      setMsg({ ok: true, texto: ok });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ErrorApi ? e.message : String(e) });
    } finally {
      try {
        await leer();
      } finally {
        enCurso.current = false;
        setEnviando(false);
      }
    }
  };
  const n = (x: string) => (x === "" ? null : Number(x));

  return (
    <section className="liga" aria-busy={enviando}>
      <header className="cabecera">
        <div>
          <p className="miga">Invitación · {event.rfx_id}</p>
          <h1>{lane.origin_city} → {lane.destination_city}</h1>
          <p className="tenue">{lane.equipment} · {lane.weekly_volume ?? "—"}/sem · plazo {fecha(event.due_date)}</p>
        </div>
        {prueba && <Prueba />}
      </header>
      {msg && <div className={msg.ok ? "estado estado-ok" : "estado estado-error"} role={msg.ok ? "status" : "alert"}>{msg.texto}</div>}
      {bid_window_closed && <div className="estado estado-permiso">Esta puja ya cerró. Ya no se aceptan ofertas.</div>}
      {inv.bid_rate !== null && (
        <div className="tarjeta">
          <h2>Tu oferta vigente</h2>
          <p>
            {dinero(inv.bid_rate, inv.currency)} all-in · {describirModelo({ modeloComercial: String(inv.commercial_model || "cost_plus"), carrierSharePct: inv.carrier_share_pct ?? null, margenPct: inv.marksman_margin_pct ?? null })} · {inv.valid_through ? `vigente hasta ${fecha(inv.valid_through)}` : "sin vigencia"}
          </p>
          {inv.award_role && <p><b>Adjudicada como {inv.award_role === "primary" ? "primario" : "respaldo"}.</b></p>}
        </div>
      )}
      {!bid_window_closed && inv.invitation_status !== "declined" && (
        <form
          className="tarjeta formulario"
          onSubmit={(e) => {
            e.preventDefault();
            hacer(
              () =>
                api.enviarOferta(token, {
                  bid_rate: n(form.bid_rate),
                  currency: form.currency,
                  commercial_model: form.commercial_model,
                  weekly_capacity: n(form.weekly_capacity),
                  transit_days: n(form.transit_days),
                  valid_through: form.valid_through || null,
                  notes: form.notes || null,
                  language: "es"
                }),
              "Oferta recibida. Puedes corregirla hasta el plazo; cada corrección queda en el historial."
            );
          }}
        >
          <h2>{inv.bid_rate === null ? "Enviar oferta" : "Corregir oferta"}</h2>
          <div className="rejilla">
            <label className="campo"><span>Tarifa all-in</span><input required inputMode="decimal" value={form.bid_rate} onChange={(e) => setForm({ ...form, bid_rate: e.target.value })} /></label>
            <label className="campo"><span>Moneda</span><select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option>USD</option><option>MXN</option></select></label>
            <label className="campo"><span>Modelo comercial</span><select value={form.commercial_model} onChange={(e) => setForm({ ...form, commercial_model: e.target.value })}>{["fee_plus", "cost_plus", "sell_share", "brokerage"].map((m) => <option key={m} value={m}>{nombreModelo(m)}</option>)}</select></label>
            <label className="campo"><span>Capacidad semanal</span><input inputMode="numeric" value={form.weekly_capacity} onChange={(e) => setForm({ ...form, weekly_capacity: e.target.value })} /></label>
            <label className="campo"><span>Tránsito (días)</span><input inputMode="numeric" value={form.transit_days} onChange={(e) => setForm({ ...form, transit_days: e.target.value })} /></label>
            <label className="campo"><span>Vigente hasta</span><input type="date" value={form.valid_through} onChange={(e) => setForm({ ...form, valid_through: e.target.value })} /></label>
          </div>
          <label className="campo"><span>Nota (sin valor comercial)</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="fila-botones">
            <button className="btn-primario" type="submit" disabled={enviando}>{enviando ? "Procesando…" : inv.bid_rate === null ? "Enviar oferta" : "Enviar corrección"}</button>
            <Confirmar deshabilitado={enviando} etiqueta="Declinar invitación" clase="btn-texto" advertencia="Ya no podrás ofertar en esta ruta." onConfirmar={() => hacer(() => api.declinar(token), "Invitación declinada.")} />
          </div>
        </form>
      )}
      {!bid_window_closed && inv.invitation_status !== "declined" && condiciones.length > 0 && (
        <div className="tarjeta">
          <h2>Condiciones de la ruta</h2>
          <p className="tenue">Contesta cada una con el dato. «Cumple con condición» pide explicar la condición; las obligatorias sin cumplir impiden la adjudicación.</p>
          {condiciones.map((c) => {
            const r = respuesta(c.rubric_key);
            const vieja = conds[c.rubric_key] && carga.datos.segment_confirmations?.find((x: any) => x.rubric_key === c.rubric_key)?.condition_revision < c.revision;
            return (
              <div key={c.rubric_key} className="condicion">
                <div className="fila">
                  <b>{c.label_es}</b>
                  <span className={c.importance === "required" ? "pill" : "pill tenue"}>{c.importance === "required" ? "Obligatoria" : "Deseable"}</span>
                </div>
                {(textoObjetivo(c) || c.note) && <p className="tenue">{[textoObjetivo(c) && `Se pide: ${textoObjetivo(c)}`, c.note].filter(Boolean).join(" · ")}</p>}
                {vieja && <p className="alerta">El equipo cambió esta condición: confírmala otra vez.</p>}
                <div className="fila-botones">
                  <select value={r.answer} onChange={(e) => poner(c.rubric_key, { answer: e.target.value })} aria-label="Respuesta">
                    <option value="">Sin respuesta</option>
                    <option value="agree">Cumple</option>
                    <option value="exception">Cumple con condición</option>
                    <option value="disagree">No cumple</option>
                    <option value="not_applicable">No aplica</option>
                  </select>
                  {c.kind === "boolean" ? (
                    <select value={r.value} onChange={(e) => poner(c.rubric_key, { value: e.target.value })} aria-label="Dato">
                      <option value="">—</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  ) : c.kind === "choice" ? (
                    <select value={r.value} onChange={(e) => poner(c.rubric_key, { value: e.target.value })} aria-label="Dato">
                      <option value="">—</option>
                      {(c.choices || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      aria-label="Dato"
                      placeholder={c.kind === "text" ? "Detalle" : `Tu dato${c.unit ? ` (${c.unit})` : ""}`}
                      inputMode={c.kind === "text" ? "text" : "decimal"}
                      value={r.value}
                      onChange={(e) => poner(c.rubric_key, { value: e.target.value })}
                    />
                  )}
                  {r.answer === "exception" && <input aria-label="Condición" placeholder="¿Con qué condición?" value={r.comment} onChange={(e) => poner(c.rubric_key, { comment: e.target.value })} />}
                </div>
              </div>
            );
          })}
          <button
            className="btn-secundario"
            disabled={enviando}
            onClick={() =>
              hacer(
                () =>
                  api.responderRubros(
                    token,
                    condiciones
                      .filter((c) => respuesta(c.rubric_key).answer)
                      .map((c) => ({
                        segment_key: "lane",
                        rubric_key: c.rubric_key,
                        answer: respuesta(c.rubric_key).answer,
                        value: respuesta(c.rubric_key).value || null,
                        comment: respuesta(c.rubric_key).comment || null
                      }))
                  ),
                "Condiciones guardadas."
              )
            }
          >
            Guardar condiciones
          </button>
        </div>
      )}
      {!bid_window_closed && inv.invitation_status !== "declined" && !condiciones.length && (
        <div className="tarjeta">
          <h2>Rubros</h2>
          {RUBROS.map((k) => (
            <label key={k} className="fila rubro">
              <span>{NOMBRE_RUBRO[k]}</span>
              <select value={rubros[k] || ""} onChange={(e) => setRubros({ ...rubros, [k]: e.target.value })}>
                <option value="">Sin respuesta</option>
                <option value="agree">De acuerdo</option>
                <option value="exception">Con excepción</option>
                <option value="disagree">No puedo</option>
                <option value="not_applicable">No aplica</option>
              </select>
            </label>
          ))}
          <button
            className="btn-secundario"
            disabled={enviando}
            onClick={() =>
              hacer(
                () =>
                  api.responderRubros(
                    token,
                    Object.entries(rubros)
                      .filter(([, v]) => v)
                      .map(([rubric_key, answer]) => ({ segment_key: carga.datos.lane?.rfx_segment_key || "general", rubric_key, answer }))
                  ),
                "Rubros guardados."
              )
            }
          >
            Guardar rubros
          </button>
        </div>
      )}
    </section>
  );
}
