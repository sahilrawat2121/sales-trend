"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { type ForecastResult } from "../lib/sales";
import { Chart } from "./chart";
import { Money } from "./money";
import { useSales } from "./sales-provider";

export default function ForecastView() {
  const { data, query } = useSales();
  const [horizon, setHorizon] = useState(12);
  const [saved, setSaved] = useState<{ key: string; value: ForecastResult } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const key = `${query}/${horizon}/${data?.metadata.revision}`;
  const result = saved?.key === key ? saved.value : null;
  const busy = pending === key;
  useEffect(() => () => controller.current?.abort(), [key]);

  async function generate() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setPending(key);
    try {
      const payload: Record<string, string | number> = { horizon };
      const params = new URLSearchParams(query);
      for (const name of ["category", "region", "sales_channel", "end"]) {
        const value = params.get(name);
        if (value) payload[name] = value;
      }
      const response = await fetch("/api/forecasts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: request.signal,
      });
      if (!response.ok) throw new Error("Unavailable");
      const value: ForecastResult = await response.json();
      if (!request.signal.aborted) setSaved({ key, value });
    } catch {
      if (!request.signal.aborted) setSaved({ key, value: { status: "error" } });
    } finally {
      if (!request.signal.aborted) setPending(null);
    }
  }
  if (!data) return null;
  const plot = new Map<string, { month: string; actual?: number; predicted?: number; interval?: [number, number] }>();
  for (const row of data.analytics.monthly) plot.set(row.month, { month: row.month, actual: row.revenue });
  if (result?.status === "ready") {
    const anchor = plot.get(result.training_cutoff!);
    if (anchor) anchor.predicted = anchor.actual;
    for (const row of result.forecast!) {
      const month = row.forecast_date.slice(0, 7);
      plot.set(month, { ...plot.get(month), month, predicted: row.predicted_sales, interval: [row.lower_bound_95, row.upper_bound_95] });
    }
  }
  return <>
    <section className="forecast-toolbar"><label>Forecast horizon<select aria-label="Forecast horizon" value={horizon} disabled={busy} onChange={event => setHorizon(Number(event.target.value))}>
      {[3, 6, 12].map(value => <option key={value} value={value}>{value} months</option>)}
    </select></label><button className="primary-button" onClick={generate} disabled={busy}><RefreshCw size={15} />{busy ? "Generating forecast..." : "Generate forecast"}</button></section>
    {busy ? <div className="empty" role="status">Fitting and evaluating the model...</div>
      : !result ? <div className="empty compact-empty"><h2>No forecast generated</h2></div>
      : result.status !== "ready" ? <div className="empty compact-empty" role="alert"><h2>{result.status === "insufficient_history" ? "Insufficient history" : "Forecast unavailable"}</h2><p>{result.status === "insufficient_history" ? `At least ${result.minimum_months} complete months are required.` : result.status === "insufficient_signal" ? "The selected series has insufficient variation." : result.status === "no_data" ? "No historical data for the selected scope." : "No validated model result is available for this request."}</p></div>
      : <>
        <section className="analysis-section first-section"><div className="section-heading"><div><p className="eyebrow">FORWARD OUTLOOK</p><h2>Revenue forecast</h2></div><span className="muted">{result.model} / {data.metadata.currency} / monthly 95% interval</span></div>
          <Chart rows={Array.from(plot.values()).sort((first, second) => first.month.localeCompare(second.month))} label="Actual revenue and forecast with prediction interval" currency={data.metadata.currency} interval series={[{ key: "actual", label: "Actual revenue", color: "#157f68" }, { key: "predicted", label: "Forecast", color: "#487d9c", dashed: true }]} />
          <div className="chart-footer"><span>Training through {result.training_cutoff} / {result.training_months} months</span><span>{result.cache_hit ? "Saved run" : "Evaluated run"}</span></div>
          {result.partial_month_excluded && <p className="data-note">Partial boundary month excluded from training. Effective cutoff: {result.training_cutoff}.</p>}
          {result.diagnostic_warning && <p className="data-note warning">{result.diagnostic_warning}</p>}
          <p className="data-note">Intervals describe conditional model uncertainty, not guaranteed outcomes. Net-revenue predictions and bounds may be negative.</p>
        </section>
        <section className="analysis-section"><div className="section-heading"><div><p className="eyebrow">CHRONOLOGICAL HOLDOUT</p><h2>Forecast evaluation</h2></div><span className="muted">80% train / 20% test</span></div>
          <div className="metrics three-metrics"><div className="metric"><span>Holdout RMSE</span><strong><Money value={result.metrics!.rmse} currency={data.metadata.currency} /></strong><small>Lower is better</small></div>
            <div className="metric"><span>Holdout MAPE</span><strong>{result.metrics!.mape === null ? "N/A" : `${result.metrics!.mape.toFixed(2)}%`}</strong><small>{result.metrics!.mape_excluded_zeros} zero actuals excluded</small></div>
            <div className="metric"><span>Seasonal-naive RMSE</span><strong><Money value={result.metrics!.seasonal_naive_rmse} currency={data.metadata.currency} /></strong><small>Comparison baseline</small></div></div>
          <Chart rows={result.backtest!} label="Holdout actual and predicted sales" currency={data.metadata.currency} series={[{ key: "actual", label: "Holdout actual", color: "#157f68" }, { key: "predicted", label: "Holdout prediction", color: "#b18635", dashed: true }]} />
        </section>
        <section className="analysis-section"><div className="section-heading"><h2>Monthly predictions</h2><span className="muted">95% prediction interval</span></div>
          <div className="table-scroll"><table><thead><tr><th>Month</th><th className="numeric">Forecast</th><th className="numeric">Lower bound</th><th className="numeric">Upper bound</th></tr></thead>
            <tbody>{result.forecast!.map(row => <tr key={row.forecast_date}><td>{row.forecast_date.slice(0, 7)}</td><td className="numeric"><Money value={row.predicted_sales} currency={data.metadata.currency} /></td><td className="numeric"><Money value={row.lower_bound_95} currency={data.metadata.currency} /></td><td className="numeric"><Money value={row.upper_bound_95} currency={data.metadata.currency} /></td></tr>)}</tbody>
          </table></div>
        </section>
      </>}
  </>;
}