import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { RateTabs, type RateTab } from "../src/bidware/components/RateTabs";
import { setLang } from "../src/bidware/i18n/language";
import { MENU } from "../src/ui/comun";

let root: Root, container: HTMLElement;
const render = async (active: RateTab) => {
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(RateTabs, { active }))));
  return [...container.querySelectorAll("a")];
};

beforeEach(() => {
  const dom = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setLang("es");
  container = document.getElementById("root")!; root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

describe("módulo Tarifas con tres pestañas", () => {
  it("lleva a cada pantalla y marca la activa", async () => {
    const links = await render("base");
    expect(links.map((a) => a.textContent)).toEqual(["Por revisar", "Tarifario", "Archivos"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/tarifas", "/tarifario", "/archivos"]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
  });

  it("sale en inglés cuando el equipo trabaja en inglés", async () => {
    setLang("en");
    const links = await render("files");
    expect(links.map((a) => a.textContent)).toEqual(["To review", "Rate base", "Files"]);
  });

  it("el menú tiene una sola entrada para tarifas que sigue activa en las tres pantallas", () => {
    const entradas = MENU.flatMap((g) => g.modulos).filter((m) => ["/tarifas", "/tarifario", "/archivos"].some((r) => m.activo?.(r)));
    expect(entradas.map((m) => m.etiqueta)).toEqual(["Shippers y tarifas"]);
    for (const ruta of ["/tarifas", "/tarifario", "/archivos"]) expect(entradas[0].activo!(ruta)).toBe(true);
    expect(entradas[0].activo!("/crm")).toBe(false);
    const tarifas = entradas[0].secciones!.filter((s) => s.etiqueta === "Tarifas");
    expect(tarifas).toHaveLength(1);
    for (const ruta of ["/tarifas", "/tarifario", "/archivos"]) expect(tarifas[0].activo!(ruta)).toBe(true);
  });
});
