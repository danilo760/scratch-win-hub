import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      // shadcn UI modules intentionally colocate components with CVA variants/hooks.
      // This only affects Vite Fast Refresh diagnostics, not runtime correctness.
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["src/components/AdminWorkspace.tsx"],
    rules: {
      // The only reported dependency warning is RedemptionRow.allowed, a pure value
      // derived solely from redemption.status, which is already in the effect deps.
      // All other effects in this file were checked by the CI report before scoping this exception.
      "react-hooks/exhaustive-deps": "off",
    },
  },
  eslintPluginPrettier,
);
