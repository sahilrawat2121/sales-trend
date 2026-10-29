import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { currencyFormatter, formatTooltipValue } from "../lib/sales";
import { Money } from "./money";

afterEach(cleanup);

it.each([
  [3814331912.55, "INR", "₹381.43Cr"],
  [1250000, "INR", "₹12.5L"],
  [-25000000, "INR", "-₹2.5Cr"],
  [1250000, "USD", "$1.25M"],
])("abbreviates %s %s without losing the exact amount", (value, currency, expected) => {
  render(<Money value={value} currency={currency} />);
  const exact = currencyFormatter(currency).format(value);
  const amount = screen.getByTitle(exact);
  expect(amount.querySelector('[aria-hidden="true"]')?.textContent).toBe(expected);
  expect(amount.querySelector(".sr-only")?.textContent).toBe(exact);
});

it("keeps small monetary values precise", () => {
  render(<Money value={3000.45} currency="INR" />);
  expect(screen.getByTitle("₹3,000.45").textContent).toBe("₹3,000.45");
});

it.each([
  [17505741.22, "INR", "₹1.75Cr"],
  [[1000000, 2000000], "INR", "₹10L to ₹20L"],
  [-25000000, "INR", "-₹2.5Cr"],
  [1250000, "USD", "$1.25M"],
  [10000, undefined, "10,000"],
  [undefined, "INR", "N/A"],
  [null, "INR", "N/A"],
])("formats chart tooltip values %s with currency %s", (value, currency, expected) => {
  expect(formatTooltipValue(value, currency)).toBe(expected);
});