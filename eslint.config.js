import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import igniteZero from "./eslint-plugin-ignite-zero/index.js";

export default tseslint.config(
  // Ignore build output, generated reports, and Deno-based Supabase Edge Functions.
  // Edge Functions are type-checked and linted in the Supabase/Deno toolchain,
  // and use Deno globals and remote imports that are not compatible with the
  // Node/ts-eslint type system we use for the app and MCP code.
  {
    ignores: [
      "dist",
      ".tmp/**",
      "lms-mcp/dist/**",
      "supabase/functions/**",
      "reports/**",
      "test-results/**",
      "scripts/**",
      "tmp/**",
      "public/**/*.zip",
      "_archive/**",
      "dawn-react-starter/**",
      "external/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "ignite-zero": igniteZero,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "ignite-zero/no-direct-supabase-ui": "error",
      "ignite-zero/no-direct-edge-calls": "error",
    },
  },
  {
    // Relax a few strict rules in test files to keep app code strict while
    // avoiding noisy lint failures in test helpers and fixtures.
    files: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "src/**/__tests__/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-empty": "off",
    },
  },
  {
    files: [
      "scripts/**/*.{ts,tsx,js,mjs,cjs}",
      "lms-mcp/scripts/**/*.{ts,tsx,js,mjs,cjs}",
      "jest.setup.ts",
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-empty": "off",
    },
  },
  {
    files: ["lms-mcp/src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "ignite-zero/no-direct-supabase-ui": "off", // Backend handlers can access Supabase directly
      "no-empty": "off", // Allow empty catch blocks in handlers
    },
  },
);
