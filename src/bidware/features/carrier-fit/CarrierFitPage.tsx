import { words, tr, reeferText } from "@/i18n/carrier-fit";
import { evaluateReeferRestrictions, isReeferTemplate } from "../../../../packages/carrier-fit/reefer-restrictions.mjs";
import { ProviderAdvisory } from "@/features/carrier-templates/ProviderAdvisory";
import { useLang, locale } from "@/i18n/language";
import { confirmAsync } from "@/components/confirm";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listVendorsByIds,
  materializeTemplate,
  previewEligibility,
  detectDuplicates,
  sharedContactGroups,
  defaultSelection,
  newOperationId,
  reasonLabel,
  type MaterializationResult,
} from "./carrierFit.service";
import {
  listAllCarrierTemplates,
  getCarrierTemplate,
  explainTemplateError,
  templateName,
  templateVersion,
  memberCount,
} from "@/features/carrier-templates/templates.service";
import { listRfxEvents, fetchRfxDetail } from "@/features/rfx-admin/rfx.service";
import { LaunchHeader, LaunchTabs, participantsOf } from "@/features/outreach/LaunchShell";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { Spinner, ErrorBanner, InfoBanner, Empty, Pill } from "@/components/ui";
import type { CarrierListTemplate, Vendor } from "@/types/domain";

const fmt = (n: number) => n.toLocaleString(locale("en-US"));

/**
 * Carrier fit (wireframe 06): a saved carrier list as the starting set, its
 * eligibility recalculated for this RFx, and the chosen carriers added to the
 * event's lanes as drafts.
 *
 * The materialisation is idempotent on `operationId`: it is generated once per
 * prepared selection and reused on retry, so a timeout never double-writes.
 * Nothing is sent here — invitations leave only from the Delivery queue.
 */
export function CarrierFitPage() {
  const [params] = useSearchParams();
  const { user, role } = useAuth();
  return <CarrierFitContent key={`${user?.id ?? "anonymous"}:${role ?? "pending"}:${user?.app_metadata?.rateware_organization_id ?? user?.app_metadata?.organization_id ?? ""}:${params.get("event") ?? ""}:${params.get("template") ?? ""}`} />;
}

