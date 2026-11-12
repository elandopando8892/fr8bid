import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ContactosDeMesa } from "../src/ui/ContactosDeMesa";
import type { Detalle } from "../src/dominio/tipos";
const { session, client } = vi.hoisted(() => ({ session: { modo: "rateware", identidad: "account-a", correo: "a@example.test", rol: "admin", rolLeido: true, usuarioSimulado: "", sim: null }, client: vi.fn() }));
vi.mock("../src/ui/sesion", () => ({ useSesion: () => session }));
vi.mock("../src/cliente/contactosEmpresa", () => ({ contactosHttp: () => client }));
vi.mock("../src/bidware/lib/auth", () => ({ getAccessToken: async () => "synthetic" }));
const detalle = { evento: { id: "event" }, rutas: [{ participaciones: [{ carrierId: "a", carrier: "Empresa A", correo: null }, { carrierId: "b", carrier: "Empresa B", correo: null }] }] } as unknown as Detalle;
let root: Root, el: HTMLElement;
const render = () => act(async () => root.render(createElement(MemoryRouter, { initialEntries: [{ pathname: "/eventos/event", search: "?contacto=b", state: { contactosContexto: JSON.stringify(["event", "account-a", "rateware", "a@example.test", "admin", ""]) } }] }, createElement(ContactosDeMesa, { detalle, actualizar: () => {} }))));
beforeEach(() => {
  const dom = parseHTML('<html><body><div id="root"></div></body></html>'); vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.document); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  el = document.getElementById("root")!; root = createRoot(el); session.identidad = "account-a"; client.mockReset();
  client.mockImplementation(async ({ vendor_id }) => ({ vendor: { id: vendor_id, name: `Empresa ${vendor_id}`, domain: "example.test", email: `ops@${vendor_id}.example` }, known: { state: "current", candidates: [] }, operation: null, available: true, capabilities: { can_write: false, can_search: false, can_spend: false, max_credits: null } }));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it("restaura la empresa de la misma sesión y descarta esa navegación al cambiar de cuenta", async () => {
  await render(); expect(el.querySelector('[aria-current="true"]')?.textContent).toContain("Empresa B");
  session.identidad = "account-b"; await render();
  expect(el.querySelector('[aria-current="true"]')?.textContent).toContain("Empresa A");
  expect(el.textContent).not.toContain("ops@b.example");
});
