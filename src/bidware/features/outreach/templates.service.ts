import { extra } from "@/i18n/outreach";
import { callRatewareApi } from "@/lib/api-client";

/**
 * Outreach templates: the invitation a campaign turns into drafts (email HTML
 * and WhatsApp text, with `{{variables}}` filled per carrier). rateware keeps
 * two kinds in the same list:
 * - system templates (no owner): the shared originals, nobody edits them;
 * - team templates: the workspace's own, including its versions of the system
 *   invitations under the same name. Those are the ones campaigns use most.
 */
export interface OutreachTemplate {
  id: string;
  owner_email?: string | null;
  name: string;
  channel?: string | null;
  subject?: string | null;
  html_body?: string | null;
  whatsapp_body?: string | null;
  whatsapp_group_body?: string | null;
  active?: boolean | null;
  is_default?: boolean | null;
  template_scope?: string | null;
  canonical_language?: string | null;
  placeholders?: string[] | null;
  meta_template_name?: string | null;
  meta_template_language?: string | null;
  meta_template_namespace?: string | null;
  meta_template_status?: string | null;
  meta_template_category?: string | null;
  meta_template_components?: unknown[] | null;
  /** Its link to the WhatsApp template Meta approved, if any. */
  whatsapp_meta?: {
    meta_template_name?: string | null;
    meta_template_language?: string | null;
    meta_template_status?: string | null;
  } | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export const isSystem = (t: Pick<OutreachTemplate, "owner_email">) => !t.owner_email;

export const CHANNELS: { value: string; label: string }[] = [
  { value: "multi", get label() { return extra("extra14"); } },
  { value: "email", get label() { return extra("extra15"); } },
  { value: "whatsapp", get label() { return extra("extra16"); } },
];

export const channelLabel = (channel?: string | null) =>
  CHANNELS.find((c) => c.value === channel)?.label ?? (channel || "—");

/** The server's own rule (outreachTemplateLanguage): Spanish words mean Spanish. */
export function languageOf(t: Partial<OutreachTemplate>): "es" | "en" {
  if (t.canonical_language === "es" || t.canonical_language === "en") return t.canonical_language;
  const text = [t.name, t.subject, t.html_body, t.whatsapp_body].filter(Boolean).join(" ").toLowerCase();
  return /spanish|espanol|español|por favor|gracias|modelo logistico|modelo logístico/.test(text) ? "es" : "en";
}

/** Every `{{variable}}` the texts use, as the server fills them. */
export function variablesOf(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of String(text ?? "").matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) found.add(match[1]);
  }
  return [...found];
}

export interface TemplateEdits {
  name: string;
  channel: string;
  subject: string;
  html_body: string;
  whatsapp_body: string;
}

/**
 * The whole template as rateware stores it. update_outreach_template rewrites
 * every column from what it receives: a field left out is reset (the channel
 * to email, "default" off, the variables and the Meta fields emptied), so the
 * edits go on top of the full row.
 */
function fullTemplate(base: Partial<OutreachTemplate>, edits: TemplateEdits) {
  const groupFollows = !base.whatsapp_group_body || base.whatsapp_group_body === base.whatsapp_body;
  const whatsappGroupBody = groupFollows ? edits.whatsapp_body : base.whatsapp_group_body ?? "";
  return {
    name: edits.name.trim(),
    channel: edits.channel,
    subject: edits.subject,
    html_body: edits.html_body,
    whatsapp_body: edits.whatsapp_body,
    whatsapp_group_body: whatsappGroupBody,
    meta_template_name: base.meta_template_name ?? "",
    meta_template_language: base.meta_template_language ?? "",
    meta_template_namespace: base.meta_template_namespace ?? "",
    meta_template_status: base.meta_template_status ?? "",
    meta_template_category: base.meta_template_category ?? "",
    meta_template_components: Array.isArray(base.meta_template_components) ? base.meta_template_components : [],
    active: base.active ?? true,
    is_default: base.is_default ?? false,
    template_scope: base.template_scope ?? "legacy",
    canonical_language: base.canonical_language ?? null,
    placeholders: variablesOf(edits.subject, edits.html_body, edits.whatsapp_body, whatsappGroupBody),
  };
}

/** The active templates, team and system. Archived ones are not listed. */
export async function listTemplates() {
  const res = await callRatewareApi<{ rows?: OutreachTemplate[] }>("list_outreach_templates");
  return res.rows ?? [];
}

export async function createTemplate(edits: TemplateEdits, base: Partial<OutreachTemplate> = {}) {
  const res = await callRatewareApi<{ row: OutreachTemplate }>("create_outreach_template", {
    template: fullTemplate({ ...base, is_default: false }, edits),
  });
  return res.row;
}

export async function updateTemplate(template: OutreachTemplate, edits: TemplateEdits) {
  const res = await callRatewareApi<{ row: OutreachTemplate }>("update_outreach_template", {
    id: template.id,
    patch: fullTemplate(template, edits),
  });
  return res.row;
}

/** A team copy named "… Copy"; it has no WhatsApp link until it is connected. */
export async function duplicateTemplate(id: string) {
  const res = await callRatewareApi<{ row: OutreachTemplate }>("duplicate_outreach_template", { id });
  return res.row;
}

/**
 * Links the template to the WhatsApp invitation Meta already approved for its
 * language (rateware_rfx_invitation_es / _en); rateware sends that fixed
 * notice with the carrier's Bid Room link, not the template's own text.
 */
export async function connectWhatsapp(id: string) {
  return await callRatewareApi<{ row?: { meta_template_status?: string | null }; ready?: boolean; message?: string }>(
    "publish_outreach_template_to_whatsapp",
    { template_id: id },
  );
}

/** Hides it from every list; campaigns keep it. An Administrador's. */
export async function archiveTemplate(id: string) {
  return await callRatewareApi("archive_outreach_template", {
    id,
    confirmed: true,
    confirmation_action: "archive_outreach_template",
  });
}

/**
 * Deletes it for good (an Administrador's). Campaigns and messages stay, no
 * longer linked to it, and its WhatsApp link goes with it.
 */
export async function deleteTemplate(id: string) {
  return await callRatewareApi("delete_outreach_template", {
    id,
    confirmed: true,
    confirmation_action: "delete_outreach_template",
  });
}
