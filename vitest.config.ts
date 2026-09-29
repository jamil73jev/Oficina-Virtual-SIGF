import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/e2e/**/*.test.ts",
      // Contratos de repos contra memoria y Postgres en proceso (PGlite): sin BD externa.
      "tests/integration/**/*.test.ts",
      "src/**/*.test.ts",
    ],
  },
});
