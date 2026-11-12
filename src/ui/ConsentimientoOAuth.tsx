// /oauth/consent — pantalla de consentimiento del servidor OAuth de Supabase para el MCP
// de Fr8Bid (ChatGPT, Claude). Solo autoriza lecturas: el MCP no escribe nada.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { env } from "@/config/env";
import { getAccessToken } from "@/lib/auth";
import { decidir, idValido, leerAutorizacion, nombreCliente, RETORNO, type DetalleAutorizacion } from "../cliente/consentimiento";

/** auth.<dominio>: el dominio neutro que aloja solo el consentimiento (Site URL de Auth). */
export const esDominioDeAcceso = (host: string) => /^auth\.[a-z0-9.-]+$/i.test(host) && !host.endsWith(".vercel.app");

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "pedir"; detalle: DetalleAutorizacion }
  | { tipo: "enviando" }
  | { tipo: "listo"; url: string };

export function ConsentimientoOAuth() {
  const [params] = useSearchParams();
  const id = params.get("authorization_id");
  const { loading, authenticated, user, login } = useAuth();
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  const operacion = async () => {
    const token = await getAccessToken();
    if (!token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    return { base: env.supabaseUrl, anon: env.supabaseAnonKey, token };
  };

  useEffect(() => {
    if (loading || !authenticated) return;
    if (!idValido(id)) return setEstado({ tipo: "error", mensaje: "La liga de autorización no es válida." });
    let vivo = true;
    operacion()
      .then(op => leerAutorizacion(op, id))
      .then(r => {
        if (!vivo) return;
        if (r.tipo === "redirigir") { setEstado({ tipo: "listo", url: r.url }); window.location.assign(r.url); }
        else setEstado({ tipo: "pedir", detalle: r.detalle });
      })
      .catch(e => vivo && setEstado({ tipo: "error", mensaje: e instanceof Error ? e.message : String(e) }));
    return () => { vivo = false; };
  }, [loading, authenticated, id]);

  const entrar = () => {
    if (idValido(id)) {
      try { sessionStorage.setItem(RETORNO, `/oauth/consent?authorization_id=${encodeURIComponent(id)}`); } catch { /* sin almacenamiento: el usuario vuelve a abrir la liga */ }
    }
    void login();
  };

  const responder = async (accion: "approve" | "deny") => {
    if (!idValido(id)) return;
    setEstado({ tipo: "enviando" });
    try {
      const url = await decidir(await operacion(), id, accion);
      setEstado({ tipo: "listo", url });
      window.location.assign(url);
    } catch (e) {
      setEstado({ tipo: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="consentimiento" style={{ maxWidth: 520, margin: "48px auto", padding: "0 16px" }}>
      <h1>Conectar con Fr8Bid</h1>
      {loading ? <p role="status">Revisando tu sesión…</p>
        : !authenticated ? (
          <>
            <p>Para autorizar el acceso, inicia sesión con tu cuenta del equipo.</p>
            <button className="primario" onClick={entrar}>Iniciar sesión con Google</button>
          </>
        )
        : estado.tipo === "cargando" ? <p role="status">Leyendo la solicitud…</p>
        : estado.tipo === "error" ? <div className="estado estado-error" role="alert"><b>No se pudo completar.</b> {estado.mensaje}</div>
        : estado.tipo === "enviando" ? <p role="status">Enviando tu respuesta…</p>
        : estado.tipo === "listo" ? <p role="status">Listo. Regresando a la aplicación… <a href={estado.url}>Continuar</a></p>
        : (
          <>
            <p><b>{nombreCliente(estado.detalle)}</b> quiere consultar Fr8Bid en tu nombre como <b>{user?.email}</b>.</p>
            <ul>
              <li>Solo lectura: eventos, seguimiento, respuestas, ofertas, candados, carriers y tarifas.</li>
              <li>No puede adjudicar, entregar a Rateware ni enviar mensajes.</li>
              <li>Ve lo mismo que tú según tu rol en Rateware.</li>
            </ul>
            {estado.detalle.redirect_uri && <p className="tenue">Regresará a: {estado.detalle.redirect_uri}</p>}
            {estado.detalle.scope && <p className="tenue">Permisos solicitados: {estado.detalle.scope}</p>}
            <div style={{ display: "flex", gap: 12 }}>
              <button className="primario" onClick={() => responder("approve")}>Permitir</button>
              <button onClick={() => responder("deny")}>Rechazar</button>
            </div>
          </>
        )}
    </main>
  );
}
