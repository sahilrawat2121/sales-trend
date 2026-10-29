"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact, count, currencyFormatter, formatTooltipValue, monthNames, type Change } from "../lib/sales";
import { Chart } from "./chart";
import { Money } from "./money";
import { useSales } from "./sales-provider";

export function Percentage({ value }: { value: Change }) {
  return <span className={`change ${value.direction}`} title={value.reason?.replaceAll("_", " ") || undefined}>
    {value.percent === null ? "N/A" : `${value.percent > 0 ? "+" : ""}${value.percent.toFixed(1)}%`}
  </span>;
}

export function GrowthView() {
  const { data } = useSales();
  if (!data) return null;
  const latest = data.analytics.latest;
  if (!latest) return <div className="empty"><h2>No months in this range</h2></div>;
  const rows = data.analytics.monthly;
  return <>
    <section className="metrics" aria-label="Growth indicators">
      {([ ["Revenue MoM", latest.mom], ["Revenue YoY", latest.yoy],
        ["Units MoM", latest.units_mom], ["Units YoY", latest.units_yoy] ] as const).map(([label, value]) =>
        <div className="metric" key={label}><span>{label}</span><strong><Percentage value={value} /></strong><small>Period ending {latest.month}</small></div>)}
    </section>
    <section className="analysis-section"><div className="section-heading"><div><p className="eyebrow">REVENUE TRAJECTORY</p><h2>Revenue &amp; moving averages</h2></div><span className="muted">{data.metadata.currency}</span></div>
      <Chart rows={rows} label="Revenue with moving averages" currency={data.metadata.currency} series={[
        { key: "revenue", label: "Net revenue", color: "#157f68" },
        { key: "sma3", label: "3-month average", color: "#487d9c", dashed: true },
        { key: "sma6", label: "6-month average", color: "#b18635", dashed: true },
      ]} />
    </section>
    <section className="analysis-section"><div className="section-heading"><div><p className="eyebrow">PERIOD COMPARISON</p><h2>Monthly growth</h2></div><span className="muted">Percent change</span></div>
      <Chart rows={rows.map(row => ({ month: row.month, mom: row.mom.percent, yoy: row.yoy.percent }))} label="Monthly and annual growth rates" series={[
        { key: "mom", label: "Month over month", color: "#157f68" },
        { key: "yoy", label: "Year over year", color: "#b18635" },
      ]} />
      <div className="table-scroll"><table><thead><tr><th>Month</th><th className="numeric">Net revenue</th><th className="numeric">MoM</th><th className="numeric">YoY</th><th className="numeric">Sold units</th></tr></thead>
        <tbody>{rows.toReversed().map(row => <tr key={row.month}><td>{row.month}</td><td className="numeric"><Money value={row.revenue} currency={data.metadata.currency} /></td><td className="numeric"><Percentage value={row.mom} /></td><td className="numeric"><Percentage value={row.yoy} /></td><td className="numeric">{count.format(row.units)}</td></tr>)}</tbody>
      </table></div>
    </section>
  </>;
}

export function SeasonalityView() {
  const { data } = useSales();
  if (!data) return null;
  const seasonal = data.analytics.seasonality;
  const money = currencyFormatter(data.metadata.currency);
  const maximum = Math.max(1, ...seasonal.matrix.flatMap(row => row.values.map(value => Math.abs(value || 0))));
  return <>
    <section className="analysis-section first-section"><div className="section-heading"><div><p className="eyebrow">CALENDAR COMPARISON</p><h2>Seasonal revenue matrix</h2></div><span className="muted">{data.metadata.currency}</span></div>
      <div className="table-scroll"><table className="seasonal-table"><thead><tr><th>Year</th>{monthNames.map(month => <th key={month}>{month.slice(0, 3)}</th>)}</tr></thead>
        <tbody>{seasonal.matrix.map(row => <tr key={row.year}><th scope="row">{row.year}</th>{row.values.map((value, index) => <td key={index} className="season-cell" title={value === null ? "Outside selected coverage" : money.format(value)} style={{ backgroundColor: value === null ? undefined : `rgba(${value < 0 ? "170,70,65" : "21,127,104"},${0.04 + Math.abs(value) / maximum * 0.32})` }}>{value === null ? "N/A" : compact.format(value)}</td>)}</tr>)}</tbody>
      </table></div>
      <div className="chart-footer"><span>Lower <span className="heat-scale" /> Higher revenue</span><span>N/A: outside selected coverage</span></div>
    </section>
    {seasonal.status !== "available" ? <div className="empty compact-empty"><h2>More complete years needed</h2><p>Seasonal profile requires two complete calendar years.</p></div> : <>
      <section className="metrics three-metrics">
        <div className="metric"><span>Peak months</span><strong className="word-value">{seasonal.peak_months.map(month => monthNames[month - 1]).join(", ")}</strong><small>Normalized monthly revenue</small></div>
        <div className="metric"><span>Lowest months</span><strong className="word-value">{seasonal.trough_months.map(month => monthNames[month - 1]).join(", ")}</strong><small>Normalized monthly revenue</small></div>
        <div className="metric"><span>Complete years</span><strong>{seasonal.eligible_years.length}</strong><small>{seasonal.eligible_years.join(" / ")}</small></div>
      </section>
      <section className="analysis-section"><div className="section-heading"><div><p className="eyebrow">DESCRIPTIVE SEASONALITY</p><h2>Month-of-year profile</h2></div><span className="muted">Annual monthly mean = 1</span></div>
        <Chart rows={seasonal.profile.map(row => ({ month: monthNames[row.month - 1].slice(0, 3), index: row.index }))} label="Normalized month of year profile" series={[{ key: "index", label: "Seasonal index", color: "#487d9c", area: true }]} />
        <p className="data-note">Observed seasonal comparisons, not a statistical confidence score. Partial calendar years are excluded from the profile.</p>
      </section>
    </>}
  </>;
}

