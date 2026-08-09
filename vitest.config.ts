import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/admin/src", import.meta.url)),
      "@esh-platform/auth": fileURLToPath(
        new URL("./packages/platform/auth/src/index.ts", import.meta.url),
      ),
      "@esh-platform/config": fileURLToPath(
        new URL("./packages/platform/config/src/index.ts", import.meta.url),
      ),
      "@esh-platform/events": fileURLToPath(
        new URL("./packages/platform/events/src/index.ts", import.meta.url),
      ),
      "@esh-platform/logger": fileURLToPath(
        new URL("./packages/platform/logger/src/index.ts", import.meta.url),
      ),
      "@esh-platform/maps": fileURLToPath(
        new URL("./packages/platform/maps/src/index.ts", import.meta.url),
      ),
      "@esh-platform/supabase": fileURLToPath(
        new URL("./packages/platform/supabase/src/index.ts", import.meta.url),
      ),
      "@esh-platform/testing": fileURLToPath(
        new URL("./packages/platform/testing/src/index.ts", import.meta.url),
      ),
      "@esh-platform/workflows": fileURLToPath(
        new URL("./packages/platform/workflows/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    environment: "node",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
    globals: false,
    include: ["**/*.test.ts"],
  },
});
