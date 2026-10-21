// /bid/:token — liga privada del carrier sobre rfx-bid-api. Sin sesión: el
// token es la credencial y solo permite responder su propia participación.

import { useCallback, useEffect, useState } from "react";
import { ErrorApi } from "../cliente/api";
import { aCarga, dinero, EstadoVista, fecha, Prueba, type Carga } from "./comun";
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
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const leer = useCallback(() => {
    api.invitacion(token).then(
      (datos) => {
        setCarga({ tipo: "ok", datos, leidoEn: Date.now() });
        const r: Record<string, string> = {};
        for (const c of datos.segment_confirmations || []) r[c.rubric_key] = c.answer === "pending" ? "" : c.answer;
        setRubros(r);
      },
      (e) => setCarga(aCarga(e))
    );
  }, [api, token]);
  useEffect(() => {
    if (listo) leer();
  }, [listo, leer]);

  if (carga.tipo !== "ok") return <EstadoVista carga={carga} reintentar={leer} />;
  const { invitation: inv, event, lane, bid_window_closed } = carga.datos;
  const prueba = /PRUEBA CONTROLADA/i.test(event?.name || "");

  const hacer = async (f: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await f();
      setMsg({ ok: true, texto: ok });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ErrorApi ? e.message : String(e) });
    }
    leer();
  };
  const n = (x: string) => (x === "" ? null : Number(x));

  return (
    <section className="liga">
      <header className="cabecera">
        <div>
          <p className="miga">Invitación · {event.rfx_id}</p>
          <h1>{lane.origin_city} → {lane.destination_city}</h1>
          <p className="tenue">{lane.equipment} · {lane.weekly_volume ?? "—"}/sem · plazo {fecha(event.due_date)}</p>
        </div>
        {prueba && <Prueba />}
      </header>
      {msg && <div className={msg.ok ? "estado estado-ok" : "estado estado-error"}>{msg.texto}</div>}
      {bid_window_closed && <div className="estado estado-permiso">Esta puja ya cerró. Ya no se aceptan ofertas.</div>}
      {inv.bid_rate !== null && (
        <div className="tarjeta">
          <h2>Tu oferta vigente</h2>
          <p>
            {dinero(inv.bid_rate, inv.currency)} all-in · {inv.commercial_model} · vigencia {inv.valid_through ? fecha(inv.valid_through) : "sin vigencia"}
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
            <label className="campo"><span>Modelo comercial</span><select value={form.commercial_model} onChange={(e) => setForm({ ...form, commercial_model: e.target.value })}><option value="fee_plus">fee_plus</option><option value="cost_plus">cost_plus</option><option value="sell_share">sell_share</option><option value="brokerage">brokerage</option></select></label>
            <label className="campo"><span>Capacidad semanal</span><input inputMode="numeric" value={form.weekly_capacity} onChange={(e) => setForm({ ...form, weekly_capacity: e.target.value })} /></label>
            <label className="campo"><span>Tránsito (días)</span><input inputMode="numeric" value={form.transit_days} onChange={(e) => setForm({ ...form, transit_days: e.target.value })} /></label>
            <label className="campo"><span>Vigente hasta</span><input type="date" value={form.valid_through} onChange={(e) => setForm({ ...form, valid_through: e.target.value })} /></label>
          </div>
          <label className="campo"><span>Nota (sin valor comercial)</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="fila-botones">
            <button className="btn-primario" type="submit">Enviar oferta</button>
            <button className="btn-texto" type="button" onClick={() => hacer(() => api.declinar(token), "Invitación declinada.")}>Declinar invitación</button>
          </div>
        </form>
      )}
      {!bid_window_closed && inv.invitation_status !== "declined" && (
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
