export interface EmpresaContacto { id: string; nombre: string; correo?: string | null }
export interface CandidatoContacto {
  id: string; name: string; title: string; domain: string; has_email: boolean;
  company_name: string; company_verified: boolean;
}
export interface OperacionContacto {
  id: string; vendor_id: string; person_id: string; person_name: string;
  state: "draft" | "processing" | "needs_link" | "completed" | "uncertain" | "failed";
  confirmation_hash: string | null; expires_at: string; max_credits: number | null;
  credits_confirmed: number | null; email: string | null; linked: boolean; code: string | null; provider_reference?: string | null;
}
export interface ContextoContacto {
  vendor: { id: string; name: string; domain: string; email: string | null; contact_name?: string | null };
  known: { state: "restricted" | "current" | "domain_required" | "ambiguous" | "missing" | "matched" | "linked"; candidates: { email: string; source: string }[] };
  operation: OperacionContacto | null; available: boolean;
  capabilities: { can_write: boolean; can_search: boolean; can_spend: boolean; max_credits: number | null };
}
export type SolicitudContacto =
  | { action: "context" | "resolve_known"; vendor_id: string }
  | { action: "choose_known"; vendor_id: string; email: string }
  | { action: "search"; vendor_id: string; page?: number }
  | { action: "prepare_reveal"; vendor_id: string; person_id: string }
  | { action: "confirm_reveal"; operation_id: string; confirmation_hash: string }
  | { action: "operation"; vendor_id: string }
  | { action: "apply_result"; operation_id: string };
export type RespuestaContacto = Partial<ContextoContacto> & { candidates?: CandidatoContacto[]; operation?: OperacionContacto | null };
export type ClienteContactos = (solicitud: SolicitudContacto) => Promise<RespuestaContacto>;
