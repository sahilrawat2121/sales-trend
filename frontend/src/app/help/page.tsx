"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useSales } from "../../components/sales-provider";

const dashboards = [
  { path: "/", name: "Overview", description: "Start with total net revenue, reported profit, unique orders, and average order value. Use the monthly chart to find changes, then inspect the latest transaction rows." },
  { path: "/growth", name: "Growth & Decline", description: "Compare the latest month with the previous month (MoM) and the same month last year (YoY). Use the 3- and 6-month moving averages to separate short-term movement from the longer trend." },
  { path: "/seasonality", name: "Seasonality", description: "Compare the same months across years in the revenue matrix. The normalized profile highlights observed high and low months; an index of 1 means that year's monthly average. At least two complete calendar years are needed for this profile." },
  { path: "/demand", name: "Demand", description: "Inspect sold units and sales orders, category unit shares, and quarterly category mix. A revenue increase without a unit increase is not necessarily stronger demand. Return amounts and quantities are shown separately." },
  { path: "/forecasts", name: "Forecasts", description: "Generate a 3-, 6-, or 12-month revenue projection for your selected category, region, and channel. Read the prediction interval, backtest errors, and baseline comparison before using the estimate." },
];
const topics = [
  ["getting-started", "Getting started"], ["views", "Dashboard views"], ["filters", "Filters"],
  ["numbers", "Numbers"], ["metrics", "Metrics"], ["forecasting", "Forecast workflow"], ["questions", "Questions"],
];

