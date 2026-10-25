import { tr } from "@/i18n/dashboard";
import { useLang, locale } from "@/i18n/language";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/ui";
import { ModuleSearch } from "@/components/ModuleSearch";
import { useAsync } from "@/components/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { awaitsTeam, listShipperProjects } from "@/features/shipper-intake/intake.service";
import { dashboardSummary } from "./dashboard.service";

/** Where new work starts; the menu covers everything else. */
const STARTS = [
  {
    to: "/rfx/new",
    get title() { return tr("text017"); },
    get body() { return tr("text002"); },
  },
  {
    to: "/quotedesk",
    get title() { return tr("text018"); },
    get body() { return tr("text006"); },
  },
  {
    to: "/intake",
    get title() { return tr("text019"); },
    get body() { return tr("text001"); },
  },
];

const count = (value: number | undefined, loading: boolean) =>
  value === undefined ? (loading ? "…" : "—") : value.toLocaleString(locale());

/** Panel: what is waiting on the team today, and where new work starts. */
export function DashboardPage() {
  useLang();
  const { user } = useAuth();
  const fullName = String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "").trim();
  // "Jose Andres": the first two words of the name, or the address before the @.
  const name = fullName ? fullName.split(/\s+/).slice(0, 2).join(" ") : user?.email?.split("@")[0] ?? "";

  const summary = useAsync(dashboardSummary, []);
  const projects = useAsync(listShipperProjects, []);
  const s = summary.data;
  const carriers =
    s?.vendors !== undefined ? s.vendors - (s.archived_vendors ?? 0) : undefined;

  const fresh = projects.data?.filter(awaitsTeam).length;
  // Orange only for what is waiting on the team, and only when something is.
  const kpis = [
    {
      label: tr("text008"),
      value: count(fresh, projects.loading),
      to: "/intake",
      accent: !!fresh,
      hint: tr("text009"),
    },
    {
      label: tr("text020"),
      value: count(s?.pending_review, summary.loading),
      to: "/tarifas",
      accent: !!s?.pending_review,
      hint: tr("text021"),
    },
    {
      label: tr("text010"),
      value: count(s?.rfx_open_events, summary.loading),
      to: "/eventos",
      hint: tr("text011"),
    },
    {
      label: tr("text012"),
      value: count(s?.rfx_bids_since, summary.loading),
      to: "/eventos",
      hint: tr("text013"),
    },
    {
      label: "Carriers",
      value: count(carriers, summary.loading),
      to: "/crm",
      hint: tr("text014"),
    },
  ];

  return (
    <>
      <TopBar title="Panel" actions={<ModuleSearch />} />
      <main className="main">
        <div className="dash">
          <div className="dash-hello">
            <h2>{tr("text015")}{name ? `, ${name}` : ""}</h2>
            <p>{tr("text016")}</p>
          </div>

          <div className="dash-kpis">
            {kpis.map((k) => (
              <Link key={k.label} to={k.to} className={`dash-kpi${k.accent ? " accent" : ""}`} title={k.hint}>
                <span>{k.label}</span>
                <strong>{k.value}</strong>
              </Link>
            ))}
          </div>

          <div className="dash-modules">
            {STARTS.map((m) => (
              <Link key={m.to} to={m.to} className="dash-module">
                <i aria-hidden="true" />
                <b>{m.title}</b>
                <p>{m.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
