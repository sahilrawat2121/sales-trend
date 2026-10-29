import warnings

import numpy as np
import pandas as pd
from statsmodels.stats.diagnostic import acorr_ljungbox
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.stattools import adfuller

MINIMUM_MONTHS = 30
MAX_ITERATIONS = 200


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    nonzero = actual != 0
    return {
        "rmse": float(np.sqrt(np.mean((actual - predicted) ** 2))),
        "mape": float(np.mean(np.abs((actual[nonzero] - predicted[nonzero]) /
                                     actual[nonzero])) * 100) if nonzero.any() else None,
        "mape_excluded_zeros": int((~nonzero).sum()),
    }


def fit_model(series: pd.Series, order: tuple, seasonal_order: tuple):
    with warnings.catch_warnings(record=True):
        fitted = SARIMAX(series, order=order, seasonal_order=seasonal_order,
                         enforce_stationarity=True, enforce_invertibility=True).fit(
                             disp=False, maxiter=MAX_ITERATIONS)
    if not fitted.mle_retvals.get("converged", False) or not np.isfinite(fitted.aic):
        raise ValueError("Model did not converge")
    return fitted


def forecast_series(rows: list[dict], horizon: int) -> dict:
    if len(rows) < MINIMUM_MONTHS:
        return {"status": "insufficient_history", "minimum_months": MINIMUM_MONTHS,
                "available_months": len(rows)}
    values = np.array([row["revenue"] for row in rows], dtype=float)
    if not np.isfinite(values).all() or np.std(values) < 1e-8:
        return {"status": "insufficient_signal"}
    series = pd.Series(values, index=pd.period_range(rows[0]["month"], periods=len(rows),
                                                    freq="M").to_timestamp())
    training_size = int(len(series) * 0.8)
    training, testing = series.iloc[:training_size], series.iloc[training_size:]
    try:
        differencing = int(adfuller(training)[1] > 0.05)
    except ValueError:
        differencing = 1
    candidates = [((1, differencing, 0), (1, 0, 0, 12)),
                  ((0, differencing, 1), (1, 0, 0, 12)),
                  ((1, differencing, 0), (0, 1, 0, 12))]
    successful = []
    for order, seasonal_order in candidates:
        try:
            fitted = fit_model(training, order, seasonal_order)
            successful.append((fitted.aic, order, seasonal_order, fitted))
        except (ValueError, RuntimeError, np.linalg.LinAlgError, OverflowError):
            continue
    if not successful:
        return {"status": "model_unavailable"}
    _, order, seasonal_order, fitted = min(successful, key=lambda item: item[0])
    try:
        predicted = np.asarray(fitted.get_forecast(steps=len(testing)).predicted_mean, dtype=float)
        if not np.isfinite(predicted).all():
            raise ValueError("Non-finite validation output")
        evaluation = metrics(testing.to_numpy(), predicted)
        seasonal_naive = np.resize(training.iloc[-12:].to_numpy(), len(testing))
        evaluation["seasonal_naive_rmse"] = metrics(testing.to_numpy(), seasonal_naive)["rmse"]
        refitted = fit_model(series, order, seasonal_order)
        future = refitted.get_forecast(steps=horizon)
        mean = np.asarray(future.predicted_mean, dtype=float)
        bounds = np.asarray(future.conf_int(alpha=0.05), dtype=float)
        if (not np.isfinite(mean).all() or not np.isfinite(bounds).all()
                or (bounds[:, 0] > mean).any() or (bounds[:, 1] < mean).any()):
            raise ValueError("Invalid predictive intervals")
    except (ValueError, RuntimeError, np.linalg.LinAlgError, OverflowError):
        return {"status": "model_unavailable"}
    residual_warning = None
    try:
        probability = float(acorr_ljungbox(np.asarray(refitted.resid),
                            lags=[min(12, max(1, len(series) // 5))], return_df=True)["lb_pvalue"].iloc[0])
        if np.isfinite(probability) and probability < 0.05:
            residual_warning = "Residual autocorrelation remains; interpret intervals cautiously."
    except (ValueError, ZeroDivisionError):
        residual_warning = "Residual diagnostic unavailable."
    future_dates = pd.date_range(series.index[-1] + pd.offsets.MonthBegin(1), periods=horizon, freq="MS")
    return {
        "status": "ready", "model": "SARIMAX", "order": list(order),
        "seasonal_order": list(seasonal_order), "interval": 0.95,
        "training_months": len(series), "evaluation_training_months": len(training),
        "training_start": rows[0]["month"], "training_cutoff": rows[-1]["month"],
        "holdout_start": testing.index[0].strftime("%Y-%m"),
        "metrics": evaluation, "diagnostic_warning": residual_warning,
        "backtest": [{"month": month.strftime("%Y-%m"), "actual": float(actual),
                      "predicted": float(prediction)}
                     for month, actual, prediction in zip(testing.index, testing, predicted)],
        "forecast": [{"forecast_date": month.strftime("%Y-%m-%d"),
                      "predicted_sales": float(value), "lower_bound_95": float(lower),
                      "upper_bound_95": float(upper)}
                     for month, value, (lower, upper) in zip(future_dates, mean, bounds)],
    }