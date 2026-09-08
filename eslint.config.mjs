import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

/**
 * Flat ESLint config.
 *
 * `next lint` was removed in Next 16, so linting is wired directly to ESLint
 * here rather than through the framework shim.
 *
 * The rule set is deliberately small. Formatting is Prettier's job and is
 * switched off here via eslint-config-prettier, so every rule that remains is
 * about correctness or intent rather than style — which keeps a lint failure
 * meaningful instead of noise.
 */
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "artifacts/**",
      ".data/**",
      "next-env.d.ts",
      "**/*.tsbuildinfo",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,

      // An unused variable is usually a half-finished edit. Underscore-prefixed
      // names are the documented escape hatch for deliberate omissions.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],

      // `any` defeats the point of the strict compiler settings this project
      // relies on to keep unit errors out of a legal declaration.
      "@typescript-eslint/no-explicit-any": "error",

      // Non-null assertions are allowed in tests, where the fixture shape is
      // known, but are a real risk in engine code.
      "@typescript-eslint/no-non-null-assertion": "off",

      eqeqeq: ["error", "smart"],
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    // The engine is the part that must never reach for an escape hatch.
    files: ["src/lib/cbam/**/*.ts"],
    ignores: ["src/lib/cbam/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    files: ["**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
  prettier,
);
