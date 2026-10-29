import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SalesProvider } from "../../components/sales-provider";
import Help from "./page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

function renderHelp() {
  window.history.replaceState(null, "", "/help?region=West");
  const fetcher = vi.fn().mockRejectedValue(new Error("Offline"));
  vi.stubGlobal("fetch", fetcher);
  render(<SalesProvider><Help /></SalesProvider>);
  return fetcher;
}

it("opens Help without requiring a data API and preserves filters on dashboard links", () => {
  const fetcher = renderHelp();
  expect(screen.getByRole("heading", { name: "Dashboard guide", level: 1 })).toBeDefined();
  expect(screen.getByRole("link", { name: "Help" }).getAttribute("aria-current")).toBe("page");
  const guide = within(screen.getByRole("article"));
  expect(guide.getByRole("link", { name: "Forecasts" }).getAttribute("href")).toBe("/forecasts?region=West");
  expect(screen.queryByLabelText("Category")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it("explains every view, compact amounts, filters and forecast interpretation", () => {
  renderHelp();
  for (const heading of ["Getting started", "Dashboard views", "Filters & date ranges", "Reading the numbers", "Metric definitions", "Generating a forecast", "Common questions"]) {
    expect(screen.getByRole("heading", { name: heading })).toBeDefined();
  }
  expect(screen.getByText("Crore")).toBeDefined();
  expect(screen.getByText("Lakh")).toBeDefined();
  expect(screen.getByText(/30 complete monthly observations/)).toBeDefined();
  expect(screen.getByText(/not a guarantee/)).toBeDefined();
});

it("opens troubleshooting details with native accessible controls", async () => {
  renderHelp();
  const question = screen.getByText("Why is a growth percentage N/A?");
  expect(question.closest("details")!.open).toBe(false);
  await userEvent.click(question);
  expect(question.closest("details")!.open).toBe(true);
});