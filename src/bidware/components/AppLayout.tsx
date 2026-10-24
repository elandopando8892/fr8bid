import { tr } from "@/i18n/common";

/**
 * The modules the Dashboard's search offers. In Fr8Bid the sidebar is Fr8Bid's
 * own menu (src/ui/comun.tsx); this list keeps the same paths: the RFx desk is
 * the Mesa (/eventos) and the Dashboard lives at /panel.
 */
export const NAV: { group: string; items: { to: string; label: string; end?: boolean }[] }[] = [
  {
    group: "Procurement",
    items: [
      { to: "/panel", label: "Dashboard", end: true },
      { to: "/shippers", label: "Shippers" },
      { to: "/intake", label: "Shipper intake" },
      { to: "/quotedesk", label: "QuoteDesk" },
      { to: "/eventos", label: "Eventos RFx" },
      { to: "/tarifas", get label() { return tr("text001"); } },
      { to: "/tarifario", get label() { return tr("text002"); } },
      { to: "/archivos", get label() { return tr("text003"); } },
      { to: "/crm", label: "Carrier CRM" },
      { to: "/templates", label: "Carrier templates" },
      { to: "/plantillas", get label() { return tr("text004"); } },
      { to: "/carrier-fit", label: "Carrier Fit" },
    ],
  },
  { get group() { return tr("text005"); }, items: [{ to: "/board", get label() { return tr("text006"); } }] },
  { group: "Admin", items: [{ to: "/integraciones", get label() { return tr("text007"); } }] },
];
