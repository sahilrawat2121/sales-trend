import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/app/**/page.tsx", "src/app/api/**/route.ts", "src/components/**/*.tsx", "src/lib/**/*.ts"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 80 },
    },
  },
});