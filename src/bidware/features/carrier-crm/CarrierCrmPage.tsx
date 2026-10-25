import { tr } from "@/i18n/carrier-crm";
import { useLang, locale, getLang } from "@/i18n/language";
import { confirmAsync } from "@/components/confirm";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchVendorFunnel,
  listVendors,
  moveVendors,
  needsConfirmation,
  vendorLabel,
  FUNNEL_STAGES,
  STAGE_HINT,
  STAGE_LABEL,
  STATUS_WORD,
  type BaseStage,
  type FunnelStage,
  type VendorPatch,
} from "./crm.service";
import { listCarrierTemplates } from "@/features/carrier-templates/templates.service";
import { CarrierCard, type TmsStatus } from "./CarrierCard";
import { NewCarrierDialog } from "./NewCarrierDialog";
import { ProfileLinkDialog } from "./ProfileLinkDialog";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { Spinner, ErrorBanner, InfoBanner, Empty, Pill } from "@/components/ui";
import type { Vendor } from "@/types/domain";
import { LegalName } from "./LegalName";

type Column = BaseStage | FunnelStage;
type Row = Vendor & { effective_funnel_stage?: string; funnel_stage?: string; stage_days?: number | null };

const STATUS_TONE: Record<string, any> = {
  active: "green",
  invited: "blue",
  inactive: "amber",
  blocked: "red",
};

const fmt = (n: number) => n.toLocaleString(locale());

/** Days since a timestamp, for the lists that carry no stage date. */
function daysSince(value: unknown): number | null {
  const t = value ? new Date(String(value)).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null;
}

/**
 * Pipeline for the shared Carrier CRM (wireframe 23).
 *
 * Deliberately not drag-and-drop: with ~1,700 carriers the useful gesture is
 * "filter a stage, select several, move them", which is also exactly the shape
 * of `bulk_update_vendors`. Nothing moves without an explicit apply. The card
 * on the right reads one carrier in full; its TMS status is set there, apart
 * from the stage, because the two are different axes.
 */
