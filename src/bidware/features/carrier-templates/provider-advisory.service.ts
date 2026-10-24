import { callRatewareApi } from "@/lib/api-client";
export const ADVISORY_STATUSES = ["NOT_ASSESSED", "PENDING", "OBSERVED", "EXPIRED", "REJECTED", "UNAVAILABLE"] as const;
export type AdvisoryStatus = typeof ADVISORY_STATUSES[number];
export interface ProviderAdvisory {
  vendor_id: string; status: AdvisoryStatus; reason: string;
  blocking: false; advisory_only: true; prevents_rfq: false; prevents_award: false;
  authorizes_transport: false; authorizes_contact: false;
  document_count?: number; expired_document_count?: number;
}
export async function getProviderAdvisory(vendorId: string): Promise<ProviderAdvisory> {
  const fallback: ProviderAdvisory = { vendor_id: vendorId, status: "UNAVAILABLE", reason: "SOURCE_UNAVAILABLE",
    blocking: false, advisory_only: true, prevents_rfq: false, prevents_award: false, authorizes_transport: false, authorizes_contact: false };
  try {
    const r = await callRatewareApi<ProviderAdvisory>("get_carrier_provider_advisory", { vendor_id: vendorId });
    if (r.vendor_id !== vendorId || !ADVISORY_STATUSES.includes(r.status) || r.blocking !== false || r.advisory_only !== true ||
      r.prevents_rfq !== false || r.prevents_award !== false || r.authorizes_transport !== false || r.authorizes_contact !== false) return fallback;
    return r;
  } catch { return fallback; }
}
