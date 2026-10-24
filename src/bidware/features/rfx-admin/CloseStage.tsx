import { OfferDetailDialog, type OfferSelection } from "./OfferDetailDialog";
import { OfferComparisonDialog } from "./OfferComparisonDialog";
import { comparisonOffers } from "./offer-presentation";
import { offerText } from "@/i18n/offer-detail";
import { domainLabel } from "@/i18n/domain";
import { tr } from "@/i18n/rfx-admin";
import { useLang, locale, getLang } from "@/i18n/language";
import { confirmAsync, promptAsync } from "@/components/confirm";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  awardLaneVendor,
  clearAward,
  closeoutToRateware,
  isVoidLane,
  newOperationId,
  ROLE_LABEL,
  setLaneNoAward,
  type AwardRole,
} from "./award.service";
import type { LaneWithInvitations } from "./stages";
import { laneSegmentKey, termsLabel, termsOf, termsTone, type ConfirmationRow } from "./confirmations.service";
import { ErrorBanner, InfoBanner, Empty, Pill, money } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";

type Offer = Record<string, unknown>;
type LaneState = "covered" | "void" | "open" | "none";

const roleOf = (o: Offer) => String(o.award_role ?? "").toLowerCase();
const rateOf = (o: Offer) => Number(o.bid_rate);
const routeOf = (lane: LaneWithInvitations) => `${(lane.origin as string) || "—"} → ${(lane.destination as string) || "—"}`;

