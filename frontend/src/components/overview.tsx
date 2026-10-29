"use client";

import { count } from "../lib/sales";
import { Chart } from "./chart";
import { Money } from "./money";
import { useSales } from "./sales-provider";

export default function Overview() {
  const { data } = useSales();
  if (!data) return null;
  return <>
    <section className="metrics" aria-label="Sales metrics">
      <div className="metric"><span>Total revenue</span><strong><Money value={data.summary.revenue} currency={data.metadata.currency} /></strong><small>Net of returns</small></div>
      <div className="metric"><span>Unique orders</span><strong>{count.format(data.summary.orders)}</strong><small>{count.format(data.summary.row_count)} transaction rows</small></div>
      <div className="metric"><span>Reported profit</span><strong><Money value={data.summary.profit} currency={data.metadata.currency} /></strong><small>Across imported transactions</small></div>
      <div className="metric"><span>Average order value</span><strong><Money value={data.summary.average_order_value} currency={data.metadata.currency} /></strong><small>Revenue / unique orders</small></div>
    </section>
    <section className="revenue-section"><div className="section-heading"><div><p className="eyebrow">PERFORMANCE</p><h2>Revenue over time</h2></div><span className="muted">{data.metadata.currency} / month</span></div>
      <Chart rows={data.analytics.monthly} label="Monthly revenue chart" currency={data.metadata.currency} series={[{ key: "revenue", label: "Net revenue", color: "#157f68", area: true }]} />
      <div className="chart-footer"><span>Monthly aggregation / zero-sales months included</span><span>{data.analytics.monthly.length} months</span></div>
    </section>
    <section id="transactions" className="transactions"><div className="section-heading"><div><p className="eyebrow">WAREHOUSE</p><h2>Recent transactions</h2></div><span className="muted">Latest {data.transactions.length} rows</span></div>
      <div className="table-scroll"><table><thead><tr><th>Order</th><th>Date</th><th>Category</th><th>Region</th><th>Channel</th><th className="numeric">Units</th><th className="numeric">Revenue</th></tr></thead>
        <tbody>{data.transactions.map(row => <tr key={row.id}><td className="order-id">{row.order_id}</td><td>{row.order_date}</td><td>{row.product_category}</td><td>{row.region || "Unknown"}</td><td>{row.sales_channel || "Unknown"}</td><td className="numeric">{row.quantity}</td><td className="numeric"><Money value={row.sales} currency={data.metadata.currency} /></td></tr>)}</tbody>
      </table></div>
    </section>
  </>;
}