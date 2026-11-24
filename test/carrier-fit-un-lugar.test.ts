import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { LaunchTabs } from "../src/bidware/features/outreach/LaunchShell";
import { setLang } from "../src/bidware/i18n/language";

let root: Root, container: HTMLElement;
beforeEach(() => {
  const dom = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setLang("es");
  container = document.getElementById("root")!; root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

describe("Carrier fit en un solo lugar por evento", () => {
  it("las pestañas heredadas del evento ya no repiten Carrier fit", async () => {
    await act(async () => root.render(createElement(MemoryRouter, null, createElement(LaunchTabs, { eventId: "e1", active: "review" }))));
    const ligas = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(ligas).toEqual(["/rfx/e1/review", "/rfx/e1/message", "/rfx/e1/delivery"]);
  });

  it("solo la página del evento abre Carrier fit con el evento elegido", () => {
    const fuente = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
    expect(fuente("ui/Mesa.tsx")).toContain("/carrier-fit?event=${p.d.evento.id}");
    expect(fuente("bidware/features/outreach/BatchFlowPanel.tsx")).not.toContain("/carrier-fit");
    expect(fuente("bidware/features/outreach/LaunchShell.tsx")).not.toContain("/carrier-fit");
  });
});
