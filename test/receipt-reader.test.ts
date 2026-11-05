import { describe, expect, it, vi } from "vitest";
import { currentReceiptRow, parseStagingReceipt } from "../src/bidware/features/rate-review/receiptEvidence";
import { createReceiptRequest } from "../src/bidware/features/rate-review/receiptRequest";
import { allows, needOf } from "../src/bidware/lib/roles";
import { revisar } from "../src/servidor/paso";
import { modoEscrituras } from "../src/servidor/proxy";

const stagingId = "10000000-0000-4000-8000-000000000001";
const receiptId = "20000000-0000-4000-8000-000000000001";
const rawUploadId = "30000000-0000-4000-8000-000000000001";
const objectId = "40000000-0000-4000-8000-000000000001";
const otherId = "50000000-0000-4000-8000-000000000001";
const row = { id: stagingId, raw_upload_id: rawUploadId };
const original = { rawUploadId, objectId, objectVersion: "v1", sha256: "a".repeat(64), sizeBytes: 11246 };
const dto = () => ({
  contractVersion: "bidware.staging-receipt.v1", state: "recorded", stagingId,
  currentStatus: "approved", receipt: { receiptId, stagingId, targetStatus: "pending_review", originalSource: { ...original } },
  historyOnly: true, submissionEnabled: false,
});

describe("recibo canónico de Rateware", () => {
  it("conserva recibo, original y estado actual sin inferir aprobación desde el recibo histórico", () => {
    expect(parseStagingReceipt(dto(), row)).toEqual({ state: "recorded", receiptId, stagingId, currentStatus: "approved", original });
    expect(receiptId).not.toBe(stagingId);
  });

  it("admite un recibo sin referencia de original; no fabrica un archivo", () => {
    const value = dto() as any;
    delete value.receipt.originalSource;
    expect(parseStagingReceipt(value, row)).toEqual({ state: "recorded", receiptId, stagingId, currentStatus: "approved" });
  });

  it.each(["missing", "unavailable", "inconsistent"])("conserva el estado explícito %s", (state) => {
    expect(parseStagingReceipt({ ...dto(), state, receipt: null }, row)).toEqual({ state });
    expect(parseStagingReceipt({ ...dto(), state }, row)).toEqual({ state: "inconsistent" });
  });

  it.each([
    null, [], {}, { receiptId, originalSource: original },
    { ...dto(), contractVersion: "other" }, { ...dto(), stagingId: otherId },
    { ...dto(), historyOnly: false }, { ...dto(), submissionEnabled: true },
    { ...dto(), currentStatus: 1 }, { ...dto(), extra: "not-in-contract" },
    { ...dto(), state: "approved" }, { ...dto(), receipt: null },
    { ...dto(), receipt: { ...dto().receipt, stagingId: otherId } },
    { ...dto(), receipt: { ...dto().receipt, receiptId: "invalid" } },
    { ...dto(), receipt: { ...dto().receipt, targetStatus: "approved" } },
    { ...dto(), receipt: { ...dto().receipt, token: "must-not-be-rendered" } },
  ])("rechaza identidad, autoridad o forma fuera del contrato %#", (value) => {
    expect(parseStagingReceipt(value, row)).toEqual({ state: "inconsistent" });
  });

  it.each([
    null, {}, { ...original, rawUploadId: otherId }, { ...original, objectId: "bad" },
    { ...original, objectVersion: "../file" }, { ...original, objectVersion: "v".repeat(161) },
    { ...original, sha256: "not-a-digest" }, { ...original, sizeBytes: "11246" },
    { ...original, sizeBytes: 0 }, { ...original, sizeBytes: -1 },
    { ...original, sizeBytes: 1.5 }, { ...original, sizeBytes: NaN },
    { ...original, sizeBytes: 25 * 1024 * 1024 + 1 }, { ...original, url: "https://example.test/private" },
  ])("rechaza referencias de original inválidas o ajenas %#", (originalSource) => {
    expect(parseStagingReceipt({ ...dto(), receipt: { ...dto().receipt, originalSource } }, row)).toEqual({ state: "inconsistent" });
  });

  it("rechaza la referencia si el registro ya no tiene el mismo raw_upload_id", () => {
    expect(parseStagingReceipt(dto(), { ...row, raw_upload_id: otherId }).state).toBe("inconsistent");
    expect(parseStagingReceipt(dto(), { id: stagingId }).state).toBe("inconsistent");
    expect(parseStagingReceipt(dto(), { id: "bad" }).state).toBe("inconsistent");
  });

  it("acepta límites exactos del original y estado actual desconocido explícito", () => {
    const value = { ...dto(), currentStatus: null, receipt: { ...dto().receipt, originalSource: { ...original, sizeBytes: 25 * 1024 * 1024 } } };
    expect(parseStagingReceipt(value, row)).toMatchObject({ state: "recorded", currentStatus: null });
  });
});

