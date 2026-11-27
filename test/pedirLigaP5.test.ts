// P5 del recorrido del 26-nov: en una liga vencida se pide otra en un clic.
import { describe, expect, it } from "vitest";
import { esErrorDeLiga, pedirLiga } from "@/lib/pedirLiga";

const partes = (href: string) => {
  const u = new URL(href);
  return { para: u.pathname, asunto: u.searchParams.get("subject"), cuerpo: u.searchParams.get("body") };
};

describe("pedir una liga nueva", () => {
  it("arma el correo al equipo con asunto en español y cuerpo en el idioma de la página", () => {
    const es = partes(pedirLiga("bidroom", "es")!.correo);
    expect(es.para).toBe("sales@heymarksman.com");
    expect(es.asunto).toBe("Liga nueva · Bid Room");
    expect(es.cuerpo).toMatch(/^Hola, mi liga de Bid Room ya no funciona/);
    const en = partes(pedirLiga("perfil_carrier", "en")!.correo);
    expect(en.asunto).toBe("Liga nueva · perfil de carrier");
    expect(en.cuerpo).toMatch(/^Hi, my carrier profile link no longer works/);
  });

  it("sin contacto confirmado para la marca no ofrece nada", () => {
    expect(pedirLiga("solicitud", "es", "xbf")).toBeNull();
  });

  it("sin número del equipo no hay WhatsApp", () => {
    expect(pedirLiga("solicitud", "es")!.whatsapp).toBeNull();
  });

  it("solo se ofrece cuando el rechazo es de la liga", () => {
    expect(esErrorDeLiga("Invitation link is invalid or expired")).toBe(true);
    expect(esErrorDeLiga("This profile link was deactivated.")).toBe(true);
    expect(esErrorDeLiga("Esta liga no está activa. Pida una nueva a su contacto en MARKSMAN.")).toBe(true);
    expect(esErrorDeLiga("JSON object requested, multiple (or no) rows returned")).toBe(true);
    expect(esErrorDeLiga("Cannot coerce the result to a single JSON object")).toBe(true);
    expect(esErrorDeLiga("Failed to fetch")).toBe(false);
    expect(esErrorDeLiga("Fr8Bid API request failed (500)")).toBe(false);
  });
});
