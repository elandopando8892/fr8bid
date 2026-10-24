// Sesión y transporte. Modo «simulado»: Rateware en memoria con el evento de D5
// y selector de rol. Modo «rateware»: Supabase Auth de rateware-prod (Google) y
// funciones /api; el rol sale de app_metadata.roles y lo aplica el servidor.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MesaApi, apolloHttp, revisorHttp, transporteHttp, transporteSimulado } from "../cliente/api";
import type { Rol } from "../dominio/tipos";
import type { RatewareSimulado } from "../simulado/rateware";

export const MODO: "simulado" | "rateware" = import.meta.env.VITE_FR8BID_MODO === "rateware" ? "rateware" : "simulado";

export interface Sesion {
  modo: typeof MODO;
  api: MesaApi;
  rol: Rol;
  correo: string | null;
  listo: boolean;
  sim: RatewareSimulado | null;
  usuarioSimulado: string;
  cambiarUsuarioSimulado: (clave: string) => void;
  entrar: () => Promise<void>;
  salir: () => Promise<void>;
  error: string | null;
}

const Ctx = createContext<Sesion | null>(null);
export const useSesion = () => useContext(Ctx)!;

export const USUARIOS_SIMULADOS: { clave: string; nombre: string; rol: Rol }[] = [
  { clave: "admin", nombre: "Administrador", rol: "admin" },
  { clave: "operador", nombre: "Operador", rol: "operator" },
  { clave: "consulta", nombre: "Consulta", rol: "viewer" },
  { clave: "ajeno", nombre: "Otra organización", rol: "admin" }
];

let simGlobal: Promise<RatewareSimulado> | null = null;

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sim, setSim] = useState<RatewareSimulado | null>(null);
  const [usuarioSimulado, setUsuarioSimulado] = useState("admin");
  const [supa] = useState<SupabaseClient | null>(() => {
    const url = import.meta.env.VITE_RATEWARE_SUPABASE_URL;
    const key = import.meta.env.VITE_RATEWARE_SUPABASE_ANON_KEY;
    return MODO === "rateware" && url && key ? createClient(url, key) : null;
  });
  const [real, setReal] = useState<{ token: string | null; correo: string | null; rol: Rol }>({ token: null, correo: null, rol: "viewer" });
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (MODO === "simulado") {
      // Import dinámico: el simulado no viaja en el modo rateware.
      simGlobal ??= import("../simulado/semilla").then((m) => m.sembrarDemo()).then((d) => d.sim);
      simGlobal.then((s) => {
        setSim(s);
        setListo(true);
      });
      return;
    }
    if (!supa) {
      setError("Falta VITE_RATEWARE_SUPABASE_URL o VITE_RATEWARE_SUPABASE_ANON_KEY.");
      setListo(true);
      return;
    }
    const aplicar = (s: any) => {
      const roles: string[] = s?.user?.app_metadata?.roles || [];
      const rol: Rol = roles.includes("admin") ? "admin" : roles.includes("operator") ? "operator" : "viewer";
      setReal({ token: s?.access_token ?? null, correo: s?.user?.email ?? null, rol });
    };
    supa.auth.getSession().then(({ data }) => {
      aplicar(data.session);
      setListo(true);
    });
    const { data } = supa.auth.onAuthStateChange((_e, s) => aplicar(s));
    return () => data.subscription.unsubscribe();
  }, [supa]);

  const api = useMemo(() => {
    if (MODO === "simulado") return new MesaApi(sim ? transporteSimulado(sim, () => usuarioSimulado) : async () => ({ status: 503, body: { error: "Cargando", code: "CARGANDO" }, headers: {} }));
    const token = async () => (await supa?.auth.getSession())?.data.session?.access_token ?? null;
    return new MesaApi(transporteHttp(token), undefined, revisorHttp(token), apolloHttp(token));
  }, [sim, usuarioSimulado, supa]);

  const u = USUARIOS_SIMULADOS.find((x) => x.clave === usuarioSimulado)!;
  const valor: Sesion = {
    modo: MODO,
    api,
    rol: MODO === "simulado" ? u.rol : real.rol,
    correo: MODO === "simulado" ? sim?.usuarios.get(usuarioSimulado)?.email ?? null : real.correo,
    listo,
    sim,
    usuarioSimulado,
    cambiarUsuarioSimulado: setUsuarioSimulado,
    entrar: async () => {
      await supa?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    },
    salir: async () => {
      await supa?.auth.signOut();
    },
    error
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const NOMBRE_ROL: Record<Rol, string> = { admin: "Administrador", operator: "Operador", viewer: "Consulta" };
