// What each call asks of the team role, without the screen's words: the API
// client checks it before a call leaves the browser, and Fr8Bid's /api/funcion
// reads it to tell reads from writes. Kept apart from roles.ts so the server
// can import it (no "@/" alias, no i18n).

/** What an action asks of the role: reading, day-to-day work, or an admin decision. */
export type Need = "read" | "operate" | "admin";

/**
 * The lists below are copied from rateware's _shared/team-roles.ts, the
 * server's lock; keep them the same.
 *
 * Actions that only read. For rateware-api these are the ones the action
 * contract marks access "read" or "export"; QuoteDesk's and the carrier
 * templates' aren't in the contract.
 */
const READS: Record<string, Set<string>> = {
  "rateware-api": new Set([
    "book_audit", "business_intelligence_drilldown", "business_intelligence_geo_density",
    "business_intelligence_pivot", "carrier_intelligence_chat", "dashboard_summary", "export_growth_campaign",
    "export_ratebook_routes", "get_carrier_list_template", "get_carrier_provider_advisory", "get_published_carrier_classification", "get_growth_campaign", "get_outreach_message",
    "get_outreach_tracking_summary", "get_rate_row_detail", "get_ratebook", "get_ratebook_audit",
    "get_ratebook_health", "get_ratebook_route_detail", "get_ratebook_route_quotes", "get_rateware_version",
    "get_rfx_process_project", "get_saas_settings", "get_shipper", "get_upload_source_url",
    "get_vendor_relationship_activity", "get_whatsapp_connection_status", "growth_dashboard",
    "list_bid_room_chat", "list_carrier_list_templates", "list_catalog_values", "list_contact_history", "review_whatsapp_reply_association",
    "list_gmail_connections", "list_google_chat_connections", "list_google_chat_spaces",
    "list_growth_campaigns", "list_growth_results", "list_growth_segments", "list_interpretation_memory",
    "list_interpretation_memory_audit", "list_location_catalog_values", "list_observability_events",
    "list_outreach_audience_segments", "list_outreach_campaigns", "list_outreach_messages",
    "list_outreach_templates", "list_ratebook_carriers", "list_ratebooks", "list_rateware",
    "list_rateware_audit", "list_rateware_filter_values", "list_rateware_rows_by_ids",
    "list_rateware_versions", "list_rfx_detail", "list_rfx_event_context", "list_rfx_events",
    // The carrier contact reviews; the contract declares them in an extension file (added 2026-09-29).
    "list_rfx_invitation_wave_reviews", "list_rfx_segment_confirmations",
    "list_rfx_process_projects", "list_rfx_response_vendor_ids", "list_saas_audit_log",
    "list_shipper_duplicates", "list_shippers", "list_staging", "list_staging_filter_values",
    "list_staging_options", "list_upload_staged_rows", "list_uploads", "list_vendor_improvement_cases",
    "list_vendor_segments", "list_vendor_support_tickets", "list_vendor_unmatched_ids", "list_vendors",
    "list_whatsapp_connections", "list_whatsapp_phone_numbers", "list_whatsapp_templates",
    "preview_growth_segment", "preview_outreach_audience", "resolve_carrier_list_template_rows",
    "search_staging_locations", "shipper_crm_summary", "shipper_intelligence", "vendor_funnel",
    "vendor_intelligence", "vendor_onboarding_gaps",
  ]),
  "quotedesk-api": new Set([
    "event_origins", "get_context", "get_quote", "list_fcm_cost_bases", "list_quote_emails", "list_quotes",
    "preview_quote_email", "list_quote_queue", "list_spot_request_quotes", "suggest_lane_miles",
    // The FCM estimate prices a route without saving it, like suggest_lane_miles (opened 2026-09-29).
    "estimate_lane_fcm",
  ]),
};

/**
 * Admin decisions:
 * - awarding and handing awards to rateware (the contract's rfx.approve);
 * - archiving and restoring (rfx.restrict and the like);
 * - the shared catalog (catalog.manage, rates.manage).
 */
