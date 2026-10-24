import { describe, expect, it } from "vitest";
import { aislarSelector, bajoBidware, fueraDeBidware, separar } from "../src/estilos/aislar";

describe("estilos aislados", () => {
  it("las reglas de Bidware quedan bajo .bw", () => {
    expect(bajoBidware(":root")).toBe(".bw");
    expect(bajoBidware("body")).toBe(".bw");
    expect(bajoBidware("*")).toBe(".bw, .bw *");
    expect(bajoBidware("table.data td")).toBe(".bw table.data td");
    expect(bajoBidware(":where(button, a):focus-visible")).toBe(".bw :where(button, a):focus-visible");
    expect(aislarSelector("html,\nbody,\n#root", "bidware")).toBeNull();
    expect(aislarSelector("h1,\nh2", "bidware")).toBe(".bw h1, .bw h2");
  });

  it("las reglas de Fr8Bid no alcanzan dentro de .bw y no ganan especificidad", () => {
    expect(fueraDeBidware("h3")).toBe("h3:where(:not(.bw *))");
    expect(fueraDeBidware(".tabla-tarjetas td[data-etiqueta]::before")).toBe(".tabla-tarjetas td[data-etiqueta]:where(:not(.bw *))::before");
    expect(fueraDeBidware("html")).toBe("html");
    expect(fueraDeBidware("body")).toBe("body");
    expect(aislarSelector("button, input, select", "fr8bid")).toBe(
      "button:where(:not(.bw *)), input:where(:not(.bw *)), select:where(:not(.bw *))"
    );
  });

  it("separa solo por comas de primer nivel", () => {
    expect(separar(':where(a, b) .x, [data-x="1,2"]')).toEqual([":where(a, b) .x", '[data-x="1,2"]']);
  });
});
