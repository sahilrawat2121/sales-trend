# Sales Trend

Local historical sales analysis and evaluated forecasting. Python/FastAPI is the backend; a separate Next.js frontend provides five dashboards in place of Power BI. Version 0.2.0 includes growth, decline, seasonality, category demand, and monthly SARIMAX revenue forecasts.

## Requirements

- Python 3.10+ (verified locally with 3.13)
- Node.js 22.12+ and npm (verified locally with Node 26)
- No external database or cloud account required

## Setup and Import

Run from the repository root in PowerShell:

```powershell
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
& .\.venv\Scripts\python.exe -m src.ingestion
npm --prefix frontend ci
```

The default input is `data/raw/sales_data_huge.csv`, the supplied historical dataset. The verified import contains **100,000 rows**, January 1, 2023 through September 26, 2025 (33 calendar months), five categories, five regions, and three channels. Sales reconcile to **INR 3,814,331,912.55** and quantity to **300,488**. September 2025 is partial.

The historical adapter maps `Order_ID`, `Order_Date`, `Category`, `Quantity`, `Sales_Amount_INR`, and `Profit_INR` to canonical names. It divides `Discount_Percent` by 100 and retains `Product`, `Region`, and `Sales_Channel`. Monetary values are INR; discounts are not applied to sales a second time. No customer IDs exist in this source, so they remain null rather than invented. Extra payment/unit-price/cost columns are not required for these dashboards and are not imported.

The original `data/raw/sales_data.csv` remains a **24-row synthetic USD demo**, supported via `--csv`. Its canonical columns are:

```text
order_id,order_date,customer_id,product_category,sales,quantity,discount,profit
```

Dates use `YYYY-MM-DD`; identifiers retain leading zeros. Required text fields cannot be blank, sales and quantity cannot be null, quantity must be integral, and numeric fields must be finite. Historical discounts must be between 0 and 100 before conversion. Nullable canonical discount/profit are supported. Negative sales and repeated order IDs are preserved, because order IDs can represent multiple line items. There is no speculative deduplication or profit imputation.

The SQLAlchemy schema creates `raw_sales_data` and date/region/channel indexes in `data/sales_warehouse.db`. A tested transactional SQLite migration preserves existing legacy rows while evolving the schema. Every CSV is streamed in **50,000-row chunks**. Successful imports **replace all previous raw rows** and update dataset revision/coverage metadata atomically. A failed or empty import rolls back replacement. Cached forecasts are isolated by dataset revision and input fingerprint. Never use this replacement workflow against data you need to retain.

Alternate input:

```powershell
& .\.venv\Scripts\python.exe -m src.ingestion --csv "path\to\sales.csv"
```

## Run Backend and Frontend

Start each in a separate terminal from the repository root:

```powershell
& .\.venv\Scripts\python.exe -m uvicorn src.api:app --host 127.0.0.1 --port 8000
```

```powershell
npm --prefix frontend run dev -- --hostname 127.0.0.1 --port 3000
```

- Dashboard: http://127.0.0.1:3000
- Backend API docs: http://127.0.0.1:8000/docs
- Historical data: `GET /sales`, optional `category`, `region`, `sales_channel`, `start`, `end` filters
- Explicit forecast generation: `POST /forecasts` with optional category/region/channel/end and `horizon` of 3, 6, or 12

The Next.js server proxies `/api/sales` and `/api/forecasts` to Python. `SALES_API_URL` is a **server-only** environment variable, defaulting to `http://127.0.0.1:8000`. Set it in `frontend/.env.local` for another backend port and restart Next.js. No browser CORS configuration is needed. Historical reads have a ten-second upstream timeout; explicit forecast requests allow 120 seconds. The backend always opens the project-local SQLite warehouse.

## Dashboard Views

| Route | View |
| --- | --- |
| `/` | Overview: revenue, profit, distinct orders, average order value, monthly revenue, latest ten rows |
| `/growth` | Growth & Decline: revenue/unit MoM and YoY, 3/6-month moving averages, monthly comparison table |
| `/seasonality` | Seasonality: year/month revenue matrix, normalized monthly profile, observed peaks/troughs |
| `/demand` | Demand: sold units/orders, category unit shares and growth, quarterly mix, returns |
| `/forecasts` | Forecasts: generate a 3/6/12-month revenue forecast, monthly 95% interval, holdout evaluation |
| `/help` | Help: dashboard usage, filters, number units, metric definitions, forecast interpretation and troubleshooting |

Category, region, sales-channel and month-range filters are preserved in the URL across views and browser navigation. Start/end are inclusive `YYYY-MM` display months. Growth and averages use earlier history before the displayed start where necessary. Filtered periods with no sales still have zero monthly values within source coverage. Currency follows the dataset (INR for supplied history, USD for legacy demo); mixed-currency warehouses are rejected.

