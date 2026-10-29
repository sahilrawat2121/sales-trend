import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("forwards a bounded forecast request without display start or unrelated fields", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "ready", forecast: [] }));
  vi.stubGlobal("fetch", fetcher);
  const request = new Request("http://localhost/api/forecasts", {
    method: "POST", body: JSON.stringify({ category: "Office", region: "West", horizon: 6,
      end: "2025-08", start: "2025-01", secret: "ignored" }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);
  const sent = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(sent).toEqual({ category: "Office", region: "West", horizon: 6, end: "2025-08" });
});

it("uses configured backend and redacts validation errors", async () => {
  vi.stubEnv("SALES_API_URL", "http://localhost:8002");
  const fetcher = vi.fn().mockResolvedValue(new Response("private", { status: 422 }));
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(new Request("http://localhost/api/forecasts", { method: "POST", body: "{}" }));
  expect(fetcher.mock.calls[0][0].toString()).toBe("http://localhost:8002/forecasts");
  expect(response.status).toBe(422);
  expect(await response.text()).not.toContain("private");
});

it.each(["network", "malformed", "null"])("handles %s request failures", async (mode) => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private")));
  const response = await POST(new Request("http://localhost/api/forecasts", {
    method: "POST", body: mode === "malformed" ? "{" : mode === "null" ? "null" : "{}",
  }));
  expect(response.status).toBe(mode === "network" ? 503 : 400);
  expect(await response.text()).not.toContain("private");
});