describe("selección de la fila vigente", () => {
  it("resuelve por ID y nunca por posición o duplicado", () => {
    expect(currentReceiptRow([{ ...row, id: otherId }, row], stagingId, false, null)).toBe(row);
    expect(currentReceiptRow([row, { ...row }], stagingId, false, null)).toBeNull();
    expect(currentReceiptRow([], stagingId, false, null)).toBeNull();
  });
  it("retira la evidencia durante recarga o fallo de la lista", () => {
    expect(currentReceiptRow([row], stagingId, true, null)).toBeNull();
    expect(currentReceiptRow([row], stagingId, false, "offline")).toBeNull();
  });
});

describe("clasificación del proxy existente", () => {
  it("permite solo la nueva lectura con el switch de escrituras apagado y sesión presente", () => {
    const payload = { action: "get_staging_receipt", stagingId };
    expect(needOf("rateware-api", payload.action)).toBe("read");
    expect(allows("viewer", needOf("rateware-api", payload.action))).toBe(true);
    expect(revisar({ fn: "rateware-api", json: payload, autorizacion: "Bearer synthetic", modo: modoEscrituras(undefined) })).toBeNull();
    expect(revisar({ fn: "rateware-api", json: payload, autorizacion: null, modo: modoEscrituras(undefined) })?.status).toBe(401);
  });
  it.each(["update_staging", "bulk_update_staging", "submit_bid", "award_rfx_lane_vendor"])("no abre la escritura %s", (action) => {
    expect(revisar({ fn: "rateware-api", json: { action }, autorizacion: "Bearer synthetic", modo: modoEscrituras(undefined) })?.status).toBe(423);
    expect(allows("viewer", needOf("rateware-api", action))).toBe(false);
  });
});

describe("retiro de respuestas asíncronas", () => {
  it("descarta la respuesta de la solicitud anterior aunque llegue después", async () => {
    let finish!: (value: string) => void;
    const publish = vi.fn();
    const request = createReceiptRequest(publish);
    const first = request.load("old-row", () => new Promise<string>((resolve) => { finish = resolve; }), "unavailable");
    await request.load("new-row", async () => "new", "unavailable");
    finish("old"); await first;
    expect(publish.mock.calls).toEqual([["new-row", "new"]]);
  });
  it("el desmontaje retira también errores tardíos y no permite reutilizar el lector", async () => {
    let fail!: (reason: Error) => void;
    const publish = vi.fn(), read = vi.fn();
    const request = createReceiptRequest(publish);
    const first = request.load("account-a", () => new Promise<string>((_resolve, reject) => { fail = reject; }), "unavailable");
    request.retire(); fail(new Error("offline")); await first;
    await request.load("account-b", read, "unavailable");
    expect(publish).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it("un error es no disponible y no dispara reintentos", async () => {
    const publish = vi.fn(), read = vi.fn().mockRejectedValue(new Error("source unavailable"));
    await createReceiptRequest(publish).load("row", read, "unavailable");
    expect(publish.mock.calls).toEqual([["row", "unavailable"]]); expect(read).toHaveBeenCalledTimes(1);
  });
});
