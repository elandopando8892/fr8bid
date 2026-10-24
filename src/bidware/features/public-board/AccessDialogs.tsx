import { words, tr } from "@/i18n/public-board";
import { useLang } from "@/i18n/language";
import { useState } from "react";
import { Dialog, ErrorBanner, InfoBanner } from "@/components/ui";
import { confirmAsync } from "@/components/confirm";
import { findInvitations, requestInvite, type BoardEvent, type InvitationLookup } from "./publicBoard.service";

/** What the carrier typed last time, so a second request is one click. Per browser only. */
const PROFILE_KEY = "bidware.board.profile";
/** The email checked in "Buscar mis invitaciones" and the lanes it is invited to. */
export const ACCESS_KEY = "bidware.board.access";

export interface Access {
  email: string;
  laneIds: string[];
  eventIds: string[];
}

export function readAccess(): Access | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACCESS_KEY) || "null");
    return value && typeof value.email === "string" ? value : null;
  } catch {
    return null;
  }
}

function saveAccess(access: Access | null) {
  try {
    if (access) localStorage.setItem(ACCESS_KEY, JSON.stringify(access));
    else localStorage.removeItem(ACCESS_KEY);
  } catch {
    /* private window: the lookup just isn't remembered */
  }
}

interface Profile {
  company: string;
  contact_name: string;
  email: string;
  phone: string;
}

