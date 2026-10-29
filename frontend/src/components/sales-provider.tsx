"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, BarChart3, CalendarDays, ChartNoAxesCombined, CircleHelp, Database, LayoutDashboard, RefreshCw, TrendingUp } from "lucide-react";
import { filterKeys, type FilterKey, type SalesData } from "../lib/sales";

type SalesContextValue = {
  data: SalesData | null; loading: boolean; error: boolean; query: string; refresh: () => void;
};
const SalesContext = createContext<SalesContextValue | null>(null);
const views = [
  { path: "/", label: "Overview", title: "Sales overview", icon: LayoutDashboard },
  { path: "/growth", label: "Growth & Decline", title: "Growth & decline", icon: TrendingUp },
  { path: "/seasonality", label: "Seasonality", title: "Seasonal patterns", icon: CalendarDays },
  { path: "/demand", label: "Demand", title: "Business demand", icon: BarChart3 },
  { path: "/forecasts", label: "Forecasts", title: "Sales forecasts", icon: ChartNoAxesCombined },
  { path: "/help", label: "Help", title: "Dashboard guide", icon: CircleHelp },
];

export function useSales() {
  const value = useContext(SalesContext);
  if (!value) throw new Error("SalesProvider is required");
  return value;
}

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHelp = pathname === "/help";
  const search = useSearchParams();
  const router = useRouter();
  const query = filterKeys.flatMap(key => search.get(key) ? [[key, search.get(key)!]] : []);
  const queryString = new URLSearchParams(query).toString();
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    if (isHelp) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(`/api/sales${queryString ? `?${queryString}` : ""}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const result: SalesData = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [queryString, revision, isHelp]);

  function setFilter(key: FilterKey, value: string) {
    const updated = new URLSearchParams(queryString);
    if (value) updated.set(key, value); else updated.delete(key);
    router.replace(`${pathname}${updated.size ? `?${updated}` : ""}`, { scroll: false });
  }
  const current = views.find(view => view.path === pathname) || views[0];
  const suffix = queryString ? `?${queryString}` : "";
  return <SalesContext.Provider value={{ data, loading, error, query: queryString, refresh }}>
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href={`/${suffix}`}><Activity strokeWidth={1.5} /><span>Sales Trend<span className="brand-note">ANALYTICS WORKSPACE</span></span></Link>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace">{views.map(({ path, label, icon: Icon }) =>
          <Link key={path} href={`${path}${suffix}`} className={`nav-link${path === pathname ? " active" : ""}`} aria-current={path === pathname ? "page" : undefined}>
            <Icon size={18} strokeWidth={1.5} />{label}
          </Link>)}</nav>
        <div className="database-note"><Database size={17} strokeWidth={1.5} /><div>Local warehouse<small>{data?.metadata.currency || "INR"} / historical sales</small></div></div>
      </aside>
      <div className="main-column">
        <header className="topbar"><span>Workspace <span className="separator">/</span><strong>{current.label}</strong></span><span className="status-badge">LOCAL</span></header>
        <main id="overview">
          <div className="page-heading"><div><p className="eyebrow">REVENUE INTELLIGENCE</p><h1>{current.title}</h1>
            <p className="period">{isHelp ? "Using the views, reading metrics, and interpreting forecasts" : <>{data?.metadata.start_date} {data?.metadata.end_date ? `to ${data.metadata.end_date}` : "Historical sales warehouse"}</>}</p></div>
            {!isHelp && <button className="icon-button" title="Refresh data" aria-label="Refresh data" disabled={loading} onClick={refresh}><RefreshCw size={18} strokeWidth={1.5} /></button>}
          </div>
          {!isHelp && <div className="filter-bar">
            {([ ["category", "Category", data?.filter_options.categories], ["region", "Region", data?.filter_options.regions],
              ["sales_channel", "Sales channel", data?.filter_options.sales_channels] ] as const).map(([key, label, options]) =>
              <label key={key}>{label}<select aria-label={label} value={search.get(key) || ""} disabled={loading} onChange={event => setFilter(key, event.target.value)}>
                <option value="">{key === "category" ? "All categories" : key === "region" ? "All regions" : "All sales channels"}</option>
                {options?.map(value => <option key={value}>{value}</option>)}
              </select></label>)}
            {([ ["start", "From month"], ["end", "Through month"] ] as const).map(([key, label]) =>
              <label key={key}>{label}<input type="month" aria-label={label} value={search.get(key) || ""}
                min={data?.metadata.start_date?.slice(0, 7)} max={data?.metadata.end_date?.slice(0, 7)}
                onChange={event => setFilter(key, event.target.value)} /></label>)}
            {queryString && <button className="text-button" onClick={() => router.replace(pathname, { scroll: false })}>Reset</button>}
          </div>}
          {!isHelp && data?.metadata.partial_last_month && (!search.get("end") || search.get("end")! >= data.metadata.end_date!.slice(0, 7)) && <p className="data-note warning boundary-note">Final covered month ({data.metadata.end_date!.slice(0, 7)}) is partial; period comparisons may not be like-for-like.</p>}
          {!isHelp && (loading ? <div className="empty" role="status">Loading sales data...</div>
            : error ? <div className="empty" role="alert"><h2>Sales data unavailable</h2><button onClick={refresh}>Retry</button></div>
            : !data || data.metadata.row_count === 0 ? <div className="empty"><h2>No sales data</h2></div>
            : null)}
          <div className="dashboard-content" hidden={!isHelp && (loading || error || !data || data.metadata.row_count === 0)}>{children}</div>
          {!isHelp && !loading && !error && data && data.metadata.row_count > 0 && <footer className="page-footer"><span><Database size={13} />{data.metadata.source}</span><span>{data.summary.row_count.toLocaleString("en-IN")} rows in view</span></footer>}
        </main>
      </div>
    </div>
  </SalesContext.Provider>;
}