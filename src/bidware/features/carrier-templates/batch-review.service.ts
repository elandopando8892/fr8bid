import { listAllCarrierTemplates } from "./templates.service";
import { validateBatchCatalog, type BatchReview } from "./batch-review";

/** One paginated read, including archived origins. No usage_context, writes or retries. */
export async function readBatchCatalog(batch: BatchReview, organizationId: string) {
  if (!organizationId || (batch.declaredOrganization !== null && batch.declaredOrganization !== organizationId)) {
    throw new Error("BATCH_ORGANIZATION");
  }
  const result = await listAllCarrierTemplates();
  return validateBatchCatalog(batch, organizationId, result.rows);
}
