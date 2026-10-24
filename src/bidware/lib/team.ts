/**
 * Only the team's own Google Workspace domains use Bidware (decided
 * 2026-09-25). Carriers and shippers never sign in: their pages work by token.
 */
export const TEAM_EMAIL_DOMAINS = ["xbfreight.com", "heymarksman.com"];

export function isTeamEmail(email: string | null | undefined): boolean {
  const address = String(email ?? "").trim().toLowerCase();
  const at = address.lastIndexOf("@");
  return at > 0 && TEAM_EMAIL_DOMAINS.includes(address.slice(at + 1));
}
