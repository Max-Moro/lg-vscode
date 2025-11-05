// @ts-check
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // VS Code extension specific rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Code quality
      "no-console": "off", // VS Code extensions often use console
      "prefer-const": "warn",
      "no-var": "error",

      // Best practices for async code
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "out/**",
      "*.js", // Ignore JS files in root (like this config)
      "media/**/*.js", // Media JS files are not part of TypeScript project
      "src/build-ui.ts", // Build scripts can have different rules
    ],
  }
);
