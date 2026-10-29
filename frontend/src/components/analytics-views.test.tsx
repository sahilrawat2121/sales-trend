import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import Growth from "../app/growth/page";
import Seasonality from "../app/seasonality/page";
import Demand from "../app/demand/page";
import Forecasts from "../app/forecasts/page";
import { payload, forecast } from "../test/fixtures";
import { SalesProvider } from "./sales-provider";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

function show(view: React.ReactNode, data = payload) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url) =>
    Promise.resolve(Response.json(url === "/api/forecasts" ? forecast : data))));
  return render(<SalesProvider>{view}</SalesProvider>);
}

it("shows five separate views, persistent filters, and growth metrics", async () => {
  show(<Growth />);
  expect(await screen.findByText("Monthly growth")).toBeDefined();
  expect(screen.getAllByText("+20.0%").length).toBeGreaterThan(0);
  await userEvent.selectOptions(screen.getByLabelText("Region"), "West");
  await waitFor(() => expect(window.location.search).toContain("region=West"));
  expect(screen.getByRole("link", { name: "Seasonality" }).getAttribute("href")).toBe("/seasonality?region=West");
  expect(screen.getByRole("link", { name: "Forecasts" })).toBeDefined();
});

it("renders INR demand, returns, and quarter composition", async () => {
  const data = structuredClone(payload);
  data.metadata.currency = "INR";
  show(<Demand />, data);
  expect(await screen.findByText("Category demand")).toBeDefined();
  expect(screen.getByText("Quarterly category mix")).toBeDefined();
  expect(screen.getAllByText(/₹/).length).toBeGreaterThan(0);
  expect(screen.getByText("100.0%")).toBeDefined();
});

it("renders descriptive seasonal evidence and an insufficient-history state", async () => {
  const view = show(<Seasonality />);
  expect(await screen.findByText("Seasonal revenue matrix")).toBeDefined();
  expect(screen.getByText("December")).toBeDefined();
  view.unmount();
  const data = structuredClone(payload);
  data.analytics.seasonality.status = "insufficient_history";
  data.analytics.seasonality.profile = [];
  show(<Seasonality />, data);
  expect(await screen.findByText("More complete years needed")).toBeDefined();
});

it("generates a forecast explicitly and shows evaluation and partial-month caveats", async () => {
  show(<Forecasts />);
  await screen.findByRole("button", { name: "Generate forecast" });
  expect(screen.queryByText("Forecast evaluation")).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Forecast horizon"), "3");
  await userEvent.click(screen.getByRole("button", { name: "Generate forecast" }));
  expect(await screen.findByText("Forecast evaluation")).toBeDefined();
  expect(screen.getByText(/Partial boundary month excluded/)).toBeDefined();
  expect(screen.getByText(/Residual autocorrelation remains/)).toBeDefined();
  const fetcher = vi.mocked(fetch);
  const sent = JSON.parse(fetcher.mock.calls.find(call => call[0] === "/api/forecasts")![1]!.body as string);
  expect(sent.horizon).toBe(3);
  expect(sent.start).toBeUndefined();
});

it("shows forecast failure and insufficient-history states", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url) => Promise.resolve(
    url === "/api/forecasts" ? new Response("private", { status: 503 }) : Response.json(payload))));
  render(<SalesProvider><Forecasts /></SalesProvider>);
  await screen.findByRole("button", { name: "Generate forecast" });
  await userEvent.click(screen.getByRole("button", { name: "Generate forecast" }));
  expect(await screen.findByText("Forecast unavailable")).toBeDefined();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "insufficient_history", minimum_months: 30 })));
  await userEvent.click(screen.getByRole("button", { name: "Generate forecast" }));
  expect(await screen.findByText(/At least 30 complete months/)).toBeDefined();
});