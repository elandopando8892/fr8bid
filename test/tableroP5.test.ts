// P5 del recorrido del 26-nov: el tablero público no enseña eventos vencidos,
// eventos sin ninguna ruta ni folios internos como nombre. Datos sintéticos.
import { describe, expect, it } from "vitest";
import { enTablero, groupByEvent, type BoardRow } from "@/features/public-board/publicBoard.service";

const fila = (id: string, evento: string, extra: Partial<BoardRow> = {}, lane: Partial<BoardRow["lane"]> = {}): BoardRow => ({
  id,
  event_id: evento,
  board_status: "live",
  is_bid_available: true,
  event: { id: evento, name: `Evento ${evento}`, rfx_id: `RFX-${evento}` },
  lane: { id, origin: "Monterrey, NL", destination: "Laredo, TX", ...lane },
  quote_count: 0,
  best_rate: null,
  currency: null,
  total_weekly_capacity: null,
  last_quote_at: null,
  quote_visibility: "hidden",
  ...extra,
});

describe("tablero público", () => {
  it("quita los eventos vencidos y los que no tienen ninguna ruta", () => {
    const filas = [
      fila("a1", "a"),
      fila("b1", "b", { board_status: "expired" }),
      fila("c1", "c", {}, { origin: "", destination: "" }),
      // Así llega del proxy cuando falta el dato.
      fila("e1", "e", {}, { origin: "—", destination: "—" }),
      // De un evento con una ruta a medias (aunque venga primero) solo queda la completa.
      fila("d2", "d", {}, { destination: "" }),
      fila("d1", "d"),
    ];
    expect(enTablero(filas).map((r) => r.id)).toEqual(["a1", "d1"]);
  });

  it("un folio interno no se usa como nombre", () => {
    const folio = "FR8-ec3eecfc-8424-4b39-a859-79a8190f4781";
    const [spot] = groupByEvent([fila("s1", "s", { event: { id: "s", name: folio, rfx_id: folio, event_type: "spot" } })]);
    expect(spot.name).toBe("Spot");
    const [otro] = groupByEvent([fila("o1", "o", { event: { id: "o", name: folio, rfx_id: "RFx-1021-PRIMAPro" } })]);
    expect(otro.name).toBe("RFx-1021-PRIMAPro");
    const [normal] = groupByEvent([fila("n1", "n")]);
    expect(normal.name).toBe("Evento n");
  });
});

describe("movimientos del tablero", () => {
  it("anuncia como nueva la ruta que acaba de completarse, no la vencida ni la incompleta", async () => {
    const { diff } = await import("@/features/public-board/useBoard");
    const antes = new Map([["x1", fila("x1", "x", {}, { destination: "—" })]]);
    const ahora = [
      fila("x1", "x"),
      fila("y1", "y", { board_status: "expired" }),
      fila("z1", "z", {}, { origin: "—" }),
      fila("w1", "w"),
    ];
    expect(diff(antes, ahora).map((m) => m.key)).toEqual(["new-x1", "new-w1"]);
  });
});
