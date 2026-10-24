import { tr } from "@/i18n/carrier-crm";
import { useLang, locale, getLang } from "@/i18n/language";
import { confirmAsync } from "@/components/confirm";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  previewDuplicates,
  mergeNextDuplicate,
  reasonLabel,
  priorityLabel,
  exactGroups,
  exactDomainOf,
  contactClusters,
  clusterReading,
  type DuplicateGroup,
} from "./hygiene.service";
import { fetchVendorsByIds, listAllVendors, vendorLabel, STATUS_WORD, type VendorCard } from "./crm.service";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { Spinner, ErrorBanner, InfoBanner, Pill } from "@/components/ui";
import type { Vendor } from "@/types/domain";

const fmt = (n: number) => n.toLocaleString(locale());
const CONTACTS_SHOWN = 6;

function participations(v: VendorCard | undefined): string | null {
  const n = v?.bid_metrics?.shortlisted;
  if (n == null) return null;
  return n === 1 ? tr("text141") : tr("text142", fmt(n));
}

/** "activo · tst-usa.com · 34 participaciones RFx" */
function memberLine(v: Vendor | VendorCard | undefined): string {
  if (!v) return "";
  const status = String(v.status ?? "").toLowerCase();
  return [STATUS_WORD[status] ?? status, exactDomainOf(v) || tr("text037"), participations(v as VendorCard)]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Hygiene (wireframe 26): the one destructive surface in the app, next to the
 * look-alike it must never touch. Everything here is written to make the
 * consequence legible before the click, not after.
 */
export function HygienePage() {
  useLang();
  const preview = useAsync(() => previewDuplicates(), []);
  // The whole CRM, lightweight: the carrier count, the full list of exact
  // groups (the preview only returns the next one) and the shared contacts.
  const all = useAsync(() => listAllVendors(), []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const { can } = useAuth();
  // Merging deletes the duplicate: an Administrador's call (2026-09-29).
  // Looking at the duplicates is anyone's.
  const canMerge = can("admin");
  const locked = canMerge ? undefined : NEED_REASON.admin;

  const totalGroups = preview.data?.duplicate_groups ?? 0;
  const totalToRemove = preview.data?.duplicates_to_remove ?? 0;
  /** The server clamps the preview to the next group, on purpose. */
  const group: DuplicateGroup | undefined = preview.data?.preview?.[0];
  const memberIds = group ? [group.canonical_vendor_id, ...(group.merged_vendor_ids ?? [])].filter(Boolean) as string[] : [];
  const details = useAsync(() => fetchVendorsByIds(memberIds), [memberIds.join(",")]);

  const byId = useMemo(() => {
    const map = new Map<string, Vendor>();
    for (const v of all.data?.rows ?? []) map.set(v.id, v);
    for (const v of details.data ?? []) map.set(v.id, v);
    return map;
  }, [getLang(), all.data, details.data]);

  const queue = useMemo(() => {
    const current = group ? `${group.normalized_name}|${group.normalized_domain}` : "";
    return exactGroups(all.data?.rows ?? []).filter((g) => g.key !== current);
  }, [getLang(), all.data, group]);
  const clusters = useMemo(() => contactClusters(all.data?.rows ?? []), [getLang(), all.data]);
  const clusterRecords = clusters.reduce((n, c) => n + c.members.length, 0);
  const biggest = clusters.reduce((n, c) => Math.max(n, c.members.length), 0);

  const winner = group?.canonical_vendor_id ? byId.get(group.canonical_vendor_id) : undefined;
  const losers = (group?.merged_vendor_ids ?? []).map((id) => ({ id, v: byId.get(id) }));

  function recalc() {
    preview.reload();
    all.reload();
  }

  async function merge() {
    if (!group || !totalToRemove) return;
    const name = group.canonical_vendor_name ?? (winner ? vendorLabel(winner) : tr("text143"));
    const ok = await confirmAsync(
      tr("text144", name) +
        tr("text145") +
        tr("text146") +
        tr("text147"),
      { ok: tr("text148") },
    );
    if (!ok) return;

    setBusy(true);
    setNotice(null);
    setFailure(null);
    try {
      const res = await mergeNextDuplicate(totalToRemove);
      const removed = res.duplicates_removed ?? 1;
      const left = res.remaining_duplicates ?? Math.max(0, totalToRemove - removed);
      setNotice(
        tr("text149", removed === 1 ? tr("text150") : tr("text151", removed), name) +
          (left > 0 ? tr("text152", fmt(left)) : tr("text153")),
      );
    } catch (e) {
      // The count guard fires here when someone edited the set meanwhile.
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
      recalc();
    }
  }

  const carriers = all.data?.total ?? 0;
  const contactsShown = showContacts ? clusters : clusters.slice(0, CONTACTS_SHOWN);

  return (
    <>
      <header className="identity crm-head">
        <div className="crm-head-main">
          <div className="crumb">
            <Link to="/crm">Carrier CRM</Link>
          </div>
          <h1>{tr("text060")}</h1>
          {carriers > 0 && <p className="sub">{fmt(carriers)} carriers</p>}
        </div>
        <div className="crm-head-actions">
          <button onClick={recalc} disabled={busy}>
            {tr("text156")}</button>
        </div>
      </header>

      <div className="crm-rule">
        <b>{tr("text157")}</b>
        <span>
          {tr("text158")}{" "}{tr("text244")}
          {preview.data?.priority?.length ? <> {tr("text245")}{preview.data.priority.map(priorityLabel).join(" → ")}.</> : null}
        </span>
      </div>

      <main className="crm-main hyg-main">
        <div className="crm-col">
          {preview.error && <ErrorBanner message={preview.error} />}
          {failure && <ErrorBanner message={failure} />}
          {notice && <InfoBanner>{notice}</InfoBanner>}

          <section className="hyg-card">
            <header className="hyg-head dark">
              <div>
                <h2>{tr("text159")}{preview.loading ? "…" : tr("text160", fmt(totalGroups), totalGroups === 1 ? "" : "s")}</h2>
                <p>
                  {tr("text161")}{!preview.loading &&
                    tr("text162", fmt(totalGroups + totalToRemove), fmt(totalToRemove))}
                </p>
              </div>
              <Pill tone="green">{tr("text163")}</Pill>
            </header>

            {preview.loading ? (
              <Spinner label={tr("text164")} />
            ) : group ? (
              <div className="hyg-group">
                <div className="hyg-member keep">
                  <Pill tone="green">{tr("text165")}</Pill>
                  <div>
                    <b>{winner ? vendorLabel(winner) : group.canonical_vendor_name ?? tr("text166")}</b>
                    <span>{memberLine(winner) || group.normalized_domain}</span>
                  </div>
                </div>
                {losers.map(({ id, v }) => (
                  <div className="hyg-member" key={id}>
                    <Pill>{tr("text167")}</Pill>
                    <div>
                      <span className="hyg-name">{v ? vendorLabel(v) : id}</span>
                      <span>{memberLine(v)}</span>
                    </div>
                  </div>
                ))}
                <p className="hyg-why">
                  {tr("text168")}{reasonLabel(group.selection_reason).toLowerCase()}
                  {/quotation/i.test(group.selection_reason ?? "") && group.linked_quote_evidence
                    ? `: ${fmt(group.linked_quote_evidence)}`
                    : /health/i.test(group.selection_reason ?? "") && group.health_score != null
                      ? ` (${group.health_score})`
                      : ""}
                  .{losers.length > 1 && tr("text169", losers.length)}
                </p>
              </div>
            ) : (
              !preview.error && (
                <p className="hyg-empty">
                  {tr("text170")}</p>
              )
            )}

            {showQueue && (
              <div className="hyg-queue">
                <p className="hyg-queue-note">
                  {tr("text171")}</p>
                {all.loading ? (
                  <Spinner label={tr("text172")} />
                ) : queue.length ? (
                  queue.map((g) => (
                    <div className="hyg-queue-row" key={g.key}>
                      <Pill>{tr("text173")}</Pill>
                      <div>
                        <b>{vendorLabel(g.members[0])}</b>
                        <span>
                          {g.domain} · {g.members.length} {tr("text174")}{" "}
                          {g.members
                            .map((m) => {
                              const s = String(m.status ?? "").toLowerCase();
                              return [STATUS_WORD[s] ?? s, m.base_stage].filter(Boolean).join(", ");
                            })
                            .join(" / ")}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="hyg-queue-note">{tr("text175")}</p>
                )}
              </div>
            )}

            <footer className="hyg-guard">
              <div className="hyg-guard-actions">
                {totalGroups > 0 && (
                  <button onClick={() => setShowQueue((v) => !v)}>
                    {showQueue ? tr("text179") : tr("text180", fmt(totalGroups))}
                  </button>
                )}
                <span className="spacer" />
                {group && totalToRemove > 0 && (
                <button className="primary" disabled={busy || !canMerge} title={locked} onClick={merge}>
                  {busy ? tr("text181") : tr("text182")}
                </button>
                )}
              </div>
            </footer>
          </section>

          <section className="hyg-card">
            <header className="hyg-head">
              <div>
                <h2>{tr("text183")}{all.loading ? "…" : tr("text160", fmt(clusters.length), clusters.length === 1 ? "" : "s")}</h2>
                <p>
                  {tr("text184")}{!all.loading &&
                    clusters.length > 0 &&
                    tr("text185", fmt(clusterRecords), biggest)}
                </p>
              </div>
              <Pill tone="amber">{tr("text186")}</Pill>
            </header>

            {all.error && (
              <div className="hyg-pad">
                <ErrorBanner message={all.error} />
              </div>
            )}
            {all.loading ? (
              <Spinner label={tr("text172")} />
            ) : clusters.length ? (
              contactsShown.map((c) => (
                <div className="hyg-pair" key={c.members.map((m) => m.id).join("-")}>
                  <div className="hyg-pair-members">
                    {c.members.map((m) => (
                      <div key={m.id}>
                        <b>{vendorLabel(m)}</b>
                        <span>{exactDomainOf(m) || tr("text037")}</span>
                      </div>
                    ))}
                  </div>
                  <p>
                    {clusterReading(c)}{" "}
                    <span className="mono">{tr("text187")}{[...c.emails, ...c.phones].join(" · ")}</span>
                  </p>
                </div>
              ))
            ) : (
              !all.error && <p className="hyg-empty">{tr("text188")}</p>
            )}

            <footer className="hyg-foot">
              <span>
                {tr("text189")}</span>
              {clusters.length > CONTACTS_SHOWN && (
                <button onClick={() => setShowContacts((v) => !v)}>
                  {showContacts ? tr("text190") : tr("text191", fmt(clusters.length))}
                </button>
              )}
            </footer>
          </section>
        </div>

      </main>
    </>
  );
}
