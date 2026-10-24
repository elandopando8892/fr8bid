/**
 * Domain types mirror the shapes returned by the rateware Edge Functions.
 * They are intentionally permissive (optional fields, index signature) because
 * the shared backend is the source of truth and evolves independently.
 */

export interface RfxEvent {
  id: string;
  name?: string;
  status?: string;
  event_type?: string;
  due_date?: string | null;
  /** When the operation is expected to start (arranque estimado); carriers see it. */
  operation_start_date?: string | null;
  lane_count?: number;
  bid_count?: number;
  invited_count?: number;
  shipper_id?: string | null;
  shipper_name?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface RfxLane {
  id: string;
  rfx_event_id?: string;
  origin?: string;
  destination?: string;
  equipment?: string;
  operation?: string;
  service?: string;
  status?: string;
  target_rate?: number | null;
  /** Set when the lane was declared void ("desierto"): the event closes it without an award. */
  no_award_at?: string | null;
  /** Internal; never sent to carriers. */
  no_award_reason?: string | null;
  no_award_by?: string | null;
  [key: string]: unknown;
}

export interface RfxBid {
  id: string;
  rfx_lane_id?: string;
  vendor_id?: string;
  vendor_name?: string;
  all_in_rate?: number | null;
  currency?: string;
  status?: string;
  rank?: number | null;
  [key: string]: unknown;
}

/**
 * Carrier from the shared Carrier CRM (`vendors`). The fields listed here are
 * the ones the backend reads to decide RFx eligibility, so they are the ones
 * Carrier Fit must show.
 */
export interface Vendor {
  id: string;
  vendor_name?: string;
  name?: string;
  domain?: string;
  primary_email?: string | null;
  secondary_emails?: unknown[] | null;
  whatsapp_phone?: string | null;
  preferred_channel?: string | null;
  base_stage?: string | null;
  status?: string | null;
  tags?: unknown[] | null;
  coverage_notes?: string | null;
  [key: string]: unknown;
}

/**
 * Carrier list template = vendor_segments row with segment_type
 * participant_template. Column names verified against prod: the display name is
 * `segment_name`, and the v2 lifecycle columns are live.
 */
export interface CarrierListTemplate {
  id: string;
  segment_name?: string;
  description?: string;
  segment_type?: "participant_template" | "dynamic" | string;
  vendor_ids?: string[];
  lifecycle_status?: "draft" | "active" | "archived" | string;
  template_version?: number;
  member_count?: number;
  updated_at?: string;
  updated_by_email?: string;
  created_by_email?: string;
  [key: string]: unknown;
}

export interface ShipperRfiMagicLink {
  id: string;
  rfi_id?: string;
  url?: string;
  status?: string;
  email?: string;
  expires_at?: string | null;
  [key: string]: unknown;
}

export interface ShipperRfi {
  id: string;
  name?: string;
  status?: string;
  request_type?: "spot" | "mini_bid" | "program" | string;
  shipper_name?: string;
  submitted_at?: string | null;
  [key: string]: unknown;
}
