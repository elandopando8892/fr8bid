import { useEffect, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { getAccessToken } from "@/lib/auth";
import { contactosHttp } from "../cliente/contactosEmpresa";
import type { ClienteContactos, ContextoContacto } from "../dominio/contactosEmpresa";
import type { Detalle } from "../dominio/tipos";
import { ContactosEmpresa } from "./ContactosEmpresa";
import { useSesion, type Sesion } from "./sesion";

export function contextoDeContactos(evento: string, s: Pick<Sesion, "identidad" | "modo" | "correo" | "rol" | "usuarioSimulado">) {
  return JSON.stringify([evento, s.identidad, s.modo, s.correo, s.rol, s.usuarioSimulado]);
}

export function ContactosDeMesa({ detalle, actualizar }: { detalle: Detalle; actualizar: () => void }) {
  const s = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const location = useLocation();
  const contexto = contextoDeContactos(detalle.evento.id, s);
  const mismaSesion = location.state?.contactosContexto === contexto;
  const estadoNavegacion = { ...(typeof location.state === "object" && location.state ? location.state : {}), contactosContexto: contexto };
  // History state survives reload without putting account identity in the URL.
  // A different account must not inherit the previous queue selection/filter.
  useEffect(() => {
    if (!mismaSesion && (parametros.has("contacto") || parametros.has("contactoFiltro"))) {
      setParametros(p => { const next = new URLSearchParams(p); next.delete("contacto"); next.delete("contactoFiltro"); return next; }, { replace: true, state: estadoNavegacion });
    }
  }, [contexto, mismaSesion, parametros, setParametros]);
  const recordar = (campo: string, valor: string) => setParametros(p => { const next = new URLSearchParams(p); if (!mismaSesion) { next.delete("contacto"); next.delete("contactoFiltro"); } if (valor) next.set(campo, valor); else next.delete(campo); return next; }, { replace: true, state: estadoNavegacion });
  const empresas = [...new Map(detalle.rutas.flatMap(r => r.participaciones).map(p => [p.carrierId, { id: p.carrierId, nombre: p.carrier, correo: p.correo }])).values()];
  const cliente = useMemo<ClienteContactos>(() => {
    if (s.modo === "rateware") return contactosHttp(getAccessToken);
    // The demo only reads existing synthetic vendors; no external provider.
    return async solicitud => {
      if (solicitud.action !== "context") throw new Error("Acción disponible en la conexión con Rateware.");
      const usuario = s.sim?.usuarios.get(s.usuarioSimulado);
      const v = s.sim?.vendors.find(v => v.id === solicitud.vendor_id && v.owner_email === usuario?.ownerEmail);
      if (!v) throw new Error("No se encontró esta empresa en la demostración.");
      const c: ContextoContacto = {
        vendor: { id: v.id, name: v.vendor_name, domain: v.domain || "", email: v.primary_email || null },
        known: { state: v.primary_email ? "current" : "missing", candidates: [] }, operation: null, available: true,
        capabilities: { can_write: false, can_search: false, can_spend: false, max_credits: null }
      };
      return c;
    };
  }, [s.modo, s.sim, s.usuarioSimulado]);
  if (!s.rolLeido) return <p role="status">Comprobando acceso a contactos…</p>;
  return <ContactosEmpresa empresas={empresas} contexto={contexto} cliente={cliente}
    seleccionInicial={mismaSesion ? parametros.get("contacto") : null} filtroInicial={mismaSesion ? parametros.get("contactoFiltro") || "" : ""}
    onSeleccion={id => recordar("contacto", id)} onFiltro={valor => recordar("contactoFiltro", valor)} simulado={s.modo === "simulado"} onVinculado={actualizar} />;
}