export default function Help() {
  const { query } = useSales();
  const suffix = query ? `?${query}` : "";
  return <article className="help-guide">
    <nav className="help-toc" aria-label="Guide topics">{topics.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
    <section className="help-section" id="getting-started"><h2>Getting started</h2>
      <ol><li>Open Overview for a business-wide summary.</li><li>Select a category, region, sales channel, and month range to narrow the analysis. Leave a filter at All for the business-wide view.</li><li>Switch to Growth &amp; Decline, Seasonality, or Demand to investigate the change. Your filter selections stay with you.</li><li>Use Forecasts when you need a future revenue estimate, then check its evaluation and warnings.</li></ol>
    </section>
    <section className="help-section" id="views"><h2>Dashboard views</h2><dl className="help-views">{dashboards.map(view => <div key={view.path}>
      <dt><Link href={`${view.path}${suffix}`}>{view.name}<ArrowUpRight size={13} aria-hidden="true" /></Link></dt><dd>{view.description}</dd>
    </div>)}</dl></section>
    <section className="help-section" id="filters"><h2>Filters &amp; date ranges</h2>
      <ul><li><strong>Category, Region, Sales channel:</strong> combine filters to inspect a particular business segment. All displayed results follow the selected scope.</li><li><strong>From month / Through month:</strong> both months are included. The start month must not follow the end month. Clear the date fields to use the available coverage.</li><li><strong>Navigation:</strong> filter selections are included in the URL, so they survive view changes and browser refreshes. Share the filtered URL to reopen the same selection.</li><li><strong>Reset:</strong> clears every filter. <strong>Refresh data:</strong> reloads the imported warehouse; it does not import a new CSV or automatically refit a forecast.</li><li><strong>Earlier history:</strong> moving averages and growth comparisons can use months before the visible start. Forecast training uses all earlier covered history through the selected end month, not just the displayed range.</li></ul>
    </section>
    <section className="help-section" id="numbers"><h2>Reading the numbers</h2>
      <p>Large monetary values are abbreviated so totals, tables, and chart tooltips stay readable. The underlying values and calculations are unchanged. Hover over a KPI or table amount to see its full two-decimal value; screen readers receive that full value.</p>
      <table className="help-glossary"><thead><tr><th>Unit</th><th>Name</th><th>Meaning</th></tr></thead><tbody>
        <tr><td>K</td><td>Thousand</td><td>1,000</td></tr><tr><td>L</td><td>Lakh</td><td>1,00,000 (100,000)</td></tr><tr><td>Cr</td><td>Crore</td><td>1,00,00,000 (10,000,000)</td></tr><tr><td>M / B</td><td>Million / Billion</td><td>Used for international currency abbreviations</td></tr>
      </tbody></table>
      <p>For example, ₹381.43Cr is about 381.43 crore rupees; ₹12.5L is 12.5 lakh rupees. Totals sum the selected transactions, not an average month. INR uses Indian digit grouping; currency follows the imported dataset.</p>
    </section>
    <section className="help-section" id="metrics"><h2>Metric definitions</h2>
      <dl className="help-definitions"><dt>Net revenue</dt><dd>Sales including negative-sale returns. A large total covers every selected transaction and month.</dd>
        <dt>Reported profit</dt><dd>The sum of supplied profit values. Missing profit is not estimated.</dd><dt>Unique orders / Average order value</dt><dd>Orders are distinct order IDs. Average order value is net revenue divided by unique orders; it is not revenue per transaction row.</dd>
        <dt>MoM / YoY</dt><dd>Percentage change from the previous calendar month / the same calendar month one year earlier. Positive means growth, negative means decline, and zero means flat. N/A means a valid positive comparison baseline is unavailable.</dd>
        <dt>3- / 6-month moving average</dt><dd>Average net revenue over the current month and the preceding 2 / 5 months. A full window is required. Covered months with no transactions count as zero.</dd>
        <dt>Sold units / Sales orders</dt><dd>Units come from positive-sale rows with positive quantities. Sales orders count distinct orders with positive sales. These describe recorded demand, not unmet demand or inventory availability.</dd>
        <dt>Unit share / Returns</dt><dd>Category unit share is its portion of selected sold units. Returns show the magnitude of negative-sale amounts and returned quantities separately. An order spanning categories can appear in more than one category's order count.</dd>
      </dl>
    </section>
    <section className="help-section" id="forecasting"><h2>Generating a forecast</h2>
      <ol><li>Open Forecasts and choose the category, region, and channel. Set Through month if you want a historical training cutoff.</li><li>Choose 3, 6, or 12 months in Forecast horizon, then select Generate forecast.</li><li>Check the effective training cutoff. The model excludes partial source boundary months, requires at least 30 complete monthly observations, and starts predictions in the following month, not necessarily today's month.</li><li>Inspect the dashed forecast and shaded monthly 95% prediction interval. The interval is conditional model uncertainty, not a guarantee; net-revenue estimates and lower bounds may be negative.</li><li>Read Forecast evaluation. RMSE is an error amount in the dataset currency; lower is better. MAPE is a percentage error, excluding zero actuals. Compare model RMSE with the seasonal-naive baseline: a larger model error means it underperformed that simple baseline.</li></ol>
      <p>The evaluation uses the first 80% of eligible history for training and the last 20% for testing. The selected model is then refitted on all eligible pre-cutoff history. Changing filters or horizon requires generating the matching forecast again; identical successful requests can reuse a saved run. Do not add monthly interval bounds together and interpret them as a quarterly 95% interval.</p>
    </section>
    <section className="help-section" id="questions"><h2>Common questions</h2>
      <details><summary>Why is a growth percentage N/A?</summary><p>There may be no earlier comparison month, or its revenue/units may be zero or negative. A percentage is not meaningful against that baseline. Hover over N/A for the reason.</p></details>
      <details><summary>Why is the latest month marked partial?</summary><p>The source stops before that calendar month ends. A lower total may reflect fewer covered days rather than declining business. Compare complete months instead; forecasting excludes the partial month automatically.</p></details>
      <details><summary>Why is the seasonal profile unavailable?</summary><p>Your selected range needs at least two complete calendar years with positive annual revenue means. Widen the date range. The matrix can still show partial years; observed seasonal patterns do not prove a cause.</p></details>
      <details><summary>Why can a forecast be unavailable?</summary><p>The scope may lack 30 complete months, contain too little variation, or fail model convergence or interval checks. Widen the scope or cutoff when appropriate. If the service fails, use Generate forecast again; if data changed during fitting, regenerate against the new import.</p></details>
      <details><summary>What do the residual and baseline warnings mean?</summary><p>Residual autocorrelation means the model has not explained all time-related structure. A worse error than the seasonal-naive baseline means extra model complexity did not improve that holdout. Treat projections cautiously and review the underlying history before making decisions.</p></details>
      <details><summary>Why are some months zero, while other cells show N/A?</summary><p>The dataset is assumed complete within its declared coverage, so an internal month without sales is zero. N/A cells lie outside the selected coverage or lack a valid calculation window; no earlier or later history is invented.</p></details>
    </section>
  </article>;
}