export function CarrierCrmPage() {
  useLang();
  const funnel = useAsync(() => fetchVendorFunnel(), []);
  const sourcing = useAsync(() => listVendors({ base_stage: "sourcing", limit: 1000 }), []);
  const archived = useAsync(() => listVendors({ base_stage: "archived", limit: 1000 }), []);
  // Only for "En plantillas" on the card; the page works without it.
  const templates = useAsync(() => listCarrierTemplates({ limit: 200 }), []);

  const [column, setColumn] = useState<Column>("targeted");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [cardVersion, setCardVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Column>("invited");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [profileFor, setProfileFor] = useState<Vendor | null>(null);
  const { can } = useAuth();
  const canWork = can("operate");
  const locked = canWork ? undefined : NEED_REASON.operate;
  // Archiving a carrier, and bringing one back, are an Administrador's (2026-09-29).
  const canArchive = can("admin");
  const touchesArchive = target === "archived" || column === "archived";

  const stageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of funnel.data?.stages ?? []) map.set(s.key, s.count);
    map.set("sourcing", sourcing.data?.total ?? 0);
    map.set("archived", archived.data?.total ?? 0);
    return map;
  }, [getLang(), funnel.data, sourcing.data, archived.data]);

  const rows: Row[] = useMemo(() => {
    if (column === "sourcing") return sourcing.data?.rows ?? [];
    if (column === "archived") return archived.data?.rows ?? [];
    return (funnel.data?.rows ?? []).filter(
      (r) => (r.effective_funnel_stage || r.funnel_stage) === column,
    );
  }, [getLang(), column, funnel.data, sourcing.data, archived.data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((v) =>
      [v.vendor_name, v.legal_name, v.profile_legal_name, v.domain, v.primary_email]
        .some((f) => String(f ?? "").toLowerCase().includes(q)),
    );
  }, [getLang(), rows, search]);

  const focused = visible.find((v) => v.id === focusId) ?? visible[0] ?? null;



  function pickColumn(next: Column) {
    setColumn(next);
    setSelected(new Set());
    setFocusId(null);
    setNotice(null);
    if (next === target) setTarget(next === "invited" ? "onboarded" : "invited");
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  const allVisibleSelected = visible.length > 0 && visible.every((v) => selected.has(v.id));

  function reloadAll() {
    funnel.reload();
    sourcing.reload();
    archived.reload();
    setCardVersion((n) => n + 1);
  }

  /** Builds the patch from the operator's intent; the server owns derivations. */
  function patchFor(to: Column): VendorPatch {
    if (to === "sourcing" || to === "archived") return { base_stage: to };
    return { base_stage: "procurement", funnel_stage: to as FunnelStage };
  }

  async function apply() {
    const ids = [...selected];
    if (!ids.length || target === column) return;
    const patch = patchFor(target);
    const extra = needsConfirmation(ids, patch)
      ? tr("text053", patch.base_stage === "archived" ? tr("archiveAction") : "100+ carriers")
      : "";
    if (
      !await confirmAsync(
        tr("text054", ids.length, STAGE_LABEL[column], STAGE_LABEL[target], extra),
      )
    )
      return;

    setBusy(true);
    setNotice(null);
    try {
      const res = await moveVendors(ids, patch);
      setNotice(tr("text055", res.updated, STAGE_LABEL[target]));
      setSelected(new Set());
      reloadAll();
    } catch (e) {
      setNotice(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(ids: string[], status: TmsStatus, who: string, clearSelection = false) {
    if (!ids.length) return;
    if (
      !await confirmAsync(
        tr("text056", who, STATUS_WORD[status] ?? status) +
          tr("text057"),
      )
    )
      return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await moveVendors(ids, { status });
      setNotice(tr("text058", res.updated, STATUS_WORD[status] ?? status));
      if (clearSelection) setSelected(new Set());
      reloadAll();
    } catch (e) {
      setNotice(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const loading = funnel.loading || sourcing.loading || archived.loading;
  const error = funnel.error || sourcing.error || archived.error;
  const columns: Column[] = ["sourcing", ...FUNNEL_STAGES, "archived"];
  const countPending = (c: Column) =>
    c === "sourcing" ? sourcing.loading && !sourcing.data : c === "archived" ? archived.loading && !archived.data : funnel.loading && !funnel.data;
  const empties = funnel.data ? FUNNEL_STAGES.filter((s) => !(stageCounts.get(s) ?? 0)) : [];

  return (
    <>
      <header className="identity crm-head">
        <div className="crm-head-main">
          <div className="crumb">{tr("text241")}</div>
          <h1>Carrier CRM</h1>
        </div>
        <div className="crm-head-actions">
          <Link to="/crm/higiene" className="btn">
            {tr("text060")}</Link>
          <Link to="/crm/rebotes" className="btn">
            {tr("text061")}</Link>
          <button disabled={!canWork} title={locked} onClick={() => setCreating(true)}>
            {tr("text062")}</button>
        </div>
      </header>
      {profileFor && <ProfileLinkDialog vendor={profileFor} onClose={() => setProfileFor(null)} />}
      {creating && (
        <NewCarrierDialog
          onClose={() => setCreating(false)}
          onCreated={(message) => {
            setCreating(false);
            setNotice(message);
            reloadAll();
          }}
        />
      )}

      <nav className="crm-stages" aria-label={tr("text078")}>
        {columns.map((c) => (
          <button
            key={c}
            className={column === c ? "on" : undefined}
            aria-pressed={column === c}
            onClick={() => pickColumn(c)}
            title={STAGE_HINT[c]}
          >
            {STAGE_LABEL[c]}
            {/* The funnel takes a while on a large base: «…» until it answers, never a false 0. */}
            <b>{countPending(c) ? "…" : fmt(stageCounts.get(c) ?? 0)}</b>
          </button>
        ))}
      </nav>
      <p className="crm-stage-hint">
        <b>{STAGE_LABEL[column]}:</b> {STAGE_HINT[column]}
        {empties.length > 0 && <> {tr("text079")}{empties.map((s) => STAGE_LABEL[s]).join(", ")}.</>}
      </p>

      <main className="crm-main">
        <div className="crm-col">
          {notice && <InfoBanner>{notice}</InfoBanner>}
          {error && <ErrorBanner message={error} />}
          {/* The report degrades gracefully and says so; swallowing that would
              hide that some counts were computed on partial metrics. */}
          {funnel.data?.warnings?.length ? (
            <InfoBanner title={tr("text080")}>{funnel.data.warnings.join(" · ")}</InfoBanner>
          ) : null}

          <div className="crm-tools">
            <input
              className="crm-search"
              placeholder={tr("text081")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {selected.size > 0 && (
            <div className="crm-selection" role="region" aria-label={tr("text077")}>
              <b>{tr("text242", fmt(selected.size))}</b>
              <label className="crm-move">
                <span>{tr("text084")}</span>
                <select value={target} onChange={(e) => setTarget(e.target.value as Column)}>
                  {columns
                    .filter((c) => c !== column)
                    .map((c) => (
                      <option key={c} value={c}>
                        {STAGE_LABEL[c]}
                        {c === "archived" && !canArchive ? tr("text085") : ""}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={busy || !canWork || (touchesArchive && !canArchive)}
                title={locked ?? (touchesArchive && !canArchive ? NEED_REASON.admin : undefined)}
                onClick={apply}
              >
                {busy ? tr("text063") : tr("text243")}
              </button>
              <button className="link" onClick={() => setSelected(new Set())}>{tr("text083")}</button>
            </div>
          )}

          {loading ? (
            <Spinner label={tr("text086")} />
          ) : visible.length ? (
            <div className="crm-table-wrap">
              <table className="data crm-table">
                <thead>
                  <tr>
                    <th className="crm-check">
                      <input
                        type="checkbox"
                        aria-label={tr("text082")}
                        checked={allVisibleSelected}
                        onChange={() =>
                          setSelected(allVisibleSelected ? new Set() : new Set(visible.map((v) => v.id)))
                        }
                      />
                    </th>
                    <th>Carrier</th>
                    <th>{tr("text087")}</th>
                    <th>{tr("text088")}</th>
                    <th className="crm-col-status">{tr("text043")}</th>
                    <th className="crm-col-stage">{tr("text040")}</th>
                    <th className="crm-col-days">{tr("text089")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((v) => {
                    const effective = v.effective_funnel_stage;
                    const stored = v.funnel_stage;
                    const status = String(v.status || "").toLowerCase();
                    const days = v.stage_days ?? daysSince(v.updated_at);
                    const cls = [selected.has(v.id) && "picked", focused?.id === v.id && "focus"]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <tr key={v.id} className={cls || undefined} onClick={() => setFocusId(v.id)}>
                        <td className="crm-check" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={tr("text090", vendorLabel(v))}
                            checked={selected.has(v.id)}
                            onChange={() => toggle(v.id)}
                          />
                        </td>
                        <td className="ellipsis crm-name" title={vendorLabel(v)}>
                          {vendorLabel(v)}
                        </td>
                        <td className="ellipsis crm-legal">
                          <LegalName vendor={v} />
                        </td>
                        <td className="mono ellipsis crm-contact" title={v.primary_email || v.whatsapp_phone || undefined}>
                          {v.primary_email || v.whatsapp_phone || <span className="crm-none">{tr("text091")}</span>}
                        </td>
                        <td className="crm-col-status">
                          <Pill tone={STATUS_TONE[status] ?? ""}>{(STATUS_WORD[status] ?? (status || "—")).toUpperCase()}</Pill>
                        </td>
                        <td className="crm-col-stage">
                          {effective ? STAGE_LABEL[effective] || effective : STAGE_LABEL[column]}
                          {effective && stored && effective !== stored && (
                            <small title={tr("text041")}>
                              {tr("text092")}{STAGE_LABEL[stored] || stored}
                            </small>
                          )}
                        </td>
                        <td
                          className="mono crm-col-days"
                          title={v.stage_days == null ? tr("text093") : tr("text094")}
                        >
                          {days ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={tr("text095", STAGE_LABEL[column])}
              hint={search ? tr("text096") : tr("text097")}
            />
          )}

        </div>

        <CarrierCard
          vendor={loading ? null : focused}
          version={cardVersion}
          templates={templates.data?.rows ?? null}
          selectedCount={selected.size}
          canWork={canWork}
          busy={busy}
          onStatus={(s) => focused && setStatus([focused.id], s, vendorLabel(focused))}
          onBulkStatus={(s) => setStatus([...selected], s, `${selected.size} carriers`, true)}
          onProfileLink={() => focused && setProfileFor(focused)}
        />
      </main>
    </>
  );
}
