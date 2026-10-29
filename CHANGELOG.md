# Changelog

## Unreleased

### Added

- Help navigation and an API-independent dashboard guide covering all five views, filters, compact number units, metric definitions, forecasts, and troubleshooting.

### Fixed

- Long monetary KPIs and revenue/prediction tables now use compact lakh/crore or international currency notation while retaining exact hover and accessible values.
- Revenue and forecast chart hover tooltips now format currency and interval ranges instead of displaying raw ungrouped numbers; demand hover counts use digit grouping.

## 0.2.0 - 2026-10-14

### Added

- Historical INR CSV adapter, nullable source customer identity, region/channel dimensions, bounded streaming, and tested legacy SQLite migration.
- Verified import of 100,000 supplied transactions across 33 months; transactional dataset revision metadata and exact row/revenue/unit reconciliation.
- Calendar-based MoM/YoY growth/decline, 3/6-month moving averages, zero-sales calendar gaps, normalized seasonal profiles and year/month matrix.
- Realized unit/order demand, category shares, quarterly category mix and separated return measures.
- Five independent Next.js dashboards with shared URL category/region/channel/month filters and INR formatting.
- Explicit 3/6/12-month SARIMAX forecasts with chronological holdout metrics, seasonal-naive comparison, convergence/interval checks and monthly 95% predictive intervals.
- Forecast run persistence, input/revision-aware reuse, partial-month exclusion, safe error/insufficient-history states and atomic metrics export.
- Expanded hermetic backend/frontend tests, coverage gates and real-data browser/model smoke checks.

### Changed

- Default input is the supplied historical CSV; the original USD demo remains available through `--csv`.
- Missing covered months represent zero sales, not unknown values or interpolation. Forecast training uses all pre-cutoff history independent of display start.
- Latest partial-month comparisons and residual diagnostic limitations are surfaced explicitly.

## 0.1.0 - 2026-10-14

### Added

- Isolated Python environment, runtime/development requirements, and >=80% test coverage gates.
- Explicit SQLite/SQLAlchemy raw sales schema with a primary key and order-date index.
- Validated CSV ingestion with atomic replacement, preserved raw returns/line items, safe CLI failures, and chunking above 500 MiB.
- Clearly labeled 24-row synthetic sample CSV.
- Separate Next.js frontend and Python FastAPI backend with category-filtered raw revenue summaries.
- Responsive dashboard, monthly chart, recent transactions, loading/empty/error states, refresh, and retry.
- Setup, local run instructions, and architecture diagram. Next.js replaces the planned Power BI integration; forecasting remains deferred.