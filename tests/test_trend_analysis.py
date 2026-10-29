import math

import pytest

from src.trend_analysis import build_analysis, calculate_monthly_trends, comparison, seasonality


@pytest.mark.parametrize("current,prior,percent,direction,reason", [
    (120, 100, 20, "growth", None), (75, 100, -25, "decline", None),
    (100, 100, 0, "flat", None), (50, 0, None, "unavailable", "zero_baseline"),
    (10, -10, None, "unavailable", "negative_baseline"),
    (10, None, None, "unavailable", "no_history"),
    (-10, 100, -110, "decline", None),
])
def test_comparison(current, prior, percent, direction, reason):
    result = comparison(current, prior)
    if percent is not None:
        assert result["percent"] == pytest.approx(percent)
    else:
        assert result["percent"] is None
    assert result["direction"] == direction
    assert result["reason"] == reason


def test_calendar_zero_month_and_full_sma_window():
    result = calculate_monthly_trends([
        {"month": "2025-03", "revenue": 120, "units": 4},
        {"month": "2025-01", "revenue": 90, "units": 3},
    ], "2025-01", "2025-03")
    assert result[1]["revenue"] == 0
    assert result[1]["mom"]["percent"] == -100
    assert result[2]["mom"]["reason"] == "zero_baseline"
    assert result[0]["sma3"] is None
    assert result[2]["sma3"] == 70
    assert result[2]["sma6"] is None
    assert result[1]["had_transactions"] is False


def test_year_comparison_uses_exact_calendar_offset():
    rows = [{"month": "2024-01", "revenue": 100}, {"month": "2025-01", "revenue": 120}]
    result = calculate_monthly_trends(rows, "2024-01", "2025-01")
    assert len(result) == 13
    assert result[-1]["yoy"]["percent"] == pytest.approx(20)
    assert result[-1]["mom"]["reason"] == "zero_baseline"


def test_empty_or_reversed_coverage():
    assert calculate_monthly_trends([], None, None) == []
    assert calculate_monthly_trends([], "2025-02", "2025-01") == []
    assert seasonality([])["status"] == "insufficient_history"


def test_two_year_normalization_removes_annual_scale():
    rows = [{"month": f"{year}-{month:02d}", "revenue": month * factor}
            for year, factor in [(2023, 10), (2024, 20)] for month in range(1, 13)]
    profile = seasonality(calculate_monthly_trends(rows, "2023-01", "2024-12"))
    assert profile["status"] == "available"
    assert profile["eligible_years"] == [2023, 2024]
    assert profile["peak_months"] == [12]
    assert profile["trough_months"] == [1]
    assert profile["profile"][11]["index"] == pytest.approx(12 / 6.5)
    assert len(profile["matrix"]) == 2


def test_partial_year_and_nonpositive_year_excluded():
    rows = calculate_monthly_trends([], "2023-06", "2025-01")
    assert seasonality(rows)["eligible_years"] == []
    assert seasonality(rows)["status"] == "insufficient_history"


def test_analysis_slices_after_computing_comparisons_and_keeps_category_zeroes():
    result = build_analysis(
        [{"month": "2025-01", "revenue": 100, "units": 5},
         {"month": "2025-02", "revenue": 120, "units": 6}],
        [{"month": "2025-01", "category": "A", "revenue": 100, "units": 5},
         {"month": "2025-02", "category": "B", "revenue": 120, "units": 6}],
        "2025-01", "2025-02", "2025-02",
    )
    assert result["monthly"][0]["mom"]["percent"] == pytest.approx(20)
    assert result["demand"][0]["category"] == "B"
    assert result["demand"][0]["unit_share"] == 100
    assert result["demand"][1]["latest"]["units"] == 0
    assert result["demand"][1]["latest"]["units_mom"]["percent"] == -100
    assert len(result["quarterly"]) == 2


def test_empty_analysis_and_finite_serialization():
    result = build_analysis([], [], None, None)
    assert result["latest"] is None
    assert result["demand"] == []
    assert not math.isnan(comparison(0, 0)["delta"])