import { words, tr } from "@/i18n/outreach";
import { useLang, locale } from "@/i18n/language";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { ErrorBanner, InfoBanner, Pill, Spinner } from "@/components/ui";
import { fetchRfxDetail } from "@/features/rfx-admin/rfx.service";
import { listVendorsByIds } from "@/features/carrier-fit/carrierFit.service";
import { updateVendorContact, type ContactPatch } from "@/features/carrier-crm/contact.service";
import { listContactReviews, recordContactReview, type CarrierReview, type ContactSnapshot } from "./review.service";
import { LaunchHeader, LaunchTabs, audienceOf } from "./LaunchShell";
import type { Vendor } from "@/types/domain";

type State = "pending" | "changed" | "reviewed" | "no_contact" | "revoked";
/** Lo que falta por revisar: nuevos, revocados y los que cambiaron de contacto. */
const TO_REVIEW: State[] = ["pending", "changed", "revoked"];

type Filter = "to_review" | "reviewed" | "no_contact" | "all";
const FILTERS = (): [Filter, string][] => [
  ["to_review", tr("text274")],
  ["reviewed", tr("text002")],
  ["no_contact", tr("text003")],
  ["all", tr("text005")],
];
const inFilter = (state: State, filter: Filter) =>
  filter === "all" || (filter === "to_review" ? TO_REVIEW.includes(state) : state === filter);

const STATE_PILL: Record<State, ["amber" | "green" | "red" | "", string]> = {
  get pending(): ["amber" | "green" | "red" | "", string] { return ["amber", tr("text006")]; },
  get changed(): ["amber" | "green" | "red" | "", string] { return ["amber", tr("text275")]; },
  get reviewed(): ["amber" | "green" | "red" | "", string] { return ["green", tr("text007")]; },
  get no_contact(): ["amber" | "green" | "red" | "", string] { return ["red", tr("text008")]; },
  get revoked(): ["amber" | "green" | "red" | "", string] { return ["", tr("text009")]; },
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "EMAIL",
  whatsapp: "WHATSAPP",
  get whatsapp_group() { return tr("text010"); },
};

const PAGE = 40;

const clean = (v: unknown) => String(v ?? "").trim();