function CarrierFitContent() {
  useLang();
  const [params, setParams] = useSearchParams();
  const templateId = params.get("template") || "";
  const eventId = params.get("event") || "";
  const { can, roleLoaded, user } = useAuth();
  const organizationId = user?.app_metadata?.rateware_organization_id ?? user?.app_metadata?.organization_id;
  const locked = can("operate") ? undefined : NEED_REASON.operate;
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const templates = useAsync(() => listAllCarrierTemplates({ lifecycle_status: "active" }), []);
  const events = useAsync(() => listRfxEvents(), []);

  const [template, setTemplate] = useState<CarrierListTemplate | null>(null);
  const [members, setMembers] = useState<Vendor[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const detail = useAsync(
    () => (eventId ? fetchRfxDetail(eventId) : Promise.resolve(null)),
    [eventId],
  );

  const [requestedVendors, setSelectedVendors] = useState<Set<string>>(new Set());
  const [selectedLanes, setSelectedLanes] = useState<Set<string>>(new Set());
  // Defaults apply until the operator touches the selection.
  const [vendorsTouched, setVendorsTouched] = useState(false);
  const [lanesTouched, setLanesTouched] = useState(false);
  const [showLanes, setShowLanes] = useState(false);
  const [operationId, setOperationId] = useState<string>(() => newOperationId());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<MaterializationResult | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string>("");

  // Load the chosen template and hydrate its membership from Carrier CRM.
  useEffect(() => {
    setTemplate(null);
    setMembers([]);
    setSelectedVendors(new Set());
    if (!templateId) {
      return;
    }
    let live = true;
    setLoadingTemplate(true);
    setTemplateError(null);
    setResult(null);
    setVendorsTouched(false);
    // usage_context writes the carrier_fit audit entry in rateware.
    getCarrierTemplate(templateId, "carrier_fit")
      .then(async (row) => {
        if (!live) return;
        setTemplate(row);
        const vendors = await listVendorsByIds((row?.vendor_ids ?? []) as string[]);
        if (!live) return;
        setMembers(vendors);
        setOperationId(newOperationId());
      })
      .catch((e) => live && setTemplateError(explainTemplateError(e)))
      .finally(() => live && setLoadingTemplate(false));
    return () => {
      live = false;
    };
  }, [templateId]);

  const memberIds = useMemo(() => (template?.vendor_ids ?? []) as string[], [template]);
  const vendorById = useMemo(() => new Map(members.map((v) => [v.id, v])), [members]);
  const lanes = useMemo(() => detail.data?.lanes ?? [], [detail.data]);
  const inRfx = useMemo(() => participantsOf(detail.data?.lanes), [detail.data]);

  const duplicates = useMemo(() => detectDuplicates(members), [members]);
  const sharedContacts = useMemo(() => sharedContactGroups(members), [members]);
  const restricted = isReeferTemplate(templateId);
  const restrictionDecisions = useMemo(() => new Map(memberIds.map(id => [id, evaluateReeferRestrictions({
    templateId,
    organizationId: template?.organization_id === organizationId ? organizationId : null,
    vendorId: id,
    lanes: [...selectedLanes].map(id => lanes.find(lane => lane.id === id) ?? { id: null }),
  })])), [memberIds, templateId, template?.organization_id, organizationId, selectedLanes, lanes]);
  const eligible = useMemo(
    () => defaultSelection(memberIds, vendorById, duplicates).filter(id => restrictionDecisions.get(id)?.ok),
    [memberIds, vendorById, duplicates, restrictionDecisions],
  );
  // Derive the usable selection synchronously: a lane change must never leave
  // a stale, now-forbidden checkbox or request enabled for one render.
  const selectedVendors = useMemo(() => new Set([...requestedVendors].filter(id => !restricted || eligible.includes(id))), [requestedVendors, restricted, eligible]);
  /** Who "Seleccionar elegibles" picks: eligible, and not in the RFx yet. */
  const eligibleNew = useMemo(() => eligible.filter((id) => !inRfx.has(id)), [eligible, inRfx]);
  const unavailable = memberIds.filter(
    (id) => !previewEligibility(vendorById.get(id)).ok || duplicates.get(id)?.redundantOf || !restrictionDecisions.get(id)?.ok,
  ).length;

  // The starting selection: eligible members not already in the RFx, and every
  // lane. A new scope is a new operation, so each default gets a fresh key.
  useEffect(() => {
    if (vendorsTouched || !members.length) return;
    setSelectedVendors(new Set(eligibleNew));
    setOperationId(newOperationId());
  }, [eligibleNew, members, vendorsTouched]);
  useEffect(() => {
    if (lanesTouched) return;
    setSelectedLanes(new Set(lanes.map((l) => l.id)));
    setOperationId(newOperationId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data, lanesTouched]);

  /** Exact duplicates selected together — the same entity twice. */
  const selectedHardDupes = useMemo(
    () =>
      [...selectedVendors].filter((id) =>
        duplicates.get(id)?.twinIds.some((twin) => selectedVendors.has(twin)),
      ),
    [selectedVendors, duplicates],
  );

  /**
   * Group unavailable members by reason so an operator can inspect large
   * lists without treating a historical count as current production state.
   */
  const bucketOf = (id: string) => {
    if (duplicates.get(id)?.redundantOf) return "DUPLICADO";
    const el = previewEligibility(vendorById.get(id));
    const decision = restrictionDecisions.get(id);
    if (el.ok && decision?.applies && !decision.ok) return `reefer_${decision.status}`;
    return el.ok ? "ELEGIBLE" : el.reason || "unavailable";
  };

  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of memberIds) {
      const key = bucketOf(id);
      if (key !== "ELEGIBLE") counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIds, vendorById, duplicates, restrictionDecisions]);

  const visibleMemberIds = useMemo(() => {
    if (!reasonFilter) return memberIds;
    if (reasonFilter === "EN_RFX") return memberIds.filter((id) => inRfx.has(id));
    return memberIds.filter((id) => bucketOf(id) === reasonFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIds, vendorById, duplicates, reasonFilter, inRfx, restrictionDecisions]);

  const matrix = selectedVendors.size * selectedLanes.size;
  const canRun = Boolean(template) && template?.id === templateId && Boolean(eventId) && detail.data?.event?.id === eventId &&
    !loadingTemplate && !templateError && !detail.loading && !detail.error && roleLoaded &&
    selectedVendors.size > 0 && selectedLanes.size > 0 && !busy && !locked;
  const currentIntent = useRef({ operationId, canRun });
  currentIntent.current = { operationId, canRun };

  /** Any change of scope is a different operation, so the idempotency key rotates. */
  function setScope(apply: () => void) {
    apply();
    setOperationId(newOperationId());
    setResult(null);
  }

  function toggleVendor(id: string) {
    if (busy || (restricted && !eligible.includes(id))) return;
    setVendorsTouched(true);
    setScope(() =>
      setSelectedVendors((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
    );
  }

  function toggleLane(id: string) {
    if (busy) return;
    setLanesTouched(true);
    setScope(() =>
      setSelectedLanes((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
    );
  }

  function pick(key: "template" | "event", value: string) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
    if (key === "event") {
      setLanesTouched(false);
      setResult(null);
    }
  }

  async function run() {
    if (!template || !canRun || pending.current) return;
    pending.current = true;
    const input = {
      laneIds: [...selectedLanes],
      vendorIds: [...selectedVendors],
      templateId: template.id,
      templateVersion: templateVersion(template),
      operationId,
    };
    const sameIntent = () => active.current && currentIntent.current.operationId === input.operationId;
    const dupeWarning = selectedHardDupes.length
      ? tr("text003", selectedHardDupes.length) +
        tr("text004")
      : "";
    try {
      const ok = await confirmAsync(
        tr("text005", selectedVendors.size, selectedLanes.size) +
          tr("text006", matrix, templateName(template), templateVersion(template)) +
          dupeWarning +
          tr("text007"),
      );
      if (!ok || !sameIntent() || !currentIntent.current.canRun) return;
      setBusy(true);
      setNotice(null);
      const res = await materializeTemplate(input);
      if (!sameIntent()) return;
      setResult(res);
      setNotice(
        tr("text008", res.counts?.inserted ?? 0) +
          tr("text009", res.counts?.already_present ?? 0, res.counts?.rejected ?? 0),
      );
      detail.reload();
    } catch (e) {
      // The same operationId is deliberately kept: retrying reuses the journal.
      if (sameIntent()) setNotice((e as {code?:string})?.code === "carrier_template_restrictions_failed"
        ? reeferText("serverBlock") : tr("text010", explainTemplateError(e), operationId.slice(0, 8)));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const rejectedByVendor = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of result?.outcomes ?? []) {
      if (o.outcome === "rejected" && o.reason) map.set(o.vendor_id, o.reason);
    }
    return map;
  }, [result]);

  const event = detail.data?.event;
  const templateSelect = (
    <select value={templateId} disabled={busy} onChange={(e) => pick("template", e.target.value)} aria-label={tr("text011")}>
      <option value="">{tr("text012")}</option>
      {(templates.data?.rows ?? []).map((t) => (
        <option key={t.id} value={t.id}>
          {templateName(t)} ({memberCount(t)}) · v{templateVersion(t)}
        </option>
      ))}
    </select>
  );

  return (
    <>
      {eventId ? (
        <LaunchHeader
          eventId={eventId}
          event={event}
          title="Carrier fit"
          info={tr("text013", lanes.length, lanes.length === 1 ? "" : "s", inRfx.size, inRfx.size === 1 ? "" : "s")}
          actions={
            <Link to="/bid-room-board.html" className="btn">
              {tr("text014")}</Link>
          }
        />
      ) : (
        <header className="identity crm-head">
          <div className="crm-head-main">
            <div className="crumb">
              <Link to="/rfx">RFx / Bid Room</Link>
            </div>
            <h1>Carrier fit</h1>
            <p className="sub">{tr("text015")}</p>
          </div>
        </header>
      )}

      <main className="main launch-main">
        {eventId && <LaunchTabs eventId={eventId} active="fit" />}

        <div className="fit-intro">
          <div>
            <h2>{tr("text016")}</h2>
            <p>{tr("text017")}</p>
          </div>
          <span className="fit-badge blue">{tr("text018")}</span>
          <span className="fit-badge green">{tr("text019")}</span>
        </div>

        <div className="fit-start">
          <b>{tr("text020")}</b>
          <span className="fit-source">{tr("text021")}</span>
          {templateSelect}
          {!eventId && (
            <select value={eventId} onChange={(e) => pick("event", e.target.value)} aria-label={tr("text022")}>
              <option value="">{tr("text023")}</option>
              {(events.data ?? []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name || ev.id}
                </option>
              ))}
            </select>
          )}
          <span className="spacer" />
          <Link to="/templates">{tr("text024")}</Link>
        </div>

        {templates.error && <ErrorBanner message={templates.error} />}
        {events.error && <ErrorBanner message={events.error} />}
        {templateError && <ErrorBanner message={templateError} />}
        {detail.error && <ErrorBanner message={detail.error} />}
        {restricted && <InfoBanner>
          <b style={{ display: "block", marginBottom: 6 }}>{reeferText("title")}</b>
          {reeferText("scope")}
          <details style={{ marginTop: 8 }}>
            <summary>{reeferText("requirements")}</summary>
            <p>{reeferText("requirementsHelp")}</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>{reeferText("format")}</pre>
          </details>
        </InfoBanner>}
        {notice && <InfoBanner>{notice}</InfoBanner>}
        {result && eventId && (
          <div className="fit-next">
            <b>{tr("text025")}</b>
            <Link to={`/rfx/${eventId}/review`}>{tr("text026")}</Link>
            <Link to={`/rfx/${eventId}/message`}>{tr("text027")}</Link>
          </div>
        )}

        <div className="rev-kpis fit-kpis">
          {[
            { label: tr("text028"), value: memberIds.length },
            { label: tr("text029"), value: eligible.length, accent: true },
            { label: tr("text030"), value: memberIds.filter((id) => inRfx.has(id)).length },
            { label: tr("text031"), value: unavailable },
            { label: tr("text032"), value: selectedVendors.size },
          ].map((k) => (
            <div key={k.label}>
              <span>{k.label}</span>
              <strong className={k.accent ? "accent" : undefined}>{loadingTemplate ? "…" : fmt(k.value)}</strong>
            </div>
          ))}
        </div>

        {eventId && lanes.length > 0 && (
          <div className="fit-lanes">
            <b>Lanes</b>
            <span>
              {selectedLanes.size === lanes.length
                ? tr("text033", lanes.length)
                : tr("text034", selectedLanes.size, lanes.length)}
            </span>
            <button className="link" onClick={() => setShowLanes((v) => !v)}>
              {showLanes ? tr("text035") : tr("text036")}
            </button>
            {showLanes && (
              <div className="fit-lane-list">
                {lanes.map((lane) => (
                  <label key={lane.id} className={selectedLanes.has(lane.id) ? "on" : undefined}>
                    <input type="checkbox" disabled={busy} checked={selectedLanes.has(lane.id)} onChange={() => toggleLane(lane.id)} />
                    <span className="mono">{(lane.lane_number as number) ?? "—"}</span>
                    {(lane.origin as string) || (lane.origin_city as string) || "—"} →{" "}
                    {(lane.destination as string) || (lane.destination_market as string) || "—"}
                    {lane.equipment ? <em> · {String(lane.equipment)}</em> : null}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedHardDupes.length > 0 && (
          <ErrorBanner
            message={
              tr("text037", selectedHardDupes.length) +
              tr("text038") +
              tr("text039")
            }
          />
        )}

        {(loadingTemplate || detail.loading) && <Spinner label={tr("text040")} />}

        {!templateId && !loadingTemplate && (
          <Empty title={tr("text041")} hint={tr("text042")} />
        )}
        {templateId && !eventId && !loadingTemplate && (
          <InfoBanner title={tr("text043")}>{tr("text044")}</InfoBanner>
        )}

        {templateId && !loadingTemplate && (
          <>
            <div className="tpl-filters fit-filters">
              <button className={reasonFilter === "" ? "on" : undefined} onClick={() => setReasonFilter("")}>
                {tr("text045")}<b>{memberIds.length}</b>
              </button>
              <button className={reasonFilter === "ELEGIBLE" ? "on" : undefined} onClick={() => setReasonFilter("ELEGIBLE")}>
                {tr("text029")}<b>{memberIds.filter((id) => bucketOf(id) === "ELEGIBLE").length}</b>
              </button>
              {eventId && (
                <button className={reasonFilter === "EN_RFX" ? "on" : undefined} onClick={() => setReasonFilter("EN_RFX")}>
                  {tr("text030")}<b>{memberIds.filter((id) => inRfx.has(id)).length}</b>
                </button>
              )}
              {breakdown.map(([key, n]) => (
                <button key={key} className={reasonFilter === key ? "on" : undefined} onClick={() => setReasonFilter(key)}>
                  {key === "DUPLICADO" ? tr("text047") : key.startsWith("reefer_") ? reeferText(key) : reasonLabel(key)}
                  <b>{n}</b>
                </button>
              ))}
              <span className="spacer" />
              <button
                className="link"
                disabled={busy}
                onClick={() => {
                  setVendorsTouched(true);
                  setScope(() => setSelectedVendors(new Set(eligibleNew)));
                }}
              >
                {tr("text048")}{eligibleNew.length}{tr("text049")}</button>
              <span className="fit-sep">·</span>
              <button
                className="link fit-clear"
                disabled={busy}
                onClick={() => {
                  setVendorsTouched(true);
                  setScope(() => setSelectedVendors(new Set()));
                }}
              >
                {tr("text050")}</button>
            </div>

            {memberIds.length ? (
              <div className="crm-table-wrap">
                <table className="data fit-table">
                  <thead>
                    <tr>
                      <th>Carrier</th>
                      <th className="fit-col-el" style={restricted ? { width: "38%", minWidth: 320 } : undefined}>{tr("text051")}</th>
                      <th className="fit-col-stage">{tr("text052")}</th>
                      <th>{tr("text053")}</th>
                      <th className="fit-col-rfx">{tr("text054")}</th>
                      <th className="fit-col-sel">Sel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMemberIds.map((id) => {
                      const v = vendorById.get(id);
                      const el = previewEligibility(v);
                      const restriction = restrictionDecisions.get(id);
                      const restrictionBlocked = restriction?.applies && !restriction.ok;
                      const dup = duplicates.get(id);
                      const shared = sharedContacts.get(id);
                      const rejected = rejectedByVendor.get(id);
                      const contact = String(v?.primary_email || v?.whatsapp_phone || "").trim();
                      const picked = selectedVendors.has(id);
                      return (
                        <tr key={id} className={picked ? "picked" : undefined} onClick={() => toggleVendor(id)}>
                          <td>
                            <div className="cell-title ellipsis">{v?.vendor_name || v?.name || id}</div>
                            <div className="cell-sub ellipsis">{v?.domain ? String(v.domain) : tr("text055")}</div>
                            {v && <ProviderAdvisory vendorId={id} />}
                          </td>
                          <td className="fit-col-el" style={restricted ? { width: "38%", minWidth: 320 } : undefined}>
                            {dup?.redundantOf ? (
                              <Pill tone="red">{tr("text001")}</Pill>
                            ) : (
                              <Pill tone={el.ok && !restrictionBlocked ? "green" : restrictionBlocked || el.reason === "missing_contact" ? "red" : ""}>
                                {!el.ok ? el.label : restriction?.applies ? reeferText(restriction.status) : tr("text056")}
                              </Pill>
                            )}
                            {restriction?.applies && <div className="cell-sub" style={{ whiteSpace: "normal", fontFamily: "inherit", fontSize: 12, lineHeight: 1.5 }}>
                              {restriction.scopeCode && <p style={{ margin: "6px 0" }}>{reeferText(restriction.scopeCode)}</p>}
                              {restriction.ok ? reeferText("rfqOnly") : <ul style={{ paddingLeft: 16, margin: "6px 0" }}>
                                {restriction.issues.map(issue => <li key={`${issue.laneId}:${issue.code}`}>
                                  {issue.laneId ? `${reeferText("lane")} ${lanes.find(l => l.id === issue.laneId)?.lane_number ?? "—"}: ` : ""}
                                  {reeferText(issue.code)}
                                </li>)}
                              </ul>}
                            </div>}
                            {dup && (
                              <div className="cell-sub" title={tr("text057")}>
                                {dup.redundantOf ? words("word0") : tr("text058")}
                                {dup.twinIds.map((t) => vendorById.get(t)?.vendor_name || t.slice(0, 8)).join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="fit-col-stage">{v?.base_stage ? String(v.base_stage) : "—"}</td>
                          <td>
                            {contact ? (
                              <span className="mono fit-contact ellipsis" title={contact}>
                                {contact}
                              </span>
                            ) : (
                              <span className="fit-none">{tr("text059")}</span>
                            )}
                            {shared && <div className="cell-sub">{tr("text060")}{shared.length}</div>}
                          </td>
                          <td className="fit-col-rfx">
                            {rejected ? (
                              <Pill tone="red">{reasonLabel(rejected)}</Pill>
                            ) : inRfx.has(id) ? (
                              <Pill tone="indigo">{tr("text061")}</Pill>
                            ) : (
                              <span className="fit-none">{tr("text062")}</span>
                            )}
                          </td>
                          <td className="fit-col-sel" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              disabled={busy || Boolean(restricted && !eligible.includes(id))}
                              checked={picked}
                              onChange={() => toggleVendor(id)}
                              aria-label={tr("text063", v?.vendor_name || id)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : !templateError ? (
              <Empty title={tr("text064")} hint={tr("text065")} />
            ) : null}

            <div className="fit-go">
              <span>
                <b>{fmt(selectedVendors.size)} carriers</b> × {fmt(selectedLanes.size)} lanes = {fmt(matrix)}{tr("text066")}</span>
              <button className="primary" disabled={!canRun} title={locked} onClick={run}>
                {busy ? tr("text067") : tr("text068", fmt(selectedVendors.size))}
              </button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
