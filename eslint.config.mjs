import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const namingConventionRules = [
  "warn",
  { selector: "variable", modifiers: ["destructured"], format: null },
  { selector: "parameter", modifiers: ["destructured"], format: null },
  {
    selector: "function",
    format: ["camelCase", "PascalCase"],
    leadingUnderscore: "forbid",
    trailingUnderscore: "forbid",
  },
  {
    selector: "variable",
    modifiers: ["const"],
    format: ["camelCase", "PascalCase", "UPPER_CASE"],
    leadingUnderscore: "forbid",
    trailingUnderscore: "forbid",
  },
  {
    selector: "variable",
    format: ["camelCase", "PascalCase"],
    leadingUnderscore: "forbid",
    trailingUnderscore: "forbid",
  },
  {
    selector: "parameter",
    format: ["camelCase"],
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
