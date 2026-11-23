// Botón «?» (8-nov, Jose: «poco texto»): muestra u oculta las explicaciones
// (.ayuda). Lo usan el menú del equipo y las barras de carriers y shippers.
import { useAyudas } from "./ayudas";
import * as I from "./Iconos";

export function BotonAyudas({ en = false, className = "boton-ayudas" }: { en?: boolean; className?: string }) {
  const [ver, alternar] = useAyudas();
  const t = en ? (ver ? "Hide help" : "Show help") : ver ? "Ocultar ayudas" : "Ver ayudas";
  return (
    <button type="button" className={`btn-texto ${className}`} aria-pressed={ver} title={t} aria-label={t} onClick={alternar}>
      <I.Pregunta size={18} />
    </button>
  );
}
