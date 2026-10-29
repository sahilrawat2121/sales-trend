import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("proxies only the category parameter to the configured API", async () => {
  vi.stubEnv("SALES_API_URL", "http://localhost:8002");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ summary: { revenue: 100 } }));
  vi.stubGlobal("fetch", fetcher);
  const response = await GET(new Request("http://localhost/api/sales?category=Furniture&secret=x"));
  expect(response.status).toBe(200);
  expect(fetcher.mock.calls[0][0].toString()).toBe("http://localhost:8002/sales?category=Furniture");
  expect(await response.json()).toEqual({ summary: { revenue: 100 } });
});

it("uses a local default backend", async () => {
  vi.stubEnv("SALES_API_URL", "");
  const fetcher = vi.fn().mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", fetcher);
  await GET(new Request("http://localhost/api/sales"));
  expect(fetcher.mock.calls[0][0].toString()).toBe("http://127.0.0.1:8000/sales");
});

it.each(["throw", "bad-status", "invalid-json"])("redacts upstream %s errors", async (mode) => {
  vi.stubGlobal("fetch", mode === "throw"
    ? vi.fn().mockRejectedValue(new Error("private details"))
    : vi.fn().mockResolvedValue(new Response("private details", { status: mode === "bad-status" ? 500 : 200 })));
  const response = await GET(new Request("http://localhost/api/sales"));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private");
});

it("forwards dimension and calendar filters without dropping analytics", async () => {
  const payload = { analytics: { monthly: [{ month: "2025-01", revenue: 20 }] } };
  const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetcher);
  const response = await GET(new Request("http://localhost/api/sales?region=West&sales_channel=Online&start=2024-01&end=2025-08&secret=x"));
  const upstream = new URL(fetcher.mock.calls[0][0]);
  expect(upstream.searchParams.get("region")).toBe("West");
  expect(upstream.searchParams.get("sales_channel")).toBe("Online");
  expect(upstream.searchParams.get("start")).toBe("2024-01");
  expect(upstream.searchParams.get("end")).toBe("2025-08");
  expect(upstream.searchParams.has("secret")).toBe(false);
  expect(await response.json()).toEqual(payload);
});