/** A calendar date as "15 oct"; `valid_through` is a date, not an instant. */
function day(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  if (!m) return "";
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

function expired(o: Offer): boolean {
  if (o.valid_through == null || o.valid_through === "") return false;
  const text = String(o.valid_through).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return true;
  // Same business day as the Bid Room, independent of the operator's browser zone.
  const end = Date.parse(`${text}T23:59:59.999-06:00`);
  return !Number.isFinite(end) || end < Date.now();
}

/** Why and when a lane was declared void, and by whom: "El cliente la canceló · 29 sep · ana@…". */
function voidNote(lane: LaneWithInvitations): string {
  const at = new Date(String(lane.no_award_at ?? ""));
  const when = Number.isNaN(at.getTime()) ? "" : at.toLocaleDateString(locale(), { day: "numeric", month: "short" });
  return [String(lane.no_award_reason ?? "").trim(), when, String(lane.no_award_by ?? "").trim()].filter(Boolean).join(" · ");
}

/**
 * Close (wireframe 20): who carries the freight, and handing the result to
 * rateware. Only carriers that actually quoted can be awarded — the backend
 * refuses an invitation with no `bid_rate`, so the action is never offered on
 * one. Every lane ends decided: with a primary, or declared void ("desierto")
 * when nobody should carry it — rateware refuses to close otherwise
 * (2026-09-29). Telling the carriers lives on its own page (wireframe 29).
 */
export function CloseStage({
  eventId,
  lanes,
  confirmations,
  onChanged,
}: {
  eventId: string;
  lanes: LaneWithInvitations[];
  /** The carriers' answers to the rubros (wireframe 21). */
  confirmations: ConfirmationRow[];
  onChanged: () => void;
}) {
  useLang();
  const [offerDetail, setOfferDetail] = useState<OfferSelection | null>(null);
  const [comparisonLaneId, setComparisonLaneId] = useState<string | null>(null);
  const comparisonLane = lanes.find(lane => lane.id === comparisonLaneId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closeoutId, setCloseoutId] = useState(() => newOperationId());
  // Awarding, declaring a lane void and the hand-off to rateware are an Administrador's decisions.
  const { can } = useAuth();
  const decides = can("admin");
  const adminOnly = decides ? undefined : NEED_REASON.admin;

  /** Lanes with their quoted offers, best rate first. */
  const priced = useMemo(
    () =>
      lanes.map((lane) => {
        const offers = (lane.invitations ?? [])
          .filter((i) => i.bid_rate != null && String(i.invitation_status ?? "").toLowerCase() !== "archived")
          .sort((a, b) => rateOf(a) - rateOf(b));
        const primary = offers.find((o) => roleOf(o) === "primary");
        const backup = offers.some((o) => roleOf(o) === "backup");
        const state: LaneState = primary ? "covered" : isVoidLane(lane) ? "void" : offers.length ? "open" : "none";
        return { lane, offers, primary, backup, state };
      }),
    [getLang(), lanes],
  );

  const covered = priced.filter((p) => p.state === "covered").length;
  const voided = priced.filter((p) => p.state === "void");
  const withBackup = priced.filter((p) => p.backup).length;
  const pending = priced.filter((p) => p.state === "open" || p.state === "none");
  const noOffers = priced.filter((p) => p.state === "none").length;
  const anyOffers = priced.some((p) => p.offers.length > 0);
  // What the panel declares void at once. A lane with a backup keeps it until
  // someone removes it: the backend refuses to void a lane with an award.
  const voidable = pending.filter((p) => !p.backup);
  const backupOnly = pending.length - voidable.length;
  const awarded = priced.flatMap((p) => p.offers.filter((o) => roleOf(o)));
  const expiredAwards = awarded.filter(expired).length;
  // The rubros each awarded carrier confirmed in its Bid Room (wireframe 21).
  // A refused rubro ("No puedo") blocks the hand-off: rateware would carry a
  // term the carrier said it can't meet. Unanswered rubros only warn: many
  // carriers quote without opening the checklist, and the offer still stands.
  const termsOfOffer = (o: Offer, lane: LaneWithInvitations) =>
    termsOf(confirmations, String(o.id ?? ""), String(o.vendor_id ?? ""), laneSegmentKey(lane));
  const awardedTerms = priced.flatMap((p) => p.offers.filter((o) => roleOf(o)).map((o) => termsOfOffer(o, p.lane)));
  const refusedAwards = awardedTerms.filter((t) => t.refused > 0).length;
  const unconfirmedAwards = awardedTerms.filter((t) => t.refused === 0 && t.answered < t.total).length;
  const exceptionAwards = awardedTerms.filter((t) => t.refused === 0 && t.answered === t.total && t.exceptions > 0).length;
  const blockedAwards = awarded.filter(
    (o) => String(((o.vendors ?? {}) as Offer).status ?? "").toLowerCase() === "blocked",
  ).length;
  // These are executable guards, not just the red checklist shown below.
  const canCloseout = priced.length > 0 && pending.length === 0 && anyOffers
    && refusedAwards === 0 && expiredAwards === 0 && blockedAwards === 0;

  /** Saving against the target, weighted by weekly volume, over awarded lanes with a target. */
  const savings = useMemo(() => {
    let target = 0;
    let paid = 0;
    for (const p of priced) {
      const goal = Number(p.lane.target_rate);
      if (!p.primary || !Number.isFinite(goal) || goal <= 0) continue;
      const weight = Number(p.lane.weekly_volume) > 0 ? Number(p.lane.weekly_volume) : 1;
      target += goal * weight;
      paid += rateOf(p.primary) * weight;
    }
    return target > 0 ? (1 - paid / target) * 100 : null;
  }, [getLang(), priced]);

  /** Runs a write; `fn` may return the message to show instead of `ok`. */
  async function run(key: string, fn: () => Promise<string | void>, ok: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const message = await fn();
      setNotice(message || ok);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function award(offer: Offer, role: AwardRole) {
    const id = String(offer.id);
    // One id per attempt, reused if the call is retried.
    const operationId = newOperationId();
    run(
      id + role,
      async () => {
        const res = await awardLaneVendor({ invitationId: id, role, operationId });
        if (res.idempotent) return tr("text117");
      },
      tr("text118", domainLabel(ROLE_LABEL[role] ?? role).toLowerCase()),
    );
  }

  async function declareVoid(targets: typeof priced) {
    if (!targets.length) return;
    const one = targets.length === 1;
    const list = targets
      .map((p) => `· ${routeOf(p.lane)} — ${p.offers.length ? tr("text119", p.offers.length) : tr("text120")}`)
      .join("\n");
    const reason = await promptAsync(
      tr("text121", one ? tr("text122") : tr("text123", targets.length), list) +
        tr("text124", one ? tr("text125") : tr("text126")) +
        tr("text127") +
        tr("text128"),
    );
    if (reason === null) return;
    run(
      one ? `void-${targets[0].lane.id}` : "void-all",
      async () => {
        const res = await setLaneNoAward({
          eventId,
          laneIds: targets.map((p) => String(p.lane.id)),
          noAward: true,
          reason,
        });
        if (!res.updated) return one ? tr("text129") : tr("text130");
        return res.updated === 1 ? tr("text131") : tr("text132", res.updated);
      },
      tr("text131"),
    );
  }

  function reopen(lane: LaneWithInvitations) {
    run(
      `reopen-${lane.id}`,
      async () => {
        await setLaneNoAward({ eventId, laneIds: [String(lane.id)], noAward: false });
      },
      tr("text133"),
    );
  }

  async function closeout() {
    if (!decides || !canCloseout || busy === "closeout") return;
    if (
      !await confirmAsync(
        tr("text134", covered) +
          (voided.length
            ? tr("text135", voided.length === 1 ? tr("text136") : tr("text137", voided.length)) +
              voided.map((p) => `· ${routeOf(p.lane)}`).join("\n") +
              "\n\n"
            : "") +
          tr("text138") +
          tr("text139"),
      )
    )
      return;
    run(
      "closeout",
      async () => {
        const res = await closeoutToRateware(eventId, closeoutId);
        setCloseoutId(newOperationId());
        return (
          tr("text140", res.queued_for_review ?? 0) +
          `${res.inserted != null ? tr("text141", res.inserted) : ""}` +
          `${res.linked != null ? tr("text142", res.linked) : ""}.`
        );
      },
      tr("text143"),
    );
  }

  const decided = covered + voided.length;
  const checks: { ok: boolean; text: string }[] = [
    {
      ok: priced.length > 0 && pending.length === 0,
      text: voided.length
        ? tr("text144", decided, priced.length, covered, voided.length, voided.length === 1 ? "" : "s")
        : tr("text145", covered, priced.length),
    },
    noOffers
      ? { ok: false, text: tr("text146", noOffers, noOffers === 1 ? "" : "s", noOffers === 1 ? tr("text147") : tr("text148")) }
      : { ok: true, text: tr("text149") },
    expiredAwards
      ? { ok: false, text: tr("text150", expiredAwards, expiredAwards === 1 ? "" : "es") }
      : { ok: true, text: tr("text151") },
    blockedAwards
      ? { ok: false, text: tr("text152", blockedAwards, blockedAwards === 1 ? "" : "s", blockedAwards === 1 ? "" : "s", blockedAwards === 1 ? "" : "n", blockedAwards === 1 ? "" : "s") }
      : { ok: true, text: tr("text153") },
    refusedAwards
      ? { ok: false, text: tr("text154", refusedAwards, refusedAwards === 1 ? "" : "s", refusedAwards === 1 ? "o" : "eron") }
      : unconfirmedAwards
        ? { ok: false, text: tr("text155", unconfirmedAwards, unconfirmedAwards === 1 ? "" : "s") }
        : {
            ok: true,
            text: awarded.length
              ? tr("text156", exceptionAwards ? tr("text157", exceptionAwards) : "")
              : tr("text158"),
          },
  ];

  return (
    <div className="close-wrap">
      {offerDetail && <OfferDetailDialog selection={offerDetail} confirmations={confirmations} onClose={() => setOfferDetail(null)} />}
      {comparisonLane && <OfferComparisonDialog lane={comparisonLane} confirmations={confirmations} onClose={() => setComparisonLaneId(null)} />}
      <div className="close-band">
        {[
          { label: "Lanes", value: String(priced.length) },
          { label: tr("text159"), value: String(covered), accent: true },
          { label: tr("text160"), value: String(withBackup) },
          { label: tr("text161"), value: String(voided.length) },
          { label: tr("text162"), value: String(pending.length) },
          { label: tr("text163"), value: savings == null ? "—" : `${savings.toFixed(1)}%` },
        ].map((k) => (
          <div key={k.label}>
            <span>{k.label}</span>
            <strong className={k.accent ? "accent" : undefined}>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="close-grid">
        <div className="close-col">
          {error && <ErrorBanner message={error} />}
          {notice && <InfoBanner>{notice}</InfoBanner>}
          {!decides && (
            <InfoBanner title={tr("text164")}>
              {tr("text165")}</InfoBanner>
          )}

          {priced.map(({ lane, offers, backup, state }) => {
            const facts = [
              (lane.equipment as string) || null,
              Number(lane.weekly_volume) > 0 ? tr("text166", lane.weekly_volume) : null,
              Number(lane.target_rate) > 0 ? tr("text167", money(lane.target_rate, String(lane.currency ?? "USD"))) : null,
            ].filter(Boolean);
            const laneId = String(lane.id);
            return (
              <section key={laneId} className={`close-lane ${state}`}>
                <header>
                  <div>
                    <b>{routeOf(lane)}</b>
                    <span>{facts.length ? facts.join(" · ") : tr("text168", offers.length)}</span>
                    {comparisonOffers(lane).length > 0 && <button onClick={() => setComparisonLaneId(String(lane.id))}>{offerText("compare")}</button>}
                  </div>
                  {state === "void" ? (
                    <button
                      className="link close-lane-act"
                      disabled={!decides || busy === `reopen-${laneId}`}
                      title={adminOnly ?? tr("text169")}
                      onClick={() => reopen(lane)}
                    >
                      {tr("text170")}</button>
                  ) : state !== "covered" ? (
                    <button
                      className="link close-lane-act"
                      disabled={!decides || backup || busy === `void-${laneId}`}
                      title={adminOnly ?? (backup ? tr("text171") : tr("text172"))}
                      onClick={() => declareVoid(priced.filter((p) => p.lane.id === lane.id))}
                    >
                      {tr("text173")}</button>
                  ) : null}
                  {state === "covered" ? (
                    <Pill tone="green">{tr("text174")}</Pill>
                  ) : state === "void" ? (
                    <Pill>{tr("text004")}</Pill>
                  ) : state === "open" ? (
                    <Pill tone="red">{tr("text175")}</Pill>
                  ) : (
                    <Pill>{tr("text176")}</Pill>
                  )}
                </header>

                {state === "void" && (
                  <p className="close-void-note">
                    {tr("text177")}{voidNote(lane) ? ` — ${voidNote(lane)}` : ""}.
                  </p>
                )}

                {offers.length ? (
                  offers.map((o, i) => {
                    const v = (o.vendors ?? {}) as Offer;
                    const role = roleOf(o);
                    const id = String(o.id);
                    const late = expired(o);
                    const until = day(o.valid_through);
                    const voidTitle = state === "void" ? tr("text178") : adminOnly;
                    return (
                      <div key={id} className="close-offer">
                        <span className="mono close-rank">{i + 1}</span>
                        <div className="close-who">
                          <b>{String(v.vendor_name ?? o.vendor_id ?? "—")}</b>
                          <span className={late ? "late" : undefined}>
                            {until ? (late ? tr("text179", until) : tr("text180", until)) : tr("text181")}
                            {(() => {
                              const terms = termsOfOffer(o, lane);
                              const tone = termsTone(terms);
                              return (
                                <em
                                  className={`close-terms${tone ? ` ${tone}` : ""}`}
                                  title={terms.notes.join("\n") || (terms.answered ? tr("text182") : tr("text183"))}
                                >
                                  {" · "}
                                  {terms.answered ? termsLabel(terms) : tr("text184")}
                                </em>
                              );
                            })()}
                          </span>
                        </div>
                        <button onClick={() => setOfferDetail({ lane, invitation: o })}>{offerText("view")}</button>
                        <span className="mono close-rate">{money(o.bid_rate, String(o.currency ?? "USD"))}</span>
                        {role ? (
                          <>
                            <Pill tone={role === "primary" ? "indigo" : ""}>
                              {domainLabel(ROLE_LABEL[role] ?? role)?.toUpperCase() ?? role.toUpperCase()}
                            </Pill>
                            <button
                              className="link close-undo"
                              disabled={!decides || busy === id + "clear"}
                              title={adminOnly}
                              onClick={() => run(id + "clear", () => clearAward(id).then(() => undefined), tr("text185"))}
                            >
                              {tr("text186")}</button>
                          </>
                        ) : (
                          <>
                            <button
                              disabled={!decides || state === "void" || busy === id + "primary"}
                              title={voidTitle}
                              onClick={() => award(o, "primary")}
                            >
                              {tr("text187")}</button>
                            <button
                              disabled={!decides || state === "void" || busy === id + "backup"}
                              title={voidTitle}
                              onClick={() => award(o, "backup")}
                            >
                              {tr("text188")}</button>
                          </>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="close-empty">
                    {state === "void"
                      ? tr("text189")
                      : tr("text190")}
                  </p>
                )}
              </section>
            );
          })}

          {!priced.length && <Empty title={tr("text191")} hint={tr("text192")} />}
        </div>

        <aside className="crm-side close-side">
          <p className="crm-kicker">{tr("text193")}</p>
          <ul className="close-checks">
            {checks.map((c) => (
              <li key={c.text} className={c.ok ? "ok" : "bad"}>
                <b>{c.ok ? "✓" : "✕"}</b>
                {c.text}
              </li>
            ))}
          </ul>
          <button
            className={canCloseout && decides ? "primary" : "close-blocked"}
            disabled={!decides || !canCloseout || busy === "closeout"}
            title={adminOnly}
            onClick={closeout}
          >
            {busy === "closeout"
              ? tr("text194")
              : canCloseout
                ? tr("text195")
                : tr("text196")}
          </button>
          <p className="close-why">
            {canCloseout
              ? tr("text197", voided.length ? tr("text198", voided.length === 1 ? tr("text199") : tr("text200", voided.length)) : "")
              : !priced.length
                ? tr("text201")
                : pending.length
                  ? tr("text202", pending.length === 1 ? tr("text203") : tr("text204", pending.length))
                  : expiredAwards
                    ? tr("closeoutExpired")
                    : blockedAwards
                      ? tr("closeoutBlocked")
                  : refusedAwards
                    ? tr("text205", refusedAwards === 1 ? tr("text206") : tr("text207", refusedAwards))
                    : tr("text208")}
          </p>
          {voidable.length > 0 && (
            <button
              className="close-void-all"
              disabled={!decides || busy === "void-all"}
              title={adminOnly}
              onClick={() => declareVoid(voidable)}
            >
              {busy === "void-all"
                ? tr("text209")
                : voidable.length === 1
                  ? tr("text210")
                  : tr("text211", voidable.length)}
            </button>
          )}
          {backupOnly > 0 && (
            <p className="close-why">
              {backupOnly === 1 ? tr("text212") : tr("text213", backupOnly)} {tr("text214")}</p>
          )}
          <Link to={`/rfx/${eventId}/notices`} className="btn close-notices">
            {tr("text215")}</Link>
        </aside>
      </div>
    </div>
  );
}
