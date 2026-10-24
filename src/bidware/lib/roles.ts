import { tr } from "@/i18n/common";
import type { User } from "@supabase/supabase-js";
import type { Need } from "./needs";

/**
 * Team roles (decided 2026-09-27). The role lives in the account's
 * `app_metadata.roles`, which only the server can write; rateware's screens
 * read the same field.
 *
 *   admin     everything.
 *   operator  builds and runs events and quotes, and talks to carriers and
 *             shippers. Doesn't award or hand awards to rateware, publish a
 *             Ratebook, approve a rate into the rate base or take one out of
 *             it, archive, restore or delete records (merging shippers and
 *             carriers, and archiving or restoring a carrier, included), change
 *             the shared catalog, revoke what a shipper was given, or disconnect
 *             an integration.
 *   viewer    reads only.
 *
 * An account without a role reads only until an admin gives it one.
 *
 * This is the screen's side: buttons say why they're off, and a call the role
 * doesn't allow never leaves the browser. The server applies the same rules
 * (rateware _shared/team-roles.ts) to whoever calls the API directly, and also
 * the ones only the rows can tell (taking approved rates out of the rate base,
 * restoring an archived shipper), which it checks after reading them.
 */
export type TeamRole = "admin" | "operator" | "viewer";

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  get admin() { return tr("text042"); },
  get operator() { return tr("text043"); },
  get viewer() { return tr("text044"); },
};

const RANK: Record<TeamRole, number> = { viewer: 0, operator: 1, admin: 2 };

/** The highest role the account carries; none means viewer. */
export function teamRoleOf(user: Pick<User, "app_metadata"> | null | undefined): TeamRole {
  const roles = user?.app_metadata?.roles;
  let best: TeamRole = "viewer";
  for (const value of Array.isArray(roles) ? roles : []) {
    const role = String(value).trim().toLowerCase();
    if (role in RANK && RANK[role as TeamRole] > RANK[best]) best = role as TeamRole;
  }
  return best;
}

/** What an action asks of the role: reading, day-to-day work, or an admin decision (see ./needs). */
export { needOf, type Need } from "./needs";

export const allows = (role: TeamRole, need: Need) =>
  need === "read" || (need === "operate" ? role !== "viewer" : role === "admin");

/** Why a button is off, in the team's words. */
export const NEED_REASON: Record<Exclude<Need, "read">, string> = {
  get operate() { return tr("text045"); },
  get admin() { return tr("text046"); },
};

// The signed-in account's role, for the API client. AuthProvider keeps it current.
let current: TeamRole = "viewer";
export const setCurrentTeamRole = (role: TeamRole) => {
  current = role;
};
export const currentTeamRole = () => current;
