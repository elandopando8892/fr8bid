import type { SendResult } from "./outreach.service";

// Transport size, never a limit on the selection approved by the operator.
export const PACED_BATCH_SIZE = 50;
type Channel = "email" | "whatsapp";
export type WhatsappApproval = { contract: string; fingerprint: string; issued_at: number; expires_at: number; signature: string };
export type ApprovedMessageVersion = { id: string; updated_at: string; whatsapp_approval?: WhatsappApproval };
export type SendBatch = { ids: string[]; channel: Channel; operationId: string; expectedVersions: ApprovedMessageVersion[] };
export type BatchProgress = { phase: "sending" | "waiting"; batch: number; batches: number; sent: number; total: number };

export function planSendBatches(
  rows: { id: string; channel?: string; updated_at?: unknown; whatsapp_approval?: WhatsappApproval | null }[],
  operationIds: Map<string, string>,
  newId: () => string,
): SendBatch[] {
  const batches: SendBatch[] = [];
  for (const channel of ["email", "whatsapp"] as const) {
    const ids = [...new Set(rows.filter(r => r.channel === channel).map(r => r.id))].sort();
    for (let offset = 0; offset < ids.length; offset += PACED_BATCH_SIZE) {
      const part = ids.slice(offset, offset + PACED_BATCH_SIZE);
      const expectedVersions = part.map(id => {
        const matches = rows.filter(r => r.id === id && r.channel === channel);
        const updated_at = matches[0].updated_at;
        if (typeof updated_at !== "string" || !updated_at || matches.some(r => r.updated_at !== updated_at)) {
          throw new Error("OUTREACH_APPROVAL_REQUIRED");
        }
        const approval = channel === "whatsapp" ? matches[0].whatsapp_approval : null;
        if (channel === "whatsapp" && matches.some(r => JSON.stringify(r.whatsapp_approval) !== JSON.stringify(approval ?? undefined))) {
          // Null and absent both mean unreviewed; conflicting signed reviews do not.
          if (matches.some(r => r.whatsapp_approval != null || approval != null)) throw new Error("OUTREACH_APPROVAL_REQUIRED");
        }
        return { id, updated_at, ...(approval ? { whatsapp_approval: { ...approval } } : {}) };
      });
      const key = JSON.stringify([channel, part, expectedVersions]);
      if (!operationIds.has(key)) operationIds.set(key, newId());
      batches.push({ channel, ids: part, expectedVersions, operationId: operationIds.get(key)! });
    }
  }
  return batches;
}

export async function runSendBatches(options: {
  batches: SendBatch[];
  intervalMinutes: 1 | 5;
  isCurrent: () => boolean;
  send: (ids: string[], channel: Channel, operationId: string, expectedVersions: ApprovedMessageVersion[]) => Promise<SendResult>;
  wait: (milliseconds: number) => Promise<void>;
  onProgress: (progress: BatchProgress) => void;
}): Promise<{ status: "complete" | "stopped" | "attention"; sent: number; error?: string }> {
  let sent = 0;
  const total = options.batches.reduce((n, b) => n + b.ids.length, 0);
  for (let index = 0; index < options.batches.length; index++) {
    if (!options.isCurrent()) return { status: "stopped", sent };
    const progress = { batch: index + 1, batches: options.batches.length, total, sent };
    if (index > 0) {
      options.onProgress({ ...progress, phase: "waiting" });
      await options.wait(options.intervalMinutes * 60_000);
      if (!options.isCurrent()) return { status: "stopped", sent };
    }
    options.onProgress({ ...progress, phase: "sending" });
    const batch = options.batches[index];
    try {
      const result = await options.send(batch.ids, batch.channel, batch.operationId, batch.expectedVersions);
      const confirmed = Number.isInteger(result.sent) && result.sent! >= 0 && result.sent! <= batch.ids.length ? result.sent! : 0;
      sent += confirmed;
      if (confirmed !== batch.ids.length || result.failed || result.skipped || result.delivery_unknown || result.failures?.length || result.skipped_rows?.length) {
        const reasons = [...new Set([...(result.failures ?? []), ...(result.skipped_rows ?? [])].map(r => r.reason).filter(Boolean))];
        return { status: "attention", sent, error: reasons.join("; ") };
      }
    } catch (error) {
      return { status: "attention", sent, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { status: "complete", sent };
}

/** No catch-up bursts after a suspended tab. Cancellation is checked each second. */
export async function waitBetweenBatches(milliseconds: number, isCurrent: () => boolean) {
  const until = Date.now() + milliseconds;
  while (isCurrent() && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, until - Date.now())));
  }
}
