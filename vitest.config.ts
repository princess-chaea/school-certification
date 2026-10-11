import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // Cloud Functions uses Node's test runner after compiling to functions/lib.
    exclude: [...configDefaults.exclude, "functions/**"],
  },
});
