import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReceiptEvidenceDialog } from "../src/bidware/features/rate-review/ReceiptEvidenceDialog";
import { RateReviewPage } from "../src/bidware/features/rate-review/RateReviewPage";
import { getStagingReceipt } from "../src/bidware/features/rate-review/rateReview.service";
import { setLang } from "../src/bidware/i18n/language";
import type { StagedRate } from "../src/bidware/features/rate-review/readiness";

const { api, auth } = vi.hoisted(() => ({
  api: vi.fn(),
  auth: { authenticated: true, loading: false, roleLoaded: true, user: { id: "account-a" }, role: "viewer", can: (need: string) => need === "read" },
}));
vi.mock("../src/bidware/lib/api-client", () => ({ callRatewareApi: api }));
vi.mock("../src/bidware/auth/AuthContext", () => ({ useAuth: () => auth }));

const stagingId = "10000000-0000-4000-8000-000000000001";
const receiptId = "20000000-0000-4000-8000-000000000001";
const nextReceiptId = "20000000-0000-4000-8000-000000000002";
const rawUploadId = "30000000-0000-4000-8000-000000000001";
const row: StagedRate = { id: stagingId, raw_upload_id: rawUploadId, origin: "Origen sintético", destination: "Destino sintético" };
const dto = (id = stagingId, receipt = receiptId) => ({
  contractVersion: "bidware.staging-receipt.v1", state: "recorded", stagingId: id, currentStatus: "approved",
  receipt: { receiptId: receipt, stagingId: id, targetStatus: "pending_review", originalSource: {
    rawUploadId, objectId: "40000000-0000-4000-8000-000000000001", objectVersion: "v1", sha256: "a".repeat(64), sizeBytes: 11246,
  } }, historyOnly: true, submissionEnabled: false,
});
let root: Root, container: HTMLElement;
const close = vi.fn();
const render = async (value: StagedRate | null = row) => {
  await act(async () => root.render(createElement(ReceiptEvidenceDialog, { row: value, onClose: close })));
};
const deferred = () => {
  let resolve!: (value: unknown) => void, reject!: (reason: Error) => void;
  const promise = new Promise<unknown>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  const dom = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network is forbidden in this fixture"); }));
  setLang("es");
  container = document.getElementById("root")!; root = createRoot(container);
  auth.user = { id: "account-a" }; auth.role = "viewer"; auth.roleLoaded = true; auth.loading = false; auth.authenticated = true;
  api.mockReset(); api.mockResolvedValue(dto()); close.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

describe("diálogo real con transporte simulado", () => {
  it("lee una vez y muestra el recibo/original canónicos, sin autoridad de descarga o envío", async () => {
    await render();
    expect(api.mock.calls).toEqual([["get_staging_receipt", { stagingId }]]);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Recibo de la cotización");
    expect(container.textContent).toContain(receiptId);
    expect(container.textContent).toContain("approved");
    expect(container.textContent).toContain("11246 bytes");
    expect(container.textContent).toContain("a".repeat(64));
    expect(container.querySelector("a, input, form")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect([...container.querySelectorAll("button")].some((b) => /Enviar|Aprobar|Descargar/.test(b.textContent ?? ""))).toBe(false);
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Cerrar")!.click());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("el servicio conserva exclusivamente stagingId y la acción de lectura", async () => {
    expect(await getStagingReceipt(stagingId)).toEqual(dto());
    expect(api.mock.calls).toEqual([["get_staging_receipt", { stagingId }]]);
  });

  it("muestra ausencia solo cuando el contrato la confirma", async () => {
    api.mockResolvedValue({ ...dto(), state: "missing", receipt: null }); await render();
    expect(container.textContent).toContain("No hay evidencia de recibo disponible");
    expect(container.textContent).not.toContain(receiptId);
  });

  it("un fallo de red retira la ruta y nunca se presenta como ausencia", async () => {
    api.mockRejectedValue(new Error("upstream private error")); await render();
    expect(container.textContent).toContain("No podemos determinar si existe");
    expect(container.textContent).not.toContain("No hay evidencia de recibo");
    expect(container.textContent).not.toContain(row.origin!);
    expect(container.textContent).not.toContain("upstream private error");
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("muestra inconsistencia y no filtra el recibo de una fila diferente", async () => {
    api.mockResolvedValue(dto("50000000-0000-4000-8000-000000000001")); await render();
    expect(container.textContent).toContain("La evidencia del recibo es inconsistente");
    expect(container.textContent).not.toContain(receiptId);
  });

  it("cambiar de cuenta retira la evidencia previa y descarta la respuesta tardía", async () => {
    const old = deferred(), fresh = deferred();
    api.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    await render();
    auth.user = { id: "account-b" }; await render();
    await act(async () => old.resolve(dto()));
    expect(container.textContent).not.toContain(receiptId);
    expect(container.textContent).toContain("Consultando el recibo");
    await act(async () => fresh.resolve(dto(stagingId, nextReceiptId)));
    expect(container.textContent).toContain(nextReceiptId);
    expect(container.textContent).not.toContain(receiptId);
  });

  it("volver a verificar la misma cuenta vuelve a leer sin mostrar el resultado viejo", async () => {
    await render(); expect(container.textContent).toContain(receiptId);
    auth.roleLoaded = false; await render();
    expect(container.textContent).not.toContain(receiptId);
    expect(container.textContent).not.toContain(row.origin!);
    const fresh = deferred(); api.mockReturnValueOnce(fresh.promise);
    auth.roleLoaded = true; await render();
    expect(container.textContent).not.toContain(receiptId);
    expect(container.textContent).toContain("Consultando el recibo");
    await act(async () => fresh.resolve(dto(stagingId, nextReceiptId)));
    expect(container.textContent).toContain(nextReceiptId);
  });

  it("cambiar de fila retira la respuesta de la anterior", async () => {
    const old = deferred(), fresh = deferred();
    api.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    await render();
    const next = { ...row, id: "50000000-0000-4000-8000-000000000001", origin: "Otra ruta" };
    await render(next); await act(async () => old.resolve(dto()));
    expect(container.textContent).not.toContain(receiptId);
    await act(async () => fresh.resolve(dto(next.id, nextReceiptId)));
    expect(container.textContent).toContain(nextReceiptId);
    expect(container.textContent).not.toContain(row.origin!);
  });

  it("logout, error de lista y desmontaje retiran los datos y no provocan nuevas lecturas", async () => {
    await render(); auth.authenticated = false; await render();
    expect(container.textContent).not.toContain(receiptId); expect(api).toHaveBeenCalledTimes(1);
    auth.authenticated = true; await render(null);
    expect(container.textContent).not.toContain(receiptId); expect(api).toHaveBeenCalledTimes(1);
    const late = deferred(); api.mockReturnValueOnce(late.promise); await render();
    await act(async () => root.render(null));
    await act(async () => late.reject(new Error("late")));
    expect(container.textContent).toBe(""); expect(api).toHaveBeenCalledTimes(2);
  });

  it("reutiliza los textos en inglés sin alterar la evidencia", async () => {
    setLang("en"); await render();
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Quote receipt");
    expect(container.textContent).toContain("Historical reference");
    expect(container.textContent).toContain(receiptId);
  });

  it("la pantalla permite Ver recibo a Consulta y conserva Corregir deshabilitado", async () => {
    api.mockImplementation(async (action: string) => {
      if (action === "list_staging") return { rows: [row], total: 1 };
      if (action === "list_catalog_values" || action === "list_rfx_events") return { rows: [] };
      if (action === "get_staging_receipt") return dto();
      throw new Error("Unexpected action: " + action);
    });
    await act(async () => root.render(createElement(RateReviewPage)));
    const buttons = [...container.querySelectorAll("button")];
    const view = buttons.find((b) => b.textContent === "Ver recibo");
    expect(view).toBeTruthy(); expect(view!.disabled).toBe(false);
    const edit = buttons.find((b) => b.textContent === "Corregir");
    expect(edit).toBeTruthy(); expect(edit!.disabled).toBe(true);
    await act(async () => view!.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(receiptId);
    expect(api.mock.calls.filter(([action]) => action === "get_staging_receipt")).toEqual([["get_staging_receipt", { stagingId }]]);
    expect(api.mock.calls.every(([action]) => ["list_staging", "list_catalog_values", "list_rfx_events", "get_staging_receipt"].includes(action))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
