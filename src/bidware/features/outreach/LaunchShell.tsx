import { tr } from "@/i18n/outreach";
import { useLang } from "@/i18n/language";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RfxDetail } from "@/features/rfx-admin/rfx.service";
import type { RfxLane } from "@/types/domain";

/**
 * The Launch screens' frame (wireframes 17 and 18): the event they belong to,
 * what this screen does, its actions, and the three steps of Launch as tabs.
 */
export function LaunchHeader({
  eventId,
  event,
  title,
  tags,
  info,
  actions,
}: {
  eventId: string;
  event?: RfxDetail["event"];
  title: string;
  tags?: ReactNode;
  info?: ReactNode;
  actions?: ReactNode;
}) {
  useLang();
  const label = [event?.rfx_id, event?.name].filter(Boolean).join(" · ");
  return (
    <header className="identity launch-head">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="crumb ellipsis">
          <Link to="/eventos">{tr("text280")}</Link>
          {" › "}
          <Link to={`/rfx/${eventId}`} title={label}>
            {label || tr("text143")}
          </Link>
        </div>
        <div className="launch-title">
          <h1>{title}</h1>
          {tags}
          {info && <span className="launch-info">{info}</span>}
        </div>
      </div>
      {actions && <div className="identity-side launch-actions">{actions}</div>}
    </header>
  );
}

const STEPS = [
  { key: "fit", label: "Carrier fit", to: (id: string) => `/carrier-fit?event=${id}` },
  { key: "review", get label() { return tr("text144"); }, to: (id: string) => `/rfx/${id}/review` },
  { key: "message", get label() { return tr("text145"); }, to: (id: string) => `/rfx/${id}/message` },
  { key: "delivery", get label() { return tr("text090"); }, to: (id: string) => `/rfx/${id}/delivery` },
] as const;

export function LaunchTabs({ eventId, active }: { eventId: string; active: (typeof STEPS)[number]["key"] }) {
  useLang();
  return (
    <nav className="tabs tab-links launch-tabs">
      {STEPS.map((s) => (
        <Link key={s.key} to={s.to(eventId)} className={s.key === active ? "active" : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

type Invitation = { vendor_id?: string; invitation_status?: string; vendors?: { vendor_name?: string } | null };

/**
 * The carriers this event invites: one per vendor, however many lanes it has,
 * leaving out archived and declined invitations. That is who drafts are for.
 */
export function audienceOf(lanes: RfxLane[] | undefined) {
  const byVendor = new Map<string, string>();
  for (const lane of lanes ?? []) {
    for (const inv of ((lane as { invitations?: Invitation[] }).invitations ?? [])) {
      const status = String(inv.invitation_status ?? "").toLowerCase();
      if (!inv.vendor_id || status === "archived" || status === "declined") continue;
      if (!byVendor.has(inv.vendor_id)) byVendor.set(inv.vendor_id, String(inv.vendors?.vendor_name ?? ""));
    }
  }
  return [...byVendor.entries()].map(([id, name]) => ({ id, name }));
}

/**
 * Every carrier with a live place in the event, declined ones included: who
 * is already "in the RFx" for Carrier fit. Only archived invitations are out.
 */
export function participantsOf(lanes: RfxLane[] | undefined) {
  const ids = new Set<string>();
  for (const lane of lanes ?? []) {
    for (const inv of ((lane as { invitations?: Invitation[] }).invitations ?? [])) {
      if (inv.vendor_id && String(inv.invitation_status ?? "").toLowerCase() !== "archived") ids.add(inv.vendor_id);
    }
  }
  return ids;
}
