const change = { percent: 20, delta: 200, direction: "growth", reason: null };
export const monthly = ["2025-01", "2025-02"].map((month, index) => ({
  month, revenue: (index + 1) * 1000, units: 10 + index, orders: 5, sales_orders: 5,
  gross_revenue: 2100, returns: 100, returned_units: 1, row_count: 6, invalid_units: 0,
  had_transactions: true, profit: 200, sma3: index ? 1500 : null, sma6: null,
  mom: change, yoy: change, units_mom: change, units_yoy: change,
  orders_mom: change, orders_yoy: change,
}));

export const payload = {
  summary: { revenue: 3000, profit: 600, orders: 10, row_count: 12, average_order_value: 300 },
  categories: ["Furniture", "Technology"],
  filter_options: { categories: ["Furniture", "Technology"], regions: ["West", "East"], sales_channels: ["Online"] },
  metadata: { currency: "USD", start_date: "2023-01-01", end_date: "2025-02-28",
    row_count: 12, source: "test.csv", revision: "test" },
  monthly,
  analytics: {
    monthly, latest: monthly[1],
    seasonality: { status: "available", eligible_years: [2023, 2024], peak_months: [12],
      trough_months: [1], profile: [{ month: 1, index: 0.8 }, { month: 12, index: 1.2 }],
      matrix: [{ year: 2024, values: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, null, 1200] }] },
    demand: [{ category: "Furniture", units: 21, sales_orders: 10, revenue: 3000, returns: 100,
      returned_units: 1, unit_share: 100, latest: monthly[1] }],
    quarterly: [{ quarter: "2025Q1", category: "Furniture", revenue: 3000, units: 21, months: 2 }],
  },
  transactions: [{ id: 1, order_id: "001", order_date: "2025-02-01",
    product_category: "Furniture", sales: 1000, quantity: 2, region: "West", sales_channel: "Online" }],
};

export const forecast = {
  status: "ready", model: "SARIMAX", training_cutoff: "2025-01", horizon: 3,
  partial_month_excluded: true, currency: "USD", cache_hit: false,
  training_months: 30, evaluation_training_months: 24, training_start: "2022-08",
  holdout_start: "2024-08", interval: 0.95, diagnostic_warning: "Residual autocorrelation remains.",
  metrics: { rmse: 50, mape: 5, seasonal_naive_rmse: 60, mape_excluded_zeros: 0 },
  history: monthly,
  backtest: [{ month: "2025-01", actual: 1000, predicted: 950 }],
  forecast: [{ forecast_date: "2025-02-01", predicted_sales: 2200, lower_bound_95: 1800, upper_bound_95: 2600 }],
};