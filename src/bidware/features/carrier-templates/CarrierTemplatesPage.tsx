import { tr } from "@/i18n/carrier-templates";
import { useLang, locale } from "@/i18n/language";
import { promptAsync } from "@/components/confirm";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listAllCarrierTemplates,
  archiveCarrierTemplate,
  restoreCarrierTemplate,
  duplicateCarrierTemplate,
  explainTemplateError,
  templateName,
  templateVersion,
  memberCount,
} from "./templates.service";
import { listVendorsByIds } from "@/features/carrier-fit/carrierFit.service";
import { vendorLabel } from "@/features/carrier-crm/crm.service";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { Spinner, ErrorBanner, InfoBanner, Empty, dateShort } from "@/components/ui";
import type { CarrierListTemplate } from "@/types/domain";

type Lifecycle = "current" | "all" | "active" | "draft" | "archived";

const FILTERS = (): [Lifecycle, string][] => [
  ["current", tr("current")],
  ["all", tr("text001")],
  ["active", tr("text002")],
  ["draft", tr("text003")],
  ["archived", tr("text004")],
];

const STATE_LABEL: Record<string, string> = { get active() { return tr("text005"); }, get draft() { return tr("text006"); }, get archived() { return tr("text007"); } };

const lifecycleOf = (t: CarrierListTemplate) =>
  String(t.lifecycle_status || t.status || "draft").toLowerCase();

const MEMBER_PREVIEW = 8;

function dateTime(v: unknown): string {
  const d = v ? new Date(String(v)) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale(), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * The template library (wireframe 04): every list with its members and state,
 * and on the right the one being looked at — who is in it, and what can be
 * done with it. Only an active template loads into Carrier Fit.
 */
export function CarrierTemplatesPage() {
  const { user, role } = useAuth();
  return <CarrierTemplatesContent key={`${user?.id ?? "anonymous"}:${role}:${user?.app_metadata?.rateware_organization_id ?? ""}`} />;
}

function CarrierTemplatesContent() {
  const language = useLang();
  const { data, loading, error, reload } = useAsync(() => listAllCarrierTemplates(), []);
  const { can } = useAuth();
  // Archiving and restoring a template are an Administrador's.
  const adminOnly = can("admin") ? undefined : NEED_REASON.admin;
  const locked = can("operate") ? undefined : NEED_REASON.operate;
  const [filter, setFilter] = useState<Lifecycle>("current");
  const [search, setSearch] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const all = error ? [] : data?.rows ?? [];
  const counts = useMemo(() => {
    const map = new Map<Lifecycle, number>([["all", all.length]]);
    for (const t of all) map.set(lifecycleOf(t) as Lifecycle, (map.get(lifecycleOf(t) as Lifecycle) ?? 0) + 1);
    map.set("current", (map.get("active") ?? 0) + (map.get("draft") ?? 0));
    return map;
  }, [all]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (t) =>
        (filter === "all" || (filter === "current" ? ["active", "draft"].includes(lifecycleOf(t)) : lifecycleOf(t) === filter)) &&
        (!q || `${templateName(t)} ${t.description ?? ""}`.toLowerCase().includes(q)),
    );
  }, [all, filter, search]);

  const focused = rows.find((t) => t.id === focusId) ?? rows[0] ?? null;

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
    } catch (e) {
      setNotice(explainTemplateError(e));
    } finally {
      setBusyId(null);
      // Reload either way: on a 409 the local version is stale by definition.
      reload();
    }
  }

  async function askDuplicate(t: CarrierListTemplate) {
    const name = await promptAsync(
      tr("text008"),
      tr("text009", templateName(t)),
    );
    if (!name?.trim()) return;
    run(
      t.id,
      () => duplicateCarrierTemplate(t.id, templateVersion(t), name.trim()),
      tr("text010", name.trim()),
    );
  }

  const archive = (t: CarrierListTemplate) =>
    run(t.id, () => archiveCarrierTemplate(t.id, templateVersion(t)), tr("text011"));
  const restore = (t: CarrierListTemplate) =>
    run(t.id, () => restoreCarrierTemplate(t.id, templateVersion(t)), tr("text012"));

  return (
    <>
      <header className="identity crm-head">
        <div className="crm-head-main">
          <div className="crumb">
            <Link to="/crm">Carrier CRM</Link>
          </div>
          <h1>Carrier list templates</h1>
          <p className="sub">{tr("text013")}</p>
        </div>
        <div className="crm-head-actions">
          <Link to="/templates/review" className="btn">{language === "es" ? "Revisar evidencia" : "Review evidence"}</Link>
          <button onClick={reload}>{tr("text014")}</button>
          {locked ? (
            <button className="primary" disabled title={locked}>
              {tr("text015")}</button>
          ) : (
            <Link to="/templates/new" className="btn primary">
              {tr("text015")}</Link>
          )}
        </div>
      </header>

      <div className="tpl-body">
        <div className="tpl-note">
          <b>{tr("text016")}</b>
          <span>
            {tr("text017")}</span>
        </div>

        {notice && <InfoBanner>{notice}</InfoBanner>}
        {error && <ErrorBanner message={error} />}

        <div className="tpl-filters">
          {FILTERS().map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "on" : undefined}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
              <b>{counts.get(key) ?? 0}</b>
            </button>
          ))}
          <input
            className="tpl-search"
            placeholder={tr("text018")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <Spinner label={tr("text019")} />
        ) : (
          <div className="tpl-grid">
            {rows.length ? (
              <div className="crm-table-wrap">
                <table className="data tpl-table">
                  <thead>
                    <tr>
                      <th>Template</th>
                      <th className="tpl-col-members">{tr("text020")}</th>
                      <th className="tpl-col-state">{tr("text021")}</th>
                      <th className="tpl-col-date">{tr("text022")}</th>
                      <th className="tpl-col-actions">{tr("text023")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const lc = lifecycleOf(t);
                      const busy = busyId === t.id;
                      return (
                        <tr
                          key={t.id}
                          className={focused?.id === t.id ? "picked" : undefined}
                          onClick={() => setFocusId(t.id)}
                        >
                          <td>
                            <div className="tpl-name ellipsis" title={templateName(t)}>
                              {templateName(t)}
                            </div>
                            {t.description && (
                              <div className="tpl-desc ellipsis" title={t.description}>
                                {t.description}
                              </div>
                            )}
                          </td>
                          <td className="mono tpl-col-members">{memberCount(t)}</td>
                          <td className="tpl-col-state">
                            <span className={`tpl-state ${lc}`}>{STATE_LABEL[lc] ?? lc.toUpperCase()}</span>
                          </td>
                          <td className="tpl-col-date">{dateShort(t.updated_at)}</td>
                          <td className="tpl-col-actions" onClick={(e) => e.stopPropagation()}>
                            {lc === "archived" ? (
                              <button className="link" disabled={busy || Boolean(adminOnly)} title={adminOnly} onClick={() => restore(t)}>
                                {tr("text024")}</button>
                            ) : (
                              <>
                                <Link to={`/templates/${t.id}/edit`}>{tr("text025")}</Link>
                                {" · "}
                                <button className="link" disabled={busy || Boolean(locked)} title={locked} onClick={() => askDuplicate(t)}>
                                  {tr("text026")}</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title={all.length ? tr("text027") : tr("text028")}
                hint={all.length ? tr("text029") : tr("text030")}
              />
            )}

            <TemplateSide
              template={focused}
              busy={Boolean(focused && busyId === focused.id)}
              locked={locked}
              adminOnly={adminOnly}
              onDuplicate={askDuplicate}
              onArchive={archive}
              onRestore={restore}
            />
          </div>
        )}
      </div>
    </>
  );
}

/** The template being looked at: its facts, a look at who is in it, and what can be done. */
function TemplateSide({
  template: t,
  busy,
  locked,
  adminOnly,
  onDuplicate,
  onArchive,
  onRestore,
}: {
  template: CarrierListTemplate | null;
  busy: boolean;
  locked?: string;
  adminOnly?: string;
  onDuplicate: (t: CarrierListTemplate) => void;
  onArchive: (t: CarrierListTemplate) => void;
  onRestore: (t: CarrierListTemplate) => void;
}) {
  useLang();
  const ids = ((t?.vendor_ids ?? []) as string[]).slice(0, MEMBER_PREVIEW);
  const members = useAsync(() => listVendorsByIds(ids), [t?.id, ids.join(",")]);

  if (!t) {
    return (
      <aside className="crm-side tpl-side">
        <p className="crm-kicker">Template</p>
        <p className="crm-card-empty">{tr("text031")}</p>
      </aside>
    );
  }

  const lc = lifecycleOf(t);
  const total = memberCount(t);
  const names = new Map((members.data ?? []).map((v) => [v.id, vendorLabel(v)]));

  return (
    <aside className="crm-side tpl-side">
      <p className="crm-kicker">Template · v{templateVersion(t)}</p>
      <h2>{templateName(t)}</h2>

      <div className="tpl-field">
        <span>{tr("text032")}</span>
        <p>{t.description || "—"}</p>
      </div>
      <div className="tpl-field">
        <span>{tr("text020")}</span>
        <p className="mono">
          {total} carrier{total === 1 ? "" : "s"}
        </p>
        {ids.length > 0 && (
          <ul className="tpl-members">
            {ids.map((id) => (
              <li key={id} className="ellipsis">
                {members.loading ? "…" : names.get(id) ?? tr("text033")}
              </li>
            ))}
            {total > ids.length && <li className="tpl-more">+{total - ids.length}{tr("text034")}</li>}
          </ul>
        )}
      </div>
      <div className="tpl-field">
        <span>{tr("text021")}</span>
        <p>
          <span className={`tpl-state ${lc}`}>{STATE_LABEL[lc] ?? lc.toUpperCase()}</span>
        </p>
      </div>
      <div className="tpl-field">
        <span>{tr("text035")}</span>
        <p className="mono">{dateTime(t.updated_at)}</p>
        {t.updated_by_email && <small>{t.updated_by_email}</small>}
      </div>
      {t.created_by_email && (
        <div className="tpl-field">
          <span>{tr("text036")}</span>
          <p>{t.created_by_email}</p>
        </div>
      )}

      <div className="tpl-actions">
        {lc === "active" && (
          <Link to={`/carrier-fit?template=${t.id}`} className="btn primary">
            {tr("text037")}</Link>
        )}
        {lc !== "archived" && (
          <Link to={`/templates/${t.id}/edit`} className="btn">
            {tr("text038")}</Link>
        )}
        <button disabled={busy || Boolean(locked)} title={locked} onClick={() => onDuplicate(t)}>
          {tr("text026")}</button>
        {lc === "archived" ? (
          <button disabled={busy || Boolean(adminOnly)} title={adminOnly} onClick={() => onRestore(t)}>
            {tr("text024")}</button>
        ) : (
          <button disabled={busy || Boolean(adminOnly)} title={adminOnly} onClick={() => onArchive(t)}>
            {tr("text039")}</button>
        )}
      </div>
      {lc === "draft" && (
        <p className="tpl-hint">{tr("text040")}</p>
      )}

      <p className="tpl-static">{tr("text041")}</p>
    </aside>
  );
}
