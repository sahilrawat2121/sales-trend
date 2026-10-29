export type Change = { percent: number | null; delta: number | null; direction: string; reason: string | null };
export type Monthly = {
  month: string; revenue: number; gross_revenue: number; returns: number; units: number;
  returned_units: number; sales_orders: number; orders: number; row_count: number;
  invalid_units: number; sma3: number | null; sma6: number | null;
  mom: Change; yoy: Change; units_mom: Change; units_yoy: Change;
  orders_mom: Change; orders_yoy: Change;
};
export type SalesData = {
  summary: { revenue: number; profit: number; orders: number; row_count: number; average_order_value: number };
  categories: string[];
  filter_options: { categories: string[]; regions: string[]; sales_channels: string[] };
  metadata: { currency: string; start_date: string | null; end_date: string | null; row_count: number; source: string; revision: string; partial_last_month?: boolean };
  analytics: {
    monthly: Monthly[]; latest: Monthly | null;
    seasonality: { status: string; eligible_years: number[]; peak_months: number[]; trough_months: number[];
      profile: { month: number; index: number }[]; matrix: { year: number; values: (number | null)[] }[] };
    demand: { category: string; units: number; sales_orders: number; revenue: number; returns: number;
      returned_units: number; unit_share: number | null; latest: Monthly }[];
    quarterly: { quarter: string; category: string; revenue: number; units: number; months: number }[];
  };
  transactions: { id: number; order_id: string; order_date: string; product_category: string;
    sales: number; quantity: number; region: string | null; sales_channel: string | null }[];
};
export type ForecastResult = {
  status: string; minimum_months?: number; available_months?: number; run_id?: string;
  model?: string; training_cutoff?: string; training_months?: number; partial_month_excluded?: boolean;
  diagnostic_warning?: string | null; currency?: string; cache_hit?: boolean;
  metrics?: { rmse: number; mape: number | null; seasonal_naive_rmse: number; mape_excluded_zeros: number };
  history?: Monthly[]; backtest?: { month: string; actual: number; predicted: number }[];
  forecast?: { forecast_date: string; predicted_sales: number; lower_bound_95: number; upper_bound_95: number }[];
};

export const filterKeys = ["category", "region", "sales_channel", "start", "end"] as const;
export type FilterKey = typeof filterKeys[number];
export const count = new Intl.NumberFormat("en-IN");
export const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
export const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function currencyFormatter(currency: string, abbreviated = false) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency", currency,
    ...(abbreviated ? { notation: "compact", maximumFractionDigits: 2, minimumFractionDigits: 0 } : {}),
  });
}

export function formatTooltipValue(value: unknown, currency?: string): string {
  if (value === undefined || value === null) return "N/A";
  function format(item: unknown) {
    const numeric = Number(item);
    return currency ? currencyFormatter(currency, Math.abs(numeric) >= 100_000).format(numeric) : count.format(numeric);
  }
  return Array.isArray(value) ? value.map(format).join(" to ") : format(value);
}