import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

const { auth } = vi.hoisted(() => ({
  auth: {
    listener: null as null | ((session: unknown) => void),
    getUser: vi.fn(),
  },
}));
vi.mock("../src/bidware/lib/auth", () => ({
  getSession: vi.fn(async () => null),
  getUser: auth.getUser,
  onAuthStateChange: (cb: (session: unknown) => void) => { auth.listener = cb; return () => { auth.listener = null; }; },
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(async () => undefined),
}));

import { AuthProvider, useAuth } from "../src/bidware/auth/AuthContext";

const cuenta = (id: string, roles: string[]) => ({ id, email: `${id}@heymarksman.com`, app_metadata: { roles } });
const sesion = (user: unknown) => ({ user, access_token: "t" });

let root: Root;
let vistos: { roleLoaded: boolean; role: string }[];
let montajes: number;

function Pagina() {
  const a = useAuth();
  vistos.push({ roleLoaded: a.roleLoaded, role: a.role });
  return null;
}
function Contador() {
  // Simula una página que se monta una vez y no debe volver a cargarse.
  const a = useAuth();
  return createElement(Hija, { key: `${a.user?.id}:${a.role}:${a.roleLoaded}` });
}
function Hija() {
  useEffect(() => { montajes++; }, []);
  return null;
}

beforeEach(() => {
  const dom = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.getElementById("root")!);
  vistos = [];
  montajes = 0;
  auth.getUser.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

const montar = async () => {
  await act(async () => root.render(createElement(AuthProvider, null, createElement(Pagina), createElement(Contador))));
};

describe("volver a la pestaña", () => {
  it("el mismo usuario re-anunciado no tira el rol verificado ni re-monta la página", async () => {
    const a = cuenta("jose", ["admin"]);
    auth.getUser.mockResolvedValue(a);
    await montar();
    await act(async () => auth.listener!(sesion(a)));
    expect(vistos.at(-1)).toEqual({ roleLoaded: true, role: "admin" });
    const montadas = montajes;
    vistos = [];

    // Supabase avisa SIGNED_IN otra vez al volver a la pestaña, con otro objeto.
    let responder!: (u: unknown) => void;
    auth.getUser.mockReturnValue(new Promise((r) => { responder = r; }));
    await act(async () => auth.listener!(sesion({ ...a })));
    expect(vistos.every((v) => v.roleLoaded && v.role === "admin")).toBe(true);
    await act(async () => responder({ ...a }));
    expect(vistos.every((v) => v.roleLoaded && v.role === "admin")).toBe(true);
    expect(montajes).toBe(montadas);
  });

  it("un rol retirado en el servidor cuenta en cuanto el servidor contesta", async () => {
    const a = cuenta("jose", ["admin"]);
    auth.getUser.mockResolvedValue(a);
    await montar();
    await act(async () => auth.listener!(sesion(a)));
    auth.getUser.mockResolvedValue(cuenta("jose", ["viewer"]));
    await act(async () => auth.listener!(sesion({ ...a })));
    expect(vistos.at(-1)).toEqual({ roleLoaded: true, role: "viewer" });
  });

  it("otro usuario sí invalida la verificación anterior", async () => {
    const a = cuenta("jose", ["admin"]);
    auth.getUser.mockResolvedValue(a);
    await montar();
    await act(async () => auth.listener!(sesion(a)));
    const b = cuenta("otra", ["viewer"]);
    let responder!: (u: unknown) => void;
    auth.getUser.mockReturnValue(new Promise((r) => { responder = r; }));
    vistos = [];
    await act(async () => auth.listener!(sesion(b)));
    expect(vistos.at(-1)?.roleLoaded).toBe(false);
    await act(async () => responder(b));
    expect(vistos.at(-1)).toEqual({ roleLoaded: true, role: "viewer" });
  });
});
