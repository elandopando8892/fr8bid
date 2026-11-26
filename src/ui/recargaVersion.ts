// Cada publicación cambia los nombres de los archivos de cada pantalla. Una
// pestaña abierta desde antes pide los viejos, que ya no existen, y la pantalla
// no carga («Failed to fetch dynamically imported module»). Volver a pintar no
// sirve: hay que traer la versión nueva. Se recarga sola una vez por minuto,
// solo al abrir una pantalla, cuando no hay nada a medias en ella.

const LLAVE = "fr8bid.recarga-version";
const VENTANA_MS = 60_000;

export function esVersionVieja(error: unknown): boolean {
  const texto = String((error as { message?: unknown } | null)?.message ?? error ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk .* failed|Unable to preload/i.test(texto);
}

type Almacen = Pick<Storage, "getItem" | "setItem">;

function almacenSesion(): Almacen | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Recarga la página si no se recargó por lo mismo en el último minuto. Devuelve si recargó. */
export function recargarUnaVez(ahora = Date.now(), almacen: Almacen | null = almacenSesion(), recargar = () => window.location.reload()): boolean {
  // Sin almacenamiento no hay freno: mejor no recargar en bucle.
  if (!almacen) return false;
  try {
    const antes = Number(almacen.getItem(LLAVE) || 0);
    if (ahora - antes < VENTANA_MS) return false;
    almacen.setItem(LLAVE, String(ahora));
  } catch {
    return false;
  }
  recargar();
  return true;
}

/** Envuelve la carga de una pantalla: si la versión es vieja, recarga en vez de fallar. */
export function cargarPantalla<T>(cargar: () => Promise<T>, recargar: () => boolean = () => recargarUnaVez()): Promise<T> {
  return cargar().catch((error) => {
    if (esVersionVieja(error) && recargar()) return new Promise<T>(() => undefined);
    throw error;
  });
}