function when(v: unknown): string {
  const d = v ? new Date(String(v)) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale(), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** What the review keeps a photo of: the contact as it is right now. */
function snapshotOf(v: Vendor, name: string): ContactSnapshot {
  return {
    vendor_name: clean(v.vendor_name) || name || null,
    vendor_domain: clean(v.domain) || null,
    contact_name: clean(v.contact_name) || null,
    email: clean(v.primary_email).toLowerCase() || null,
    phone: clean(v.whatsapp_phone) || null,
  };
}

/** The channel the invitation would use: the preferred one when it's reachable. */
function channelOf(v: Vendor): string | null {
  const preferred = clean(v.preferred_channel).toLowerCase();
  const email = clean(v.primary_email);
  const phone = clean(v.whatsapp_phone);
  if (preferred === "whatsapp" && phone) return "whatsapp";
  if (preferred === "whatsapp_group") return "whatsapp_group";
  if (email) return "email";
  if (phone) return "whatsapp";
  return null;
}

/** What changed since the review — the reason the snapshot exists. */
function drift(snap: ContactSnapshot | undefined, now: ContactSnapshot): string[] {
  if (!snap) return [];
  const out: string[] = [];
  if ((snap.email ?? null) !== (now.email ?? null)) out.push(tr("text011", snap.email || "—"));
  if ((snap.phone ?? null) !== (now.phone ?? null)) out.push(tr("text012", snap.phone || "—"));
  if ((snap.contact_name ?? null) !== (now.contact_name ?? null)) out.push(tr("text013", snap.contact_name || "—"));
  return out;
}

interface Row {
  id: string;
  v: Vendor;
  snap: ContactSnapshot;
  review?: CarrierReview;
  state: State;
  channel: string | null;
}

/**
 * Contact review (wireframe 25): before an invitation goes out, someone
 * confirms the contact is the right one. Each review keeps a snapshot of what
 * was checked and can be revoked. Only reviewed carriers get invited, and a
 * contact that changed after its review goes back to be reviewed.
 */
export function ContactReviewPage() {
  useLang();
  const { id = "" } = useParams();
  const { can } = useAuth();
  const canWork = can("operate");
  const locked = canWork ? undefined : NEED_REASON.operate;

  const detail = useAsync(() => fetchRfxDetail(id), [id]);
  const audience = useMemo(() => audienceOf(detail.data?.lanes), [detail.data]);
  const audienceKey = audience.map((a) => a.id).join(",");
  const [vendorVersion, setVendorVersion] = useState(0);
  const vendors = useAsync(
    () => listVendorsByIds(audience.map((a) => a.id)),
    [audienceKey, vendorVersion],
  );
  const reviews = useAsync(() => listContactReviews(id), [id]);

  const [latest, setLatest] = useState<Map<string, CarrierReview>>(new Map());
  const [filter, setFilter] = useState<Filter>("to_review");
  const [shown, setShown] = useState(PAGE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const reviewById = useMemo(() => {
    const map = new Map((reviews.data ?? []).map((r) => [r.vendor_id, r]));
    for (const [key, value] of latest) map.set(key, value);
    return map;
  }, [reviews.data, latest]);

  const byId = useMemo(() => new Map((vendors.data ?? []).map((v) => [v.id, v])), [vendors.data]);

  const rows: Row[] = useMemo(
    () =>
      audience
        .map((a) => {
          const v = byId.get(a.id) ?? ({ id: a.id, vendor_name: a.name } as Vendor);
          const snap = snapshotOf(v, a.name);
          const review = reviewById.get(a.id);
          const state: State =
            !snap.email && !snap.phone
              ? "no_contact"
              : review?.reviewed
                ? drift(review.contact_snapshot, snap).length
                  ? "changed"
                  : "reviewed"
                : review
                  ? "revoked"
                  : "pending";
          return { id: a.id, v, snap, review, state, channel: channelOf(v) };
        })
        .sort((x, y) => (x.snap.vendor_name ?? "").localeCompare(y.snap.vendor_name ?? "")),
    [audience, byId, reviewById],
  );

  const counts = useMemo(() => {
    const map = new Map<Filter, number>();
    for (const [key] of FILTERS()) map.set(key, rows.filter((r) => inFilter(r.state, key)).length);
    return map;
  }, [rows]);
  const visible = rows.filter((r) => inFilter(r.state, filter));

  async function review(row: Row, reviewed: boolean) {
    setBusyId(row.id);
    setNotice(null);
    setFailure(null);
    try {
      const res = await recordContactReview({
        eventId: id,
        vendorId: row.id,
        reviewed,
        channel: row.channel,
        snapshot: row.snap,
      });
      if (res) setLatest((prev) => new Map(prev).set(row.id, res));
      setNotice(
        reviewed
          ? tr("text014", row.snap.vendor_name)
          : tr("text015", row.snap.vendor_name),
      );
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function saveContact(row: Row, patch: ContactPatch) {
    if (!Object.keys(patch).length) {
      setEditing(null);
      return;
    }
    setBusyId(row.id);
    setNotice(null);
    setFailure(null);
    try {
      await updateVendorContact(row.id, patch);
      setNotice(tr("text016", row.snap.vendor_name));
      setEditing(null);
      setVendorVersion((n) => n + 1);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const event = detail.data?.event;
  const loading = detail.loading || vendors.loading || reviews.loading;
  const pending = counts.get("to_review") ?? 0;

  return (
    <>
      <LaunchHeader
        eventId={id}
        event={event}
        title={tr("text017")}
        info={tr("text018", rows.length, rows.length === 1 ? "" : "s")}
      />
      <main className="main launch-main">
        <LaunchTabs eventId={id} active="review" />
        <p className="rev-intro">{tr("text276")}</p>

        {!canWork && (
          <InfoBanner title={tr("text022")}>{tr("text023")}</InfoBanner>
        )}
        {notice && <InfoBanner>{notice}</InfoBanner>}
        {failure && <ErrorBanner message={failure} />}
        {detail.error && <ErrorBanner message={detail.error} />}
        {vendors.error && <ErrorBanner message={vendors.error} />}
        {reviews.error && <ErrorBanner message={reviews.error} />}

        <div className="rev-col">
          <div className="tpl-filters">
            {FILTERS().map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? "on" : undefined}
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setShown(PAGE);
                }}
              >
                {label}
                <b>{loading ? "…" : (counts.get(key) ?? 0).toLocaleString(locale())}</b>
              </button>
            ))}
          </div>

          {loading ? (
            <Spinner label={tr("text025")} />
          ) : visible.length ? (
            <>
              {visible.slice(0, shown).map((row) => (
                <ReviewCard
                  key={row.id}
                  row={row}
                  busy={busyId === row.id}
                  editing={editing === row.id}
                  locked={locked}
                  onEdit={() => setEditing(row.id)}
                  onCancel={() => setEditing(null)}
                  onSave={(patch) => saveContact(row, patch)}
                  onReview={(reviewed) => review(row, reviewed)}
                />
              ))}
              {visible.length > shown && (
                <button className="rev-more" onClick={() => setShown((n) => n + PAGE)}>
                  {tr("text026")}{Math.min(PAGE, visible.length - shown)}{tr("text027")}{visible.length - shown}
                </button>
              )}
            </>
          ) : rows.length && filter === "to_review" && !pending ? (
            <div className="rev-done">
              <b>{tr("text277", counts.get("reviewed") ?? 0)}</b>
              <span>
                <Link to={`/eventos/${id}`}>{tr("text278")}</Link>
                {" · "}
                <Link to={`/rfx/${id}/message`}>{tr("text279")}</Link>
              </span>
            </div>
          ) : (
            <p className="rev-empty">{rows.length ? tr("text028") : tr("text029")}</p>
          )}
        </div>
      </main>
    </>
  );
}

function ReviewCard({
  row,
  busy,
  editing,
  locked,
  onEdit,
  onCancel,
  onSave,
  onReview,
}: {
  row: Row;
  busy: boolean;
  editing: boolean;
  locked?: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: ContactPatch) => void;
  onReview: (reviewed: boolean) => void;
}) {
  useLang();
  const { snap, review, state } = row;
  const [tone, label] = STATE_PILL[state];
  const changed = state === "changed" ? drift(review?.contact_snapshot, snap) : [];

  return (
    <article className={`rev-card ${state}`}>
      <header>
        <div>
          <b>{snap.vendor_name || tr("text036")}</b>
          <span className="mono">{snap.vendor_domain || tr("text037")}</span>
        </div>
        <Pill tone={tone}>{label}</Pill>
      </header>

      {editing ? (
        <ContactEditor snap={snap} busy={busy} onCancel={onCancel} onSave={onSave} />
      ) : (
        <div className="rev-fields">
          <div>
            <span>{tr("text038")}</span>
            <p className={snap.contact_name ? undefined : "none"}>{snap.contact_name || words("word0")}</p>
          </div>
          <div>
            <span>{tr("text039")}</span>
            <p className={`mono${snap.email ? "" : " none"}`}>{snap.email || words("word1")}</p>
          </div>
          <div>
            <span>{tr("text040")}</span>
            <p className={`mono${snap.phone ? "" : " none"}`}>{snap.phone || tr("text041")}</p>
          </div>
          <div>
            <span>{tr("text042")}</span>
            <p className="mono">{row.channel ? CHANNEL_LABEL[row.channel] ?? row.channel.toUpperCase() : "—"}</p>
          </div>
        </div>
      )}

      {!editing && (
        <footer>
          {state === "reviewed" ? (
            <>
              <span className="mono rev-by">
                {tr("text043")}{review?.reviewed_by || "—"} · {when(review?.reviewed_at)}
              </span>
              <button disabled={busy || Boolean(locked)} title={locked} onClick={() => onReview(false)}>
                {tr("text045")}</button>
            </>
          ) : state === "no_contact" ? (
            <>
              <span className="rev-bad">{tr("text046")}</span>
              <button disabled={busy || Boolean(locked)} title={locked} onClick={onEdit}>
                {tr("text047")}</button>
            </>
          ) : (
            <>
              <span>
                {state === "revoked" && (
                  <span className="mono rev-by">
                    {tr("text048")}{review?.reviewed_by || "—"} · {when(review?.reviewed_at)} ·{" "}
                  </span>
                )}
                {state === "changed" && (
                  <span className="mono rev-by">
                    {tr("text043")}{review?.reviewed_by || "—"} · {when(review?.reviewed_at)}
                    <em>{tr("text044")}{changed.join(", ")})</em>{" "}
                  </span>
                )}
</span>
              <button disabled={busy || Boolean(locked)} title={locked} onClick={onEdit}>
                {tr("text050")}</button>
              <button className="primary" disabled={busy || Boolean(locked)} title={locked} onClick={() => onReview(true)}>
                {busy ? tr("text051") : tr("text052")}
              </button>
            </>
          )}
        </footer>
      )}
    </article>
  );
}

