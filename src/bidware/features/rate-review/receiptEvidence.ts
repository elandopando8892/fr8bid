export type ReceiptOriginal = {
  rawUploadId: string;
  objectId: string;
  objectVersion: string;
  sha256: string;
  sizeBytes: number;
};

export type ReceiptView =
  | { state: "loading" | "unavailable" | "missing" | "inconsistent" }
  | {
      state: "recorded";
      receiptId: string;
      stagingId: string;
      currentStatus: string | null;
      original?: ReceiptOriginal;
    };

type ReceiptRow = { id: string; raw_upload_id?: unknown };
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => own(value, key));
const inconsistent = (): ReceiptView => ({ state: "inconsistent" });

/** Only the authenticated Rateware DTO is canonical; never infer a receipt from a staged row. */
export function parseStagingReceipt(value: unknown, row: ReceiptRow): ReceiptView {
  if (
    !record(value) ||
    !exact(value, ["contractVersion", "state", "stagingId", "currentStatus", "receipt", "historyOnly", "submissionEnabled"]) ||
    value.contractVersion !== "bidware.staging-receipt.v1" ||
    !uuid(row.id) || value.stagingId !== row.id ||
    value.historyOnly !== true || value.submissionEnabled !== false ||
    !(typeof value.currentStatus === "string" || value.currentStatus === null)
  ) return inconsistent();

  if (value.state === "missing" || value.state === "inconsistent" || value.state === "unavailable") {
    return value.receipt === null ? { state: value.state } : inconsistent();
  }
  const receipt = value.receipt;
  if (
    value.state !== "recorded" || !record(receipt) ||
    !uuid(receipt.receiptId) || receipt.stagingId !== row.id || receipt.targetStatus !== "pending_review" ||
    !exact(receipt, ["receiptId", "stagingId", "targetStatus", ...(own(receipt, "originalSource") ? ["originalSource"] : [])])
  ) return inconsistent();

  const view: ReceiptView = {
    state: "recorded", receiptId: receipt.receiptId, stagingId: row.id, currentStatus: value.currentStatus,
  };
  if (!own(receipt, "originalSource")) return view;
  const original = receipt.originalSource;
  if (
    !record(original) || !exact(original, ["rawUploadId", "objectId", "objectVersion", "sha256", "sizeBytes"]) ||
    !uuid(original.rawUploadId) || !uuid(original.objectId) || original.rawUploadId !== row.raw_upload_id ||
    typeof original.objectVersion !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(original.objectVersion) ||
    typeof original.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(original.sha256) ||
    typeof original.sizeBytes !== "number" || !Number.isSafeInteger(original.sizeBytes) ||
    original.sizeBytes <= 0 || original.sizeBytes > 25 * 1024 * 1024
  ) return inconsistent();
  return { ...view, original: {
    rawUploadId: original.rawUploadId, objectId: original.objectId, objectVersion: original.objectVersion,
    sha256: original.sha256, sizeBytes: original.sizeBytes,
  } };
}

/** A loading, failed, removed or ambiguous queue row cannot keep an old receipt on screen. */
export function currentReceiptRow<T extends ReceiptRow>(rows: T[], id: string, loading: boolean, error: unknown): T | null {
  if (loading || error) return null;
  const matches = rows.filter((row) => row.id === id);
  return matches.length === 1 ? matches[0] : null;
}
