import { tr } from "@/i18n/carrier-crm";
import { useLang } from "@/i18n/language";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "@/styles/table-scroll.css";
import { useAuth } from "@/auth/AuthContext";
import { confirmAsync } from "@/components/confirm";
import { useAsync } from "@/components/useAsync";
import { NEED_REASON } from "@/lib/roles";
import { Empty, ErrorBanner, InfoBanner, Kpis, Spinner, TopBar, dateShort } from "@/components/ui";
import type { Vendor } from "@/types/domain";
import { vendorLabel } from "./crm.service";
import { bounceReason, listBouncedVendors, openBounces, replaceBouncedEmail, syncGmailBounces } from "./contact.service";
import { Sprint15ReplayCheck } from "./Sprint15ReplayCheck";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Carriers whose email bounced. A bounced address is taken off the carrier's
 * contacts and blocked, so nothing reaches it until someone puts the right
 * one in its place here.
 */
export function BouncesPage() {
  useLang();
  const [search] = useSearchParams();
  const { can, user } = useAuth();
  const canWork = can("operate");
  const lockedTitle = canWork ? undefined : NEED_REASON.operate;
  const { data, loading, error, reload } = useAsync(listBouncedVendors, []);
  // What is typed for each bounced address, by "vendor id|email".
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Retain the same intent across an explicit retry after a lost response.
  const operations = useRef(new Map<string, string>());

  const rows = (data ?? [])
    .map((vendor) => ({ vendor, bounces: openBounces(vendor) }))
    .filter((r) => r.bounces.length)
    .sort((a, b) => vendorLabel(a.vendor).localeCompare(vendorLabel(b.vendor)));
  const addresses = rows.reduce((sum, r) => sum + r.bounces.length, 0);

  async function replace(vendor: Vendor, bounced: string) {
    if (!canWork || busy) return;
    const key = `${vendor.id}|${bounced}`;
    const next = (typed[key] ?? "").trim().toLowerCase();
    if (!EMAIL.test(next)) {
      setNotice(tr("text001", bounced));
      return;
    }
    if (next === bounced.toLowerCase()) {
      setNotice(tr("text002"));
      return;
    }
    setBusy(key);
    setNotice(null);
    try {
      const detectedAt = openBounces(vendor).find((b) => b.email === bounced)?.detected_at ?? "";
      const intent = JSON.stringify([user?.id, vendor.id, bounced.toLowerCase(), next, detectedAt]);
      let operationId = operations.current.get(intent);
      if (!operationId) {
        operationId = crypto.randomUUID();
        operations.current.set(intent, operationId);
      }
      const result = await replaceBouncedEmail(vendor.id, bounced, next, operationId);
      setNotice(
        tr("text003", vendorLabel(vendor), next, bounced) +
          (result.cleanupWarning ? tr("bounceCleanupWarning", result.cleanupWarning) : ""),
      );
      setTyped((prev) => {
        const { [key]: _done, ...rest } = prev;
        return rest;
      });
      reload();
    } catch (e) {
      setNotice(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    const ok = await confirmAsync(
      tr("text004") +
        tr("text005"),
    );
    if (!ok) return;
    setBusy("sync");
    setNotice(null);
    try {
      const res = await syncGmailBounces();
      setNotice(
        tr("text006", res.scanned ?? 0, res.detected ?? 0) +
          tr("text007", res.blocked ?? 0, res.cleaned_vendors ?? 0),
      );
      reload();
    } catch (e) {
      setNotice(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <TopBar
        crumb="Carrier CRM"
        title={tr("text008")}
        sub={tr("text009")}
        actions={
          <>
            <Link to="/crm" className="btn">
              ← Carrier CRM
            </Link>
            <button onClick={reload}>{tr("text010")}</button>
            <button className="primary" disabled={!!busy || !canWork} title={lockedTitle} onClick={sync}>
              {busy === "sync" ? tr("text011") : tr("text012")}
            </button>
          </>
        }
      />
      <main className="main">
        <div style={{ display: "grid", gap: 14 }}>
          {search.get("comprobar") === "s15" && <Sprint15ReplayCheck />}
          <InfoBanner title={tr("text013")}>
            {tr("text014")}</InfoBanner>
          {notice && <InfoBanner>{notice}</InfoBanner>}
          <Kpis
            items={[
              { label: tr("text015"), value: rows.length, accent: true },
              { label: tr("text016"), value: addresses },
            ]}
          />
          {loading && <Spinner label={tr("text017")} />}
          {error && <ErrorBanner message={error} />}
          {!loading && !error && (rows.length ? (
            <div className="data-table-scroll" role="region" tabIndex={0} aria-label={tr("text008")}>
            <table className="data">
              <thead>
                <tr>
                  <th>Carrier</th>
                  <th>{tr("text018")}</th>
                  <th>{tr("text019")}</th>
                  <th>{tr("text020")}</th>
                  <th>{tr("text021")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap(({ vendor, bounces }) =>
                  bounces.map((bounce, index) => {
                    const key = `${vendor.id}|${bounce.email}`;
                    return (
                      <tr key={key}>
                        <td>
                          {index === 0 && (
                            <>
                              <div className="cell-title">{vendorLabel(vendor)}</div>
                              <div className="cell-sub">
                                {tr("text022")}{vendor.primary_email || tr("text023")}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="mono">{bounce.email}</td>
                        <td title={bounce.reason ?? undefined}>{bounceReason(bounce.reason)}</td>
                        <td className="mono">{dateShort(bounce.detected_at)}</td>
                        <td>
                          <div className="row" style={{ flexWrap: "nowrap" }}>
                            <input
                              type="email"
                              placeholder={tr("text024")}
                              aria-label={tr("text025", bounce.email)}
                              value={typed[key] ?? ""}
                              disabled={!canWork || !!busy}
                              onChange={(e) => setTyped((prev) => ({ ...prev, [key]: e.target.value }))}
                              onKeyDown={(e) => e.key === "Enter" && replace(vendor, bounce.email)}
                              style={{ minWidth: 220 }}
                            />
                            <button
                              disabled={!canWork || !!busy || !(typed[key] ?? "").trim()}
                              title={lockedTitle}
                              onClick={() => replace(vendor, bounce.email)}
                            >
                              {busy === key ? tr("text026") : tr("text027")}
                            </button>
                          </div>
                          {/* A carrier that already has a working address only needs the bounce closed. */}
                          {vendor.primary_email && vendor.primary_email.toLowerCase() !== bounce.email.toLowerCase() && (
                            <button
                              style={{
                                fontSize: 12,
                                padding: 0,
                                marginTop: 4,
                                background: "none",
                                border: "none",
                                color: "var(--orange)",
                                cursor: "pointer",
                              }}
                              disabled={!canWork || !!busy}
                              onClick={() => setTyped((prev) => ({ ...prev, [key]: String(vendor.primary_email) }))}
                            >
                              {tr("text028")}{vendor.primary_email})
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
            </div>
          ) : (
            <Empty title={tr("text029")} hint={tr("text030")} />
          ))}
        </div>
      </main>
    </>
  );
}