Open **Help** in the navigation for the in-app guide. It does not require a working data API, and its dashboard links retain your selected filters. Large monetary values in KPIs, tables and chart tooltips use compact units (for example `₹381.43Cr`, `₹12.5L`, or `$1.25M`). Hover over KPI/table amounts to inspect their full two-decimal value; assistive technology reads the full amount. Small monetary values stay precise. Calculations and source data are unchanged.

## Metric Policies

- Missing months **inside dataset coverage are zero**, following the complete-data assumption. No interpolation or pre-coverage history is invented.
- Revenue is net of negative sales. Returns show a positive amount separately. Demand uses positive-sale rows with positive quantities; return-unit magnitude is reported separately. Nonpositive quantities on positive-sale rows are flagged and excluded from units, not silently repaired.
- MoM/YoY match calendar months, not adjacent nonempty rows. Percentages require a positive baseline; zero, negative, and absent baselines show `N/A` with a reason. Absolute changes remain available in the API. Moving averages require a full 3/6-month window.
- Distinct orders across categories may overlap and must not be summed into business-wide orders. Units reflect recorded demand, not stockouts, unmet demand, or product-level market demand. Null profit is omitted from profit sums.
- Seasonal profiles require two complete calendar years with positive annual revenue means. Each month is normalized by its year's monthly mean before averaging. Patterns are descriptive, not a statistical confidence score. Partial years remain visible in the matrix.
- Partial final months are flagged in dashboards; unadjusted comparisons can differ because of incomplete coverage.

## Forecasting

Use **Generate forecast** explicitly; opening historical views never fits a model. Training uses all covered history for the selected category/region/channel through the selected end month, independent of display start. Partial source boundary months are excluded. For this file, default training is January 2023 through **August 2025**, so forecasts start September 2025, not the current wall-clock date.

At least **30 complete monthly observations** are required, leaving at least 24 training months for the chronological 80/20 evaluation split. A training-only ADF test guides differencing. Up to three predeclared annual SARIMAX candidates are fitted with a 200-iteration cap and selected by training AIC among converged models. The selected specification is evaluated on the held-out tail, then refitted on the full eligible history. Insufficient history/signal or failed convergence returns a clear unavailable state, not fabricated fallback values.

The view reports RMSE, MAPE (zero actuals excluded, excluded count reported), a seasonal-naive RMSE baseline, backtest actuals/predictions, and residual diagnostic warnings. The initial all-data run converged with approximately **3.27% holdout MAPE**, but slightly underperformed the seasonal-naive RMSE baseline and retained residual autocorrelation. This is evaluation evidence, not a production accuracy guarantee.

Successful runs are persisted in `forecast_runs` and `sales_forecasts`, with scope, cutoff, horizon, dataset revision, input fingerprint and monthly bounds. Repeated identical requests reuse the saved result. A dataset change during fitting rejects the result. `outputs/metrics.json` contains the latest successfully generated run and metrics; SQLite remains authoritative. Net-revenue forecasts and bounds may be negative. Monthly 95% predictive intervals are conditional on the model, not guaranteed outcomes or joint quarterly intervals.

## Validation

```powershell
& .\.venv\Scripts\python.exe -m pytest tests --cov=src --cov-report=term-missing --cov-fail-under=80
& .\.venv\Scripts\python.exe -m ruff check src tests
npm --prefix frontend run test:coverage
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend audit
```

Backend tests use in-memory SQLite, mocked CSV reads and mocked fitted models; frontend tests mock HTTP/chart rendering. Coverage gates require at least 80% across changed logic. Real import reconciliation and a real statsmodels fit are separate smoke checks, not network/filesystem-dependent unit tests. Build and browser checks validate actual charts and responsive views. CI/deployment has not been configured; these commands are the local validation gates. This unauthenticated setup is for local development only. Bind services to loopback, not public interfaces.

## Structure and Extension

- `src/db_connector.py`: authoritative SQLAlchemy table and local engine
- `src/ingestion.py`: CSV validation and transactional import
- `src/schema_migrations.py`: legacy SQLite schema evolution
- `src/sales_repository.py`: shared SQL aggregation, scope and coverage
- `src/trend_analysis.py`: pure growth, seasonality and demand calculations
- `src/forecasting.py`: bounded SARIMAX selection/evaluation/prediction
- `src/forecast_service.py`: scoped generation, persistence, revision checks and export
- `src/api.py`: historical reads and explicit forecast generation
- `frontend/`: separate Next.js App Router application and tests
- `tests/`: Python ingestion/API tests
- `data/raw/`: CSV input; the generated warehouse is ignored by Git

Add business rules in tested Python modules and views in `frontend/src/app`; do not reimplement forecasting in the browser. SQL aggregates are computed on demand rather than stored as stale processed copies. See [ARCHITECTURE.md](ARCHITECTURE.md) and [CHANGELOG.md](CHANGELOG.md).