// Búsqueda del Directorio de carriers (prioridad 7, 25-nov-2026): busca dentro de la etapa elegida y
// avisa cuántos hay en las demás, para que nadie concluya «no está» solo porque vive en otra etapa.
import type { Vendor } from "@/types/domain";

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function coincide(v: Partial<Vendor> & Record<string, unknown>, consulta: string): boolean {
  const q = sinAcentos(consulta.trim());
  if (!q) return true;
  return [v.vendor_name, v.legal_name, v.profile_legal_name, v.domain, v.primary_email, v.whatsapp_phone]
    .some((f) => sinAcentos(String(f ?? "")).includes(q));
}

// Cuántos coinciden en cada etapa distinta de la actual, en el orden de las etapas y sin las que dan cero.
export function enOtrasEtapas<T extends Partial<Vendor> & Record<string, unknown>>(
  porEtapa: [string, T[]][],
  actual: string,
  consulta: string
): [string, number][] {
  if (!consulta.trim()) return [];
  return porEtapa
    .filter(([etapa]) => etapa !== actual)
    .map(([etapa, filas]) => [etapa, filas.filter((v) => coincide(v, consulta)).length] as [string, number])
    .filter(([, n]) => n > 0);
}