function readProfile(): Profile {
  try {
    return { company: "", contact_name: "", email: "", phone: "", ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") };
  } catch {
    return { company: "", contact_name: "", email: "", phone: "" };
  }
}

const route = (lane: BoardEvent["lanes"][number]) => `${lane.lane?.origin ?? "—"} → ${lane.lane?.destination ?? "—"}`;

/**
 * "Solicitar acceso": one request per lane the carrier covers, which is how
 * the server takes them (and how procurement reviews them). Only live lanes.
 */
export function RequestAccessDialog({
  event,
  laneId,
  onClose,
  onFind,
}: {
  event: BoardEvent;
  /** Preselects one lane (from the spreadsheet); otherwise all live lanes. */
  laneId?: string;
  onClose: () => void;
  onFind: () => void;
}) {
  useLang();
  const live = event.lanes.filter((l) => l.is_bid_available);
  const [profile, setProfile] = useState<Profile>(readProfile);
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(laneId ? [laneId] : live.map((l) => l.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));
  const valid = profile.company.trim() && /\S+@\S+\.\S+/.test(profile.email.trim()) && picked.size > 0;

  async function send() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      /* not remembered, still sent */
    }
    let sent = 0;
    let repeated = 0;
    try {
      for (const lane of live.filter((l) => picked.has(l.id))) {
        const res = await requestInvite({
          event_id: event.id,
          lane_id: lane.id,
          company: profile.company.trim(),
          contact_name: profile.contact_name.trim(),
          email: profile.email.trim(),
          phone: profile.phone.trim(),
          notes: notes.trim(),
        });
        if (res.duplicate) repeated += 1;
        else if (res.requested) sent += 1;
      }
      setDone(
        [
          sent ? tr("text001", sent, sent === 1 ? "" : "s") : "",
          repeated ? tr("text002", repeated, repeated === 1 ? "" : "n", repeated === 1 ? "" : "s") : "",
          tr("text003"),
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (e) {
      setError(
        `${(e as Error).message}${sent ? tr("text004", sent) : ""}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={tr("text005", event.name)}
      onClose={onClose}
      footer={
        done ? (
          <button type="button" className="primary" onClick={onClose}>
            {tr("text006")}</button>
        ) : (
          <>
            <button type="button" className="link" onClick={onFind}>
              {tr("text007")}</button>
            <div className="spacer" />
            <button type="button" className="primary" disabled={!valid || busy} onClick={send}>
              {busy ? tr("text008") : tr("text009", picked.size, picked.size === 1 ? "" : "s")}
            </button>
          </>
        )
      }
    >
      {error && <ErrorBanner message={error} />}
      {done ? (
        <InfoBanner title={tr("text010")}>{done}</InfoBanner>
      ) : (
        <div className="pb-form">
          <div className="pb-fields">
            <label>
              <span>{tr("text011")}</span>
              <input value={profile.company} onChange={(e) => set({ company: e.target.value })} />
            </label>
            <label>
              <span>{tr("text012")}</span>
              <input value={profile.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
            </label>
          </div>
          <div className="pb-fields">
            <label>
              <span>{tr("text013")}</span>
              <input type="email" value={profile.email} onChange={(e) => set({ email: e.target.value })} />
            </label>
            <label>
              <span>{tr("text014")}</span>
              <input value={profile.phone} onChange={(e) => set({ phone: e.target.value })} />
            </label>
          </div>
          <div className="pb-lanes">
            <span>{tr("text015")}</span>
            {live.map((lane) => (
              <label key={lane.id} className="pb-lane">
                <input
                  type="checkbox"
                  checked={picked.has(lane.id)}
                  onChange={(e) =>
                    setPicked((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(lane.id);
                      else next.delete(lane.id);
                      return next;
                    })
                  }
                />
                <span className="grow">{route(lane)}</span>
                <span className="mono">{[lane.lane?.equipment, lane.lane?.trailer].filter(Boolean).join(" ")}</span>
              </label>
            ))}
          </div>
          <label>
            <span>{tr("text016")}</span>
            <textarea rows={2} value={notes} placeholder={tr("text017")} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
      )}
    </Dialog>
  );
}

/**
 * "Buscar mis invitaciones": checks an email against MARKSMAN's carriers and
 * marks on the board the lanes it is invited to. Sending the private links is
 * a separate, confirmed step: that one emails the carrier.
 */
export function FindInvitationsDialog({
  onClose,
  onFound,
}: {
  onClose: () => void;
  onFound: (access: Access | null) => void;
}) {
  useLang();
  const stored = readAccess();
  const [email, setEmail] = useState(stored?.email ?? readProfile().email);
  const [result, setResult] = useState<InvitationLookup | null>(null);
  const [sent, setSent] = useState<InvitationLookup | null>(null);
  const [busy, setBusy] = useState<"find" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = /\S+@\S+\.\S+/.test(email.trim());

  async function find() {
    if (!valid) return;
    setBusy("find");
    setError(null);
    setSent(null);
    try {
      const res = await findInvitations(email.trim());
      setResult(res);
      // A shared computer must not keep someone else's lookup.
      const access = res.matched
        ? { email: email.trim().toLowerCase(), laneIds: res.matched_lane_ids ?? [], eventIds: res.matched_event_ids ?? [] }
        : null;
      saveAccess(access);
      onFound(access);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendLinks() {
    const ok = await confirmAsync(tr("text018", email.trim()), { ok: tr("text019") });
    if (!ok) return;
    setBusy("send");
    setError(null);
    try {
      setSent(await findInvitations(email.trim(), true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      title={tr("text020")}
      onClose={onClose}
      footer={
        <>
          {stored && (
            <button
              type="button"
              className="link"
              onClick={() => {
                saveAccess(null);
                onFound(null);
                setResult(null);
                setEmail("");
              }}
            >
              {tr("text021")}</button>
          )}
          <div className="spacer" />
          {result?.matched ? (
            <button type="button" className="primary" disabled={busy !== null || Boolean(sent?.sent)} onClick={sendLinks}>
              {busy === "send" ? tr("text008") : sent?.sent ? tr("text022") : tr("text023")}
            </button>
          ) : (
            <button type="button" className="primary" disabled={!valid || busy !== null} onClick={find}>
              {busy === "find" ? tr("text024") : tr("text025")}
            </button>
          )}
        </>
      }
    >
      {error && <ErrorBanner message={error} />}
      <p className="pb-help">
        {tr("text026")}</p>
      <div className="pb-find">
        <input
          type="email"
          value={email}
          placeholder={words("word0")}
          onChange={(e) => {
            setEmail(e.target.value);
            setResult(null);
            setSent(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") find();
          }}
        />
        {result && !result.matched && (
          <button type="button" disabled={!valid || busy !== null} onClick={find}>
            {tr("text027")}</button>
        )}
      </div>
      {result && (
        <InfoBanner
          title={
            result.matched
              ? `${result.matched} ${result.matched === 1 ? tr("text028") : words("word1")}.`
              : tr("text029")
          }
        >
          {result.matched
            ? tr("text030")
            : tr("text031")}
        </InfoBanner>
      )}
      {sent && (
        <InfoBanner title={sent.sent ? tr("text032") : tr("text033")}>
          {sent.sent ? tr("text034", email.trim()) : sent.error || sent.message || tr("text035")}
        </InfoBanner>
      )}
    </Dialog>
  );
}
