import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Spinner } from "@/components/ui";
import { RETORNO, retornoSeguro } from "../../cliente/consentimiento";

/**
 * OAuth return route. Supabase's detectSessionInUrl consumes the code on the
 * client, so we just wait for the session and bounce to the dashboard. (OAuth
 * redirectTo points at the app origin, so this route is a harmless fallback.)
 */
export function CallbackPage() {
  const { loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    // Si el login empezó en /oauth/consent (MCP), se regresa ahí; nada más se acepta.
    let destino: string | null = null;
    try { destino = retornoSeguro(sessionStorage.getItem(RETORNO)); sessionStorage.removeItem(RETORNO); } catch { /* sin almacenamiento */ }
    navigate(destino ?? "/", { replace: true });
  }, [loading, navigate]);

  return (
    <div className="center-screen">
      <Spinner label="Completando inicio de sesión…" />
    </div>
  );
}
