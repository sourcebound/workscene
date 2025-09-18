import js from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import globals from "globals"
import prettierPlugin from "eslint-plugin-prettier"
import eslintConfigPrettier from "eslint-config-prettier"

export default [
  {
    ignores: ["node_modules", "out", "*.vsix", "workscene.config.json"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs["flat/recommended"],
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  eslintConfigPrettier,
]
