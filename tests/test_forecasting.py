from datetime import date
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd
import pytest

from src.forecasting import forecast_series, metrics


def history(months=33):
    return [{"month": str(month), "revenue": 100 + index + (index % 12) * 5}
            for index, month in enumerate(pd.period_range("2023-01", periods=months, freq="M"))]


class FakeFit:
    aic = 10.0
    resid = np.arange(24, dtype=float)

    def __init__(self):
        self.mle_retvals = {"converged": True}

    def get_forecast(self, steps):
        return Mock(predicted_mean=np.full(steps, 150.0),
                    conf_int=Mock(return_value=np.tile([100.0, 200.0], (steps, 1))))


def test_evaluation_masks_zero_actuals():
    result = metrics(np.array([0, 100, -100]), np.array([5, 90, -90]))
    assert result["mape"] == pytest.approx(10)
    assert result["mape_excluded_zeros"] == 1
    assert result["rmse"] == pytest.approx(np.sqrt(75))
    assert metrics(np.zeros(2), np.zeros(2))["mape"] is None


@pytest.mark.parametrize("months", [0, 12, 24, 29])
def test_insufficient_history(months):
    assert forecast_series(history(months), 12)["status"] == "insufficient_history"


def test_no_signal():
    rows = [{**row, "revenue": 0} for row in history()]
    assert forecast_series(rows, 12)["status"] == "insufficient_signal"


def test_holdout_refit_and_prediction_intervals():
    with patch("src.forecasting.SARIMAX") as model, patch(
        "src.forecasting.adfuller", return_value=(0, 0.01)
    ):
        model.return_value.fit.return_value = FakeFit()
        result = forecast_series(history(), 6)
    assert result["status"] == "ready"
    assert len(result["forecast"]) == 6
    assert result["forecast"][0]["forecast_date"] == "2025-10-01"
    assert result["forecast"][-1]["forecast_date"] == "2026-03-01"
    assert result["forecast"][0]["lower_bound_95"] == 100
    assert result["forecast"][0]["upper_bound_95"] == 200
    training = model.call_args_list[0].args[0]
    assert len(training) == 26
    assert training.index.max().date() == date(2025, 2, 1)
    assert len(model.call_args_list[-1].args[0]) == 33
    assert len(result["backtest"]) == 7
    assert result["metrics"]["seasonal_naive_rmse"] >= 0


def test_nonconvergence_is_not_a_fake_forecast():
    failed = FakeFit()
    failed.mle_retvals = {"converged": False}
    with patch("src.forecasting.SARIMAX") as model, patch(
        "src.forecasting.adfuller", side_effect=ValueError
    ):
        model.return_value.fit.return_value = failed
        assert forecast_series(history(), 3)["status"] == "model_unavailable"


def test_nonfinite_and_reversed_intervals_rejected():
    for bounds in ([200, 100], [float("nan"), 200]):
        fitted = FakeFit()
        fitted.get_forecast = lambda steps, bounds=bounds: Mock(
            predicted_mean=np.full(steps, 150.0),
            conf_int=Mock(return_value=np.tile(bounds, (steps, 1))),
        )
        with patch("src.forecasting.SARIMAX") as model, patch(
            "src.forecasting.adfuller", return_value=(0, 0.01)
        ):
            model.return_value.fit.return_value = fitted
            assert forecast_series(history(), 3)["status"] == "model_unavailable"