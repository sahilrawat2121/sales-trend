import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import Home from "./page";
import { SalesProvider } from "../components/sales-provider";
import { payload } from "../test/fixtures";

function renderHome() { return render(<SalesProvider><Home /></SalesProvider>); }

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

it("loads actual data and filters all views by category", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(payload)));
  vi.stubGlobal("fetch", fetcher);
  renderHome();
  expect(screen.getByRole("status").textContent).toContain("Loading");
  expect(await screen.findByText("$3,000.00")).toBeDefined();
  expect(screen.getByTestId("chart-tooltip").textContent).toBe("$17.51M");
  expect(screen.getByText("001")).toBeDefined();
  await userEvent.selectOptions(screen.getByLabelText("Category"), "Furniture");
  await waitFor(() => expect(fetcher.mock.calls.at(-1)?.[0]).toBe("/api/sales?category=Furniture"));
  await screen.findByText("$3,000.00");
  await userEvent.click(screen.getByRole("button", { name: "Refresh data" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
});

it("shows an empty state without inventing data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    ...payload, monthly: [], transactions: [], summary: { ...payload.summary, row_count: 0 },
    metadata: { ...payload.metadata, row_count: 0 },
  })));
  renderHome();
  expect(await screen.findByText("No sales data")).toBeDefined();
});

it.each(["network", "status"])("offers retry after a %s failure", async (failure) => {
  const fetcher = vi.fn();
  if (failure === "network") fetcher.mockRejectedValueOnce(new Error("private"));
  else fetcher.mockResolvedValueOnce(new Response("private", { status: 503 }));
  fetcher.mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetcher);
  renderHome();
  expect(await screen.findByRole("alert")).toBeDefined();
  expect(screen.queryByText("private")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("$3,000.00")).toBeDefined();
});

it("aborts a pending request on unmount", () => {
  const fetcher = vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")));
  }));
  vi.stubGlobal("fetch", fetcher);
  const view = renderHome();
  view.unmount();
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});