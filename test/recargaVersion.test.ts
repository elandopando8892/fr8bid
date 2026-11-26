// Recorrido del 26-nov: tras cada publicación, una pestaña abierta fallaba al
// cambiar de sección y «Volver a intentar» no lo arreglaba.
import { describe, expect, it } from "vitest";
import { cargarPantalla, esVersionVieja, recargarUnaVez } from "../src/ui/recargaVersion";

const memoria = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("versión vieja tras publicar", () => {
  it("reconoce el error de Chrome, Safari y Firefox", () => {
    expect(esVersionVieja(new TypeError("Failed to fetch dynamically imported module: https://fr8bid.heymarksman.com/assets/CarrierFitPage-DwGmdwAr.js"))).toBe(true);
    expect(esVersionVieja(new TypeError("Importing a module script failed."))).toBe(true);
    expect(esVersionVieja(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(esVersionVieja(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("recarga una sola vez por minuto", () => {
    const almacen = memoria();
    let recargas = 0;
    expect(recargarUnaVez(1_000_000, almacen, () => recargas++)).toBe(true);
    expect(recargarUnaVez(1_030_000, almacen, () => recargas++)).toBe(false);
    expect(recargarUnaVez(1_070_000, almacen, () => recargas++)).toBe(true);
    expect(recargas).toBe(2);
  });

  it("sin almacenamiento no recarga (no hay freno contra un bucle)", () => {
    expect(recargarUnaVez(5_000_000, null, () => undefined)).toBe(false);
  });

  it("una pantalla vieja recarga en vez de fallar; otro error sigue su camino", async () => {
    let recargo = false;
    const pendiente = cargarPantalla(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module: x.js")), () => (recargo = true));
    const gana = await Promise.race([pendiente.then(() => "cargó", () => "falló"), new Promise((r) => setTimeout(() => r("esperando"), 20))]);
    expect(gana).toBe("esperando");
    expect(recargo).toBe(true);
    await expect(cargarPantalla(() => Promise.reject(new Error("otro")), () => true)).rejects.toThrow("otro");
    await expect(cargarPantalla(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module: x.js")), () => false)).rejects.toThrow(/dynamically/);
  });
});
