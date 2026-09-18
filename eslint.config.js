import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/",
      "tests/fixtures/",
      "test-results/",
      "playwright-report/",
    ],
  },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-console": "error",
    },
  },
  {
    files: [
      "bin/**",
      "src/cli/**",
      "src/server/**",
      "src/source/**",
      "src/messages.js",
      "tests/**",
      "*.config.js",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/cli/run.js"],
    rules: { "no-console": "off" },
  },
  {
    files: ["src/client/**", "tests/browser/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["scripts/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
