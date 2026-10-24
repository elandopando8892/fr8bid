// Sesión y transporte. Modo «simulado»: Rateware en memoria con el evento de D5
// y selector de rol. Modo «rateware»: Supabase Auth de rateware-prod (Google) y
// funciones /api; el rol sale de app_metadata.roles y lo aplica el servidor. La
// sesión es la de los módulos de Bidware (AuthProvider): un solo cliente, la
// misma regla de cuentas del equipo y el rol leído fresco del servidor.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthContext";
import { isConfigured } from "@/config/env";
import { getAccessToken } from "@/lib/auth";
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
  // La cuenta que entró fuera de los dominios del equipo («» si no trae correo).
  correoRechazado: string | null;
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
  const auth = useAuth();
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (MODO !== "simulado") return;
    // Import dinámico: el simulado no viaja en el modo rateware.
    simGlobal ??= import("../simulado/semilla").then((m) => m.sembrarDemo()).then((d) => d.sim);
    simGlobal.then((s) => {
      setSim(s);
      setListo(true);
    });
  }, []);

  const api = useMemo(() => {
    if (MODO === "simulado") return new MesaApi(sim ? transporteSimulado(sim, () => usuarioSimulado) : async () => ({ status: 503, body: { error: "Cargando", code: "CARGANDO" }, headers: {} }));
    return new MesaApi(transporteHttp(getAccessToken), undefined, revisorHttp(getAccessToken), apolloHttp(getAccessToken));
  }, [sim, usuarioSimulado]);

  const u = USUARIOS_SIMULADOS.find((x) => x.clave === usuarioSimulado)!;
  const valor: Sesion = {
    modo: MODO,
    api,
    rol: MODO === "simulado" ? u.rol : auth.role,
    correo: MODO === "simulado" ? sim?.usuarios.get(usuarioSimulado)?.email ?? null : auth.user?.email ?? null,
    listo: MODO === "simulado" ? listo : !auth.loading,
    sim,
    usuarioSimulado,
    cambiarUsuarioSimulado: setUsuarioSimulado,
    entrar: auth.login,
    salir: auth.logout,
    error: MODO === "rateware" && !isConfigured ? "Falta VITE_RATEWARE_SUPABASE_URL o VITE_RATEWARE_SUPABASE_ANON_KEY." : null,
    correoRechazado: MODO === "simulado" ? null : auth.deniedEmail
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const NOMBRE_ROL: Record<Rol, string> = { admin: "Administrador", operator: "Operador", viewer: "Consulta" };
