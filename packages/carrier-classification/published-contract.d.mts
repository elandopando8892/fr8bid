export interface PublishedRow {
  rate_id: string; vendor_id: string; vendor_name: string; environment: string; direction: string;
  equipment_family: string; template_names: string[]; classification_status: string;
  source_operation: string; derived_operation: string; origin: string; destination: string;
  source_sheet: string; source_row: number; shipment_id: string; source_sha256: string;
  source_run_id: string; approval_status: string; original_document_and_rate_unchanged: true;
  membership_action: 'keep_pending'; execution_role_status: 'unknown'; rfq_preselection_eligible: false;
  operational_assignment_approved: false; invitation_authorized: false;
}
export interface PublishedPending {
  key: string; vendor_id: string; row_count: number; classification_status: string;
  resolution_status: string; action: 'keep_pending'; rfq_preselection_eligible: false;
  classification_statuses: string[]; resolution_statuses: string[];
  operational_assignment_approved: false; invitation_authorized: false;
}
export interface PublishedClassification {
  schema_version: string; organization_id: string; status: 'empty' | 'published'; reason: string | null;
  publication: null | {
    run_id: string; source_run_id: string; completed_at: string; methodology_version: string;
    payload_sha256: string; scope: string; approved_row_count: number; approved_rate_ids: string[];
    vendor_id: string; full_universe_replacement: false; original_sources_preserved: true;
    rows: PublishedRow[]; pending: PublishedPending[];
  };
}
export const PUBLICATION_SCHEMA: string;
export const PUBLICATION_METHOD: string;
export const IDENTITY_PENDING_RATE_ID: string;
export const PENDING_CASES: readonly { key: string; vendor_id: string; row_count: number; classification_status: string; resolution_status: string }[];
export function parsePublishedClassification(value: unknown, organizationId: string): PublishedClassification;
