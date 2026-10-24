// Cerrar a ofertas mueve due_date a ayer (así la liga responde 409), y con eso
// se perdía el plazo original. Fr8Bid lo deja en las notas del evento, que
// update_rfx_event acepta, con una marca que se vuelve a leer al cargar.

const MARCA = /\[Fr8Bid\] Cerrado a ofertas el (\d{4}-\d{2}-\d{2}) · plazo original (\d{4}-\d{2}-\d{2}|sin plazo)/;

export function leerCierre(notas: unknown): { el: string; plazoOriginal: string | null } | null {
  const m = MARCA.exec(String(notas ?? ""));
  if (!m) return null;
  return { el: m[1], plazoOriginal: m[2] === "sin plazo" ? null : m[2] };
}

// Notas con la marca agregada. Si ya hay una (se cerró, se reabrió en Rateware
// y se vuelve a cerrar), se conserva la primera: ese es el plazo original.
export function notasConCierre(notas: string | null | undefined, el: string, plazoOriginal: string | null): string {
  const previas = String(notas ?? "").trim();
  if (leerCierre(previas)) return previas;
  const marca = `[Fr8Bid] Cerrado a ofertas el ${el} · plazo original ${plazoOriginal ?? "sin plazo"}`;
  return previas ? `${previas}\n${marca}` : marca;
}
