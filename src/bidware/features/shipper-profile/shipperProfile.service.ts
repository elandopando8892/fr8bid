import { callShipperProfileApi } from "@/lib/api-client";

/**
 * The shipper's own profile, reached from the private link the team creates
 * on the shipper's page (create_shipper_profile_request). shipper-profile-api
 * scopes everything to that one shipper through the link's token.
 *
 * What submit_profile does with what it receives, and so what this page sends:
 * - shipper columns: only the keys sent (a key sent blank erases the column);
 * - profile_data: merged by section, each section replaced whole;
 * - contacts and sites: with an id they are rewritten whole, without one they
 *   are added; nothing is ever deleted.
 */
export type Section = "company" | "onboarding" | "network" | "billing";

export interface PublicShipper {
  id: string;
  shipper_name: string | null;
  legal_name: string | null;
  domain: string | null;
  website: string | null;
  industry: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  headquarters_country: string | null;
  profile_data: Partial<Record<Section, Record<string, unknown>>>;
  [key: string]: unknown;
}

export interface PublicContact {
  id?: string;
  name: string | null;
  title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  preferred_channel: string | null;
  is_primary: boolean | null;
  notes: string | null;
}

export interface PublicLocation {
  id?: string;
  location_name: string | null;
  location_type: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_code: string | null;
  country_code: string | null;
  postal_code: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  operating_hours: string | null;
  handling_type: string | null;
  appointment_required: boolean | null;
  notes: string | null;
}

export interface ProfileResponse {
  request: { id: string; status: string; expires_at: string | null };
  shipper: PublicShipper;
  contacts: PublicContact[];
  locations: PublicLocation[];
}

export interface ProfileSubmit {
  shipper: Record<string, string | null>;
  profile_data: Partial<Record<Section, Record<string, unknown>>>;
  contacts: PublicContact[];
  locations: PublicLocation[];
  submitted_contact: { name: string; email: string };
}

export const getShipperProfile = (token: string) => callShipperProfileApi<ProfileResponse>("get_profile", { token });

export const submitShipperProfile = (token: string, payload: ProfileSubmit) =>
  callShipperProfileApi<{ submitted: boolean }>("submit_profile", { token, ...payload });
