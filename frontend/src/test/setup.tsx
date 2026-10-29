import { vi } from "vitest";

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => window.location.pathname,
    useSearchParams: () => {
      const query = useSyncExternalStore((listener) => {
        window.addEventListener("popstate", listener);
        return () => window.removeEventListener("popstate", listener);
      }, () => window.location.search);
      return new URLSearchParams(query);
    },
    useRouter: () => ({ replace: (url: string) => {
      window.history.replaceState(null, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } }),
  };
});

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.ComponentProps<"a">) =>
  <a href={href} {...props}>{children}</a> }));

vi.mock("recharts", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const empty = () => null;
  const tooltip = ({ formatter }: { formatter?: (value: number) => React.ReactNode }) =>
    formatter ? <div data-testid="chart-tooltip">{formatter(17505741.22)}</div> : null;
  return { ResponsiveContainer: wrapper, AreaChart: wrapper, ComposedChart: wrapper,
    BarChart: wrapper, LineChart: wrapper, Area: empty, Line: empty, Bar: empty,
    CartesianGrid: empty, XAxis: empty, YAxis: empty, Tooltip: tooltip, Legend: empty };
});