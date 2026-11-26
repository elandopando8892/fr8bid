// Contadores honestos (paquete P2 del recorrido del 26-nov-2026).
import { describe, expect, it } from "vitest";
import { fallosGmailRecientes, type RespuestaBandeja } from "../src/dominio/bandeja";
import { textoFallo } from "../src/dominio/lecturaAutomatica";
import { pendingSummary, type StagedRate } from "../src/bidware/features/rate-review/readiness";
import { bidRoomLabel } from "../src/bidware/features/quotedesk/quotedesk.service";
import { isIntake, type RfxProject } from "../src/bidware/features/shipper-intake/intake.service";

const lista: Partial<StagedRate> = {
  all_in_rate: 1500, currency: "USD", origin_market: "MTY", destination_market: "LRD", vendor_id: "v1",
  quote_date: "2026-11-01", operation: "MX Northbound", service: "One Way"
};

describe("Hoy cuenta solo las tarifas que se pueden revisar", () => {
  it("las ofertas de un evento sin adjudicar esperan; las bloqueadas van por corregir", () => {
    const rows = [
      { ...lista, id: "a" },
      { ...lista, id: "b", rfx_bid_outcome: "submitted" },
      { ...lista, id: "c", rfx_bid_outcome: "submitted" },
      { ...lista, id: "d", rfx_bid_outcome: "not_awarded" },
      { ...lista, id: "e", all_in_rate: null }
    ] as StagedRate[];
    expect(pendingSummary(rows)).toEqual({ review: 1, awaiting: 2, fix: 2 });
  });
});

describe("Cotizaciones dice el estado real del evento", () => {
  it("un evento en borrador no está «En Bid Room»", () => {
    expect(bidRoomLabel("draft").label).toBe("Evento sin publicar");
    expect(bidRoomLabel("awarded").tone).toBe("green");
    expect(bidRoomLabel(undefined).label).toBe("En Bid Room");
  });
});

describe("Respuestas no promete reintentos que no ocurren", () => {
  it("el fallo de cuota dice qué hacer ahora", () => {
    const t = textoFallo("429 Too Many Requests");
    expect(t).toContain("Léelo ahora con IA o descártalo");
    expect(t).not.toMatch(/siguiente revisión/);
  });

  it("Integraciones cuenta solo los límites de Gmail de la última semana", () => {
    const ahora = Date.parse("2026-11-26T12:00:00Z");
    const r = (en: string, fallo: string | null, tipo: RespuestaBandeja["tipo"] = "fallo") =>
      ({ eventoId: "e", evento: "E", folio: "", plazo: null, correoId: en, carrierId: null, carrier: "C", en, tipo, resumen: "", rutas: 0, fallo }) as RespuestaBandeja;
    const lista = [
      r("2026-11-25T10:00:00Z", textoFallo("quota exceeded")),
      r("2026-11-10T10:00:00Z", textoFallo("quota exceeded")),
      r("2026-11-25T10:00:00Z", textoFallo("404 not found")),
      r("2026-11-25T10:00:00Z", null, "oferta")
    ];
    expect(fallosGmailRecientes(lista, ahora)).toHaveLength(1);
  });
});

describe("Solicitudes", () => {
  it("una solicitud archivada sale de la lista", () => {
    const p = { status: "rfi_sent", rfi_status: "sent" } as RfxProject;
    expect(isIntake(p)).toBe(true);
    expect(isIntake({ ...p, status: "archived" })).toBe(false);
  });
});
