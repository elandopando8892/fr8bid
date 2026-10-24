import { tr } from "@/i18n/rfx-admin";
import type { RfxEvent, RfxLane } from "@/types/domain";

/**
 * Where an event stands in its life, derived from what the backend already
 * returns. `list_rfx_detail` gives `lanes[]`, each carrying its `invitations`,
 * `invitation_count` and `bid_count` — so the whole stage model comes from one
 * call, with no extra round trip and nothing invented.
 *
 * The status vocabulary is the real one in prod:
 *   drafted -> invited -> viewed -> quoted,  plus declined.
 * `drafted` means shortlisted but never contacted, which is why Launch is not
 * complete until at least one invitation has left that state.
 */

export type StageKey = "build" | "launch" | "operate" | "close";
export type StageState = "done" | "current" | "locked";

export interface Gate {
  ok: boolean;
  label: string;
}

export interface Stage {
  key: StageKey;
  label: string;
  state: StageState;
  note: string;
  /** What must be true to leave this stage. */
  gates: Gate[];
}

export interface LaneWithInvitations extends RfxLane {
  invitations?: Record<string, unknown>[];
  invitation_count?: number;
  bid_count?: number;
}

const statusOf = (i: Record<string, unknown>) =>
  String(i.invitation_status ?? "").toLowerCase();

/** Mirrors isQuotedInvitation in the edge function. */
const isQuoted = (i: Record<string, unknown>) =>
  i.bid_rate != null || statusOf(i) === "quoted" || statusOf(i) === "bid_submitted";

/**
 * Sent means the invitation's message really went out. rateware says so per
 * invitation (`outreach_sent_at`: the latest send Gmail or WhatsApp accepted,
 * bounced and failed ones left out), because authorizing an invitation stamps
 * `invited_at` without sending anything. When the detail comes without that
 * field (an older backend, or the sends couldn't be read) it falls back to
 * `invited_at`, which overcounts what was only authorized.
 */
export const isContacted = (i: Record<string, unknown>) => {
  const s = statusOf(i);
  if (s === "archived") return false;
  if ("outreach_sent_at" in i) return Boolean(i.outreach_sent_at);
  return Boolean(i.invited_at) && s !== "" && s !== "drafted";
};

/** Authorized to go (no longer a draft) but its message hasn't left yet. */
export const isAwaitingSend = (i: Record<string, unknown>) => {
  const s = statusOf(i);
  return !["", "drafted", "archived", "declined"].includes(s) && !isContacted(i) && !isQuoted(i);
};

export interface EventStats {
  lanes: number;
  /** One per carrier per lane. */
  invitations: number;
  /** Distinct carriers across all lanes. */
  carriers: number;
  contacted: number;
  /** Authorized but not sent yet: they leave from the delivery queue. */
  awaitingSend: number;
  quoted: number;
  declined: number;
  awardedLanes: number;
  /** Declared void ("desierto"): the event closes them without an award. */
  voidLanes: number;
  /** Neither a primary nor declared void: what still keeps the event from closing. */
  undecidedLanes: number;
  noContact: number;
}

export function statsOf(lanes: LaneWithInvitations[]): EventStats {
  const all = lanes.flatMap((l) => l.invitations ?? []);
  const awarded = lanes.filter((l) =>
    (l.invitations ?? []).some((i) => String(i.award_role ?? "").toLowerCase() === "primary"),
  );
  const voided = lanes.filter((l) => l.no_award_at && !awarded.includes(l));
  return {
    lanes: lanes.length,
    invitations: all.length,
    carriers: new Set(all.map((i) => String(i.vendor_id ?? i.id))).size,
    contacted: all.filter(isContacted).length,
    awaitingSend: all.filter(isAwaitingSend).length,
    quoted: all.filter(isQuoted).length,
    declined: all.filter((i) => statusOf(i) === "declined").length,
    awardedLanes: awarded.length,
    voidLanes: voided.length,
    undecidedLanes: lanes.length - awarded.length - voided.length,
    noContact: all.filter((i) => {
      const v = (i.vendors ?? {}) as Record<string, unknown>;
      return !String(v.primary_email ?? "").trim() && !String(v.whatsapp_phone ?? "").trim();
    }).length,
  };
}

/**
 * The gates are deliberately the operator's, not the server's: the backend
 * validates integrity (is this carrier in the template, has the window closed)
 * but never completeness. Nothing here blocks a write — it tells the operator
 * what is missing before they do something they cannot take back.
 */
export function stagesOf(event: RfxEvent | undefined, lanes: LaneWithInvitations[]): Stage[] {
  const s = statsOf(lanes);
  // "awarded" is what handing the awards to rateware leaves; the event is done either way.
  const closed = ["closed", "awarded"].includes(String(event?.status ?? "").toLowerCase());

  const buildGates: Gate[] = [
    { ok: s.lanes > 0, label: tr("text754", s.lanes) },
    { ok: s.invitations > 0, label: tr("text755", s.carriers, s.invitations) },
  ];
  const launchGates: Gate[] = [
    { ok: s.contacted > 0, label: tr("text756", s.contacted, s.invitations) },
    { ok: s.noContact === 0, label: s.noContact ? tr("text757", s.noContact) : tr("text758") },
  ];
  const operateGates: Gate[] = [
    { ok: s.quoted > 0, label: tr("text759", s.quoted) },
    { ok: true, label: tr("text760", s.declined) },
  ];
  // Every lane ends with a primary or declared void (rateware refuses to close otherwise, 2026-09-29).
  const closeGates: Gate[] = [
    {
      ok: s.lanes > 0 && s.undecidedLanes === 0,
      label: s.voidLanes
        ? tr("text761", s.awardedLanes + s.voidLanes, s.lanes, s.voidLanes, s.voidLanes === 1 ? "" : "s")
        : tr("text145", s.awardedLanes, s.lanes),
    },
    { ok: s.quoted > 0, label: tr("text762") },
  ];

  const buildDone = buildGates.every((g) => g.ok);
  // A carrier quoting (a capture by the team, a lane requested from the board)
  // also shows the event is out, even when no message of ours went.
  const launchDone = buildDone && (s.contacted > 0 || s.quoted > 0);
  const operateDone = launchDone && s.quoted > 0;
  const closeDone = closed && s.undecidedLanes === 0;

  const state = (done: boolean, reachable: boolean): StageState =>
    done ? "done" : reachable ? "current" : "locked";

  return [
    {
      key: "build",
      label: "Build",
      state: state(buildDone, true),
      note: `${s.lanes} lanes · ${s.carriers} carriers`,
      gates: buildGates,
    },
    {
      key: "launch",
      label: "Launch",
      state: state(launchDone, buildDone),
      note: tr("text763", s.contacted, s.invitations, s.awaitingSend ? tr("text764", s.awaitingSend) : ""),
      gates: launchGates,
    },
    {
      key: "operate",
      label: "Operate",
      state: state(operateDone, launchDone),
      note: s.quoted ? tr("text765", s.quoted) : tr("text766"),
      gates: operateGates,
    },
    {
      key: "close",
      label: "Close",
      state: state(closeDone, operateDone),
      note: s.lanes
        ? tr("text767", s.awardedLanes, s.lanes, s.voidLanes ? tr("text768", s.voidLanes, s.voidLanes === 1 ? "" : "s") : "")
        : tr("text769"),
      gates: closeGates,
    },
  ];
}

/** The stage the operator lands on: the first one not yet finished. */
export function activeStage(stages: Stage[]): StageKey {
  return (stages.find((s) => s.state === "current") ?? stages[stages.length - 1]).key;
}
