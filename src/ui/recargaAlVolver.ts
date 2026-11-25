// Vuelve a leer algo cuando el equipo regresa a la pestaña (foco o visible otra vez), sin
// leer dos veces seguidas por los dos avisos del mismo regreso. Devuelve cómo dejar de escuchar.
type Objetivo = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export function recargarAlVolver(
  recargar: () => void,
  ventana: Objetivo,
  documento: Objetivo & { visibilityState?: string },
  ahora: () => number = Date.now,
  esperaMs = 2000
): () => void {
  let ultima = -Infinity;
  const avisar = () => {
    if (documento.visibilityState === "hidden") return;
    const t = ahora();
    if (t - ultima < esperaMs) return;
    ultima = t;
    recargar();
  };
  ventana.addEventListener("focus", avisar);
  documento.addEventListener("visibilitychange", avisar);
  return () => {
    ventana.removeEventListener("focus", avisar);
    documento.removeEventListener("visibilitychange", avisar);
  };
}

// Lecturas que pueden volver fuera de orden: solo cuenta la última que se pidió. Publicar
// también pide un turno, así una lectura vieja que termina después no tapa lo publicado.
export function turnos() {
  let ultimo = 0;
  return { pedir: () => ++ultimo, vigente: (turno: number) => turno === ultimo };
}
