import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nextPending, sharedOf, startForm } from "@/features/bid-room/quick-quote";
import { offerForm, type BookLane } from "@/features/bid-room/bidroom.service";

// Rediseño 25-nov, prioridad 4: tarifa primero, «Enviar y seguir», copiar a mis rutas y hoja en el teléfono.
const ruta = (n: number, extra: Partial<BookLane> = {}): BookLane =>
  ({
    rfx_lane_id: `l${n}`,
    invitation_token: `t${n}`,
    lane_number: n,
    origin: "Tultitlán, MX",
    destination: `Destino ${n}`,
    currency: "USD",
    business_status: "invited",
    due_state: { status: "open" },
    ...extra,
  }) as BookLane;

describe("la siguiente ruta por cotizar", () => {
  const rutas = [ruta(1, { bid_rate: 100, business_status: "quoted" }), ruta(2), ruta(3, { bid_rate: 90, business_status: "quoted" }), ruta(4)];
  it("salta las cotizadas y sigue hacia adelante", () => {
    expect(nextPending(rutas, rutas[1])?.lane_number).toBe(4);
  });
  it("al llegar al final regresa a las pendientes del principio", () => {
    expect(nextPending(rutas, rutas[3])?.lane_number).toBe(2);
  });
  it("no vuelve a ofrecer una ruta recién enviada cuya recarga no ha llegado", () => {
    expect(nextPending(rutas, rutas[1], new Set(["l4"]))).toBeNull();
    expect(nextPending([...rutas, ruta(5)], rutas[1], new Set(["l4"]))?.lane_number).toBe(5);
  });
  it("sin pendientes no promete una ruta siguiente", () => {
    expect(nextPending([ruta(1), ruta(2, { bid_rate: 1, business_status: "quoted" })], ruta(1))).toBeNull();
  });
});

describe("capacidad, tránsito y vigencia en mis demás rutas", () => {
  const compartidos = { weekly_capacity: "3", transit_days: "2", valid_through: "2027-03-31" };
  it("llenan solo lo vacío de una ruta sin cotizar", () => {
    const { form, filled } = startForm(ruta(5, { transit_days: 4 }), compartidos);
    expect(filled).toBe(true);
    expect(form.weekly_capacity).toBe("3");
    expect(form.transit_days).toBe("4");
    expect(form.valid_through).toBe("2027-03-31");
    expect(form.bid_rate).toBe("");
  });
  it("no tocan una oferta ya enviada ni una ruta cerrada", () => {
    expect(startForm(ruta(6, { bid_rate: 100, business_status: "quoted" }), compartidos).filled).toBe(false);
    expect(startForm(ruta(7, { due_state: { status: "closed" } } as Partial<BookLane>), compartidos).filled).toBe(false);
  });
  it("apagado, cada ruta empieza con lo suyo", () => {
    expect(startForm(ruta(8), null)).toEqual({ form: offerForm(ruta(8)), filled: false });
    expect(sharedOf(offerForm(ruta(9, { weekly_capacity: 6 }))).weekly_capacity).toBe("6");
  });
});

describe("pantalla", () => {
  const fuente = (p: string) => readFileSync(new URL(`../src/bidware/features/bid-room/${p}`, import.meta.url), "utf8");
  it("el envío va antes de lo opcional y nombra la ruta que sigue", () => {
    const s = fuente("QuotePanel.tsx");
    expect(s.indexOf("croom-actions-enviar")).toBeLessThan(s.indexOf('<details className="croom-extras"'));
    expect(s.indexOf('q("form.capacity")')).toBeGreaterThan(s.indexOf('<details className="croom-extras"'));
    expect(s).toMatch(/q\("form.sendNext", laneLabel\(next\)\)/);
  });
  it("en el teléfono la cotización es una hoja con Cerrar y Escape", () => {
    const s = fuente("QuoteLanes.tsx");
    expect(s).toMatch(/const sheet = !isWide && Boolean\(picked\)/);
    expect(s).toMatch(/e\.key === "Escape"/);
    expect(s).toMatch(/aria-modal/);
  });
});
