import { Link } from "react-router-dom";
import { tr } from "@/i18n/rate-tabs";
import { useLang } from "@/i18n/language";

const TABS = [
  { key: "review", to: "/tarifas", get label() { return tr("text001"); } },
  { key: "base", to: "/tarifario", get label() { return tr("text002"); } },
  { key: "files", to: "/archivos", get label() { return tr("text003"); } },
] as const;

export type RateTab = (typeof TABS)[number]["key"];

/** Un solo módulo «Tarifas»: tres pestañas que abren cada pantalla. */
export function RateTabs({ active }: { active: RateTab }) {
  useLang();
  return (
    <nav className="tabs tab-links" aria-label={tr("text004")}>
      {TABS.map((t) => (
        <Link key={t.key} to={t.to} className={t.key === active ? "active" : undefined} aria-current={t.key === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