const ADMIN: Record<string, Set<string>> = {
  "rateware-api": new Set([
    // Awarding, handing the awards to rateware, and publishing the Ratebook (decided 2026-09-27)
    "award_rfx_lane_vendor", "clear_rfx_award", "closeout_awarded_rfx_to_rateware", "create_rfx_award_package",
    "generate_rfx_award_notices", "mark_rfx_award_package_implementation_ready", "publish_ratebook",
    // Declaring a lane void or reopening it (decided 2026-09-29)
    "set_rfx_lane_no_award",
    // Archiving, restoring and deleting records
    "archive_rfx_event", "delete_rfx_event", "archive_carrier_list_template", "restore_carrier_list_template",
    "delete_vendor_segment", "remove_vendors", "archive_shippers", "delete_shipper_record", "archive_ratebook",
    "merge_shipper_accounts",
    // Taking approved rates out of the rate base (decided 2026-09-28)
    "return_rateware_to_staging",
    "archive_outreach_campaign", "delete_outreach_campaign", "archive_outreach_template", "delete_outreach_template",
    // Taking back what a shipper was given
    "revoke_rfx_rfi_magic_link", "revoke_shipper_profile_request",
    // The shared catalog
    "save_catalog_value", "save_location_catalog_value", "save_location_alias", "archive_catalog_value",
    "archive_location_catalog_value", "bulk_import_catalog_values",
    // Disconnecting an integration
    "disconnect_gmail_connection", "disconnect_google_chat_connection", "disconnect_whatsapp_business_connection",
  ]),
  "quotedesk-api": new Set(["save_accessorial"]),
};

/**
 * Statuses only an admin sets through a general update: archiving, restoring
 * (an event back to draft, a quote back to the queue), closing or awarding an
 * event outright, and approving a staged rate into the rate base (2026-09-28).
 */
const ADMIN_STATUSES: Record<string, Set<string>> = {
  "rateware-api.update_rfx_event": new Set(["archived", "draft", "closed", "awarded"]),
  "rateware-api.update_rfx_process_project": new Set(["archived"]),
  "rateware-api.update_shipper": new Set(["archived"]),
  "rateware-api.update_staging": new Set(["approved"]),
  "rateware-api.bulk_update_staging": new Set(["approved"]),
  "rateware-api.bulk_update_rate_rows_by_filter": new Set(["approved"]),
  "quotedesk-api.set_quote_status": new Set(["archived", "new"]),
};

/**
 * Carrier stages only an admin sets (2026-09-29). A carrier is archived through
 * its base stage, not its status, so ADMIN_STATUSES can't see it.
 */
const ADMIN_BASE_STAGES: Record<string, Set<string>> = {
  "rateware-api.bulk_update_vendors": new Set(["archived"]),
  "rateware-api.update_vendor": new Set(["archived"]),
};

/**
 * Actions whose preview only reads and whose confirmed run (`dry_run: false`)
 * is an admin's: merging duplicate carriers deletes the duplicate (2026-09-29).
 */
const ADMIN_UNLESS_PREVIEW: Record<string, Set<string>> = {
  "rateware-api": new Set(["consolidate_exact_vendor_duplicates"]),
};

/** What calling `action` on `fn` asks of the role. Anything unlisted is day-to-day work. */
const record = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Every place a status could travel in the body; any admin status there makes it an admin call. */
function statusesIn(body: Record<string, unknown>) {
  return [body.status, record(body.patch).status, record(body.event).status, record(body.project).status]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/** What calling `action` on `fn` asks of the role. Anything unlisted is day-to-day work. */
export function needOf(fn: string, action: string, payload: Record<string, unknown> = {}): Need {
  if (ADMIN[fn]?.has(action)) return "admin";
  if (ADMIN_UNLESS_PREVIEW[fn]?.has(action)) return payload.dry_run === false ? "admin" : "read";
  const statuses = ADMIN_STATUSES[`${fn}.${action}`];
  if (statuses && statusesIn(payload).some((status) => statuses.has(status))) return "admin";
  const stages = ADMIN_BASE_STAGES[`${fn}.${action}`];
  if (stages?.has(String(record(payload.patch).base_stage ?? "").trim().toLowerCase())) return "admin";
  if (READS[fn]?.has(action)) return "read";
  return "operate";
}