/** Edits the three contact fields in place; only what changed is sent. */
function ContactEditor({
  snap,
  busy,
  onCancel,
  onSave,
}: {
  snap: ContactSnapshot;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: ContactPatch) => void;
}) {
  useLang();
  const [name, setName] = useState(snap.contact_name ?? "");
  const [email, setEmail] = useState(snap.email ?? "");
  const [phone, setPhone] = useState(snap.phone ?? "");

  function submit() {
    const patch: ContactPatch = {};
    if (name.trim() !== (snap.contact_name ?? "")) patch.contact_name = name.trim();
    if (email.trim().toLowerCase() !== (snap.email ?? "")) patch.primary_email = email.trim().toLowerCase();
    if (phone.trim() !== (snap.phone ?? "")) patch.whatsapp_phone = phone.trim();
    onSave(patch);
  }

  return (
    <div className="rev-edit">
      <label className="field">
        <span>{tr("text038")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("text053")} />
      </label>
      <label className="field">
        <span>{tr("text039")}</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr("text054")} />
      </label>
      <label className="field">
        <span>WhatsApp</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52 81 0000 0000" />
      </label>
      <div className="rev-edit-go">
        <small>{tr("text055")}</small>
        <button onClick={onCancel} disabled={busy}>
          {tr("text056")}</button>
        <button className="primary" onClick={submit} disabled={busy}>
          {busy ? tr("text051") : tr("text057")}
        </button>
      </div>
    </div>
  );
}
