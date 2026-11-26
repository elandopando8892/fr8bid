// Prioridad 9 (26-nov-2026): «Recordarle» en solicitudes de shippers. Fr8Bid
// no envía nada; arma el borrador de Gmail con la liga vigente.

import { describe, expect, it } from "vitest";
import { borradorGmail, diasDesde, textoRecordatorio } from "../src/bidware/features/shipper-intake/recordatorio";

const liga = "https://fr8bid.heymarksman.com/customer-rfi.html?token=abc";

describe("Recordarle", () => {
  it("el borrador lleva su liga, saluda por nombre y el asunto va en español", () => {
    const { asunto, cuerpo } = textoRecordatorio({ contacto: "Ana López", correo: "ana@vidrio.mx", liga });
    expect(asunto).toMatch(/^Recordatorio/);
    expect(cuerpo.startsWith("Hola Ana:")).toBe(true);
    expect(cuerpo).toContain(liga);
  });

  it("abre Gmail con destinatario, asunto y texto, sin enviar", () => {
    const url = new URL(borradorGmail({ contacto: null, correo: "ana@vidrio.mx", liga })!);
    expect(url.origin).toBe("https://mail.google.com");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("ana@vidrio.mx");
    expect(url.searchParams.get("body")).toContain(liga);
    expect(url.searchParams.get("body")!.startsWith("Hola:")).toBe(true);
  });

  it("sin correo válido no hay borrador de Gmail", () => {
    expect(borradorGmail({ contacto: "Ana", correo: null, liga })).toBeNull();
    expect(borradorGmail({ contacto: "Ana", correo: "ana", liga })).toBeNull();
  });

  it("cuenta los días sin respuesta", () => {
    const ahora = Date.parse("2026-11-26T18:00:00Z");
    expect(diasDesde("2026-11-06T10:00:00Z", ahora)).toBe(20);
    expect(diasDesde("2026-11-27T10:00:00Z", ahora)).toBe(0);
    expect(diasDesde("", ahora)).toBeNull();
  });
});