const categoryColors = ["#157f68", "#487d9c", "#b18635", "#b06d85", "#6c7b3f"];

export function DemandView() {
  const { data } = useSales();
  if (!data) return null;
  const rows = data.analytics.monthly;
  const totals = rows.reduce((sum, row) => ({ units: sum.units + row.units, returns: sum.returns + row.returns,
    returned: sum.returned + row.returned_units, invalid: sum.invalid + row.invalid_units }), { units: 0, returns: 0, returned: 0, invalid: 0 });
  const quarters: Record<string, { month: string; [key: string]: string | number }> = {};
  for (const row of data.analytics.quarterly) {
    quarters[row.quarter] ||= { month: row.quarter };
    quarters[row.quarter][`category_${data.analytics.demand.findIndex(item => item.category === row.category)}`] = row.units;
  }
  return <>
    <section className="metrics three-metrics"><div className="metric"><span>Sold units</span><strong>{count.format(totals.units)}</strong><small>Positive-sale quantities</small></div>
      <div className="metric"><span>Return amount</span><strong><Money value={totals.returns} currency={data.metadata.currency} /></strong><small>Included in net revenue</small></div>
      <div className="metric"><span>Returned units</span><strong>{count.format(totals.returned)}</strong><small>Separate from sold units</small></div></section>
    <section className="analysis-section"><div className="section-heading"><div><p className="eyebrow">REALIZED DEMAND</p><h2>Units &amp; sales orders</h2></div><span className="muted">Monthly counts</span></div>
      <Chart rows={rows} label="Monthly sold units and sales orders" series={[{ key: "units", label: "Sold units", color: "#157f68" }, { key: "sales_orders", label: "Sales orders", color: "#487d9c" }]} />
    </section>
    <section className="analysis-section"><div className="section-heading"><div><p className="eyebrow">CATEGORY COMPARISON</p><h2>Category demand</h2></div><span className="muted">Latest change: {data.analytics.latest?.month}</span></div>
      <div className="table-scroll"><table><thead><tr><th>Category</th><th className="numeric">Sold units</th><th className="numeric">Sales orders</th><th className="numeric">Unit share</th><th className="numeric">Units MoM</th><th className="numeric">Units YoY</th><th className="numeric">Net revenue</th></tr></thead>
        <tbody>{data.analytics.demand.map(row => <tr key={row.category}><td>{row.category}</td><td className="numeric">{count.format(row.units)}</td><td className="numeric">{count.format(row.sales_orders)}</td><td className="numeric">{row.unit_share === null ? "N/A" : `${row.unit_share.toFixed(1)}%`}</td><td className="numeric"><Percentage value={row.latest.units_mom} /></td><td className="numeric"><Percentage value={row.latest.units_yoy} /></td><td className="numeric"><Money value={row.revenue} currency={data.metadata.currency} /></td></tr>)}</tbody>
      </table></div>
      {totals.invalid > 0 && <p className="data-note warning">{totals.invalid} positive-sale rows have nonpositive quantity and are excluded from unit demand.</p>}
    </section>
    <section className="analysis-section"><div className="section-heading"><div><p className="eyebrow">CATEGORY COMPOSITION</p><h2>Quarterly category mix</h2></div><span className="muted">Sold units / calendar quarter</span></div>
      <div className="chart" role="img" aria-label="Quarterly category unit mix"><ResponsiveContainer width="100%" height="100%"><BarChart data={Object.values(quarters).sort((first, second) => first.month.localeCompare(second.month))}>
        <CartesianGrid vertical={false} stroke="#e3e9e3" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tickFormatter={compact.format} tick={{ fontSize: 11 }} /><Tooltip formatter={value => formatTooltipValue(value)} /><Legend wrapperStyle={{ fontSize: 11 }} />
        {data.analytics.demand.map((row, index) => <Bar key={row.category} dataKey={`category_${index}`} name={row.category} stackId="units" fill={categoryColors[index % categoryColors.length]} isAnimationActive={false} />)}
      </BarChart></ResponsiveContainer></div>
      <p className="data-note">Demand reflects recorded sales, not unmet demand or stock availability. Category order counts can overlap.</p>
    </section>
  </>;
}