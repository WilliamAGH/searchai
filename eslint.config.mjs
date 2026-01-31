import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const namingConventionRules = [
  "warn",
  { selector: "variable", modifiers: ["destructured"], format: null },
  { selector: "parameter", modifiers: ["destructured"], format: null },
  // Allow test helper functions with double underscore prefix
  {
    selector: "function",
    filter: { regex: "^__", match: true },
    format: ["camelCase"],
    leadingUnderscore: "allowDouble",
  },
  {
    selector: "function",
    format: ["camelCase", "PascalCase"],
    leadingUnderscore: "forbid",
    trailingUnderscore: "forbid",
  },
  // Allow leading underscore for private/internal variables (cache, internal state)
  {
    selector: "variable",
    modifiers: ["const"],
    format: ["camelCase", "PascalCase", "UPPER_CASE"],
    leadingUnderscore: "allowSingleOrDouble",
    trailingUnderscore: "forbid",
  },
  {
    selector: "variable",
    format: ["camelCase", "PascalCase"],
    leadingUnderscore: "allowSingleOrDouble",
    trailingUnderscore: "forbid",
  },
  // Allow unused parameters with leading underscore (TypeScript convention)
  // Must come before the general parameter rule to take precedence
  {
    selector: "parameter",
    filter: { regex: "^_", match: true },
    format: null,
    leadingUnderscore: "require",
  },
  // Allow PascalCase parameters for class/constructor references
  {
    selector: "parameter",
    format: ["camelCase", "PascalCase"],
    leadingUnderscore: "forbid",
    trailingUnderscore: "forbid",
  },
  { selector: "typeLike", format: ["PascalCase"] },
];

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "convex/_generated/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/naming-convention": namingConventionRules,
    },
  },
];
