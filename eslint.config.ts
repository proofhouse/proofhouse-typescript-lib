// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { type ConfigObject, defineConfig, globalIgnores } from "eslint/config";
import jsdoc from "eslint-plugin-jsdoc";
// Named import, because the security plugin publishes its configs as CommonJS
// named exports and leaves the default slot empty. The other three arrive whole.
import { configs as securityConfigs } from "eslint-plugin-security";
import tsdoc from "eslint-plugin-tsdoc";
import tseslint from "typescript-eslint";

type EslintPlugin = NonNullable<ConfigObject["plugins"]>[string];

// The binding carries a written type because `isolatedDeclarations` refuses a
// default export whose type it would have to infer. vitest.config.ts is shaped
// the same way for the same reason.
const config: ConfigObject[] = defineConfig([
  // Build output and the scratch trees the coverage and mutation gates fill in
  // later. What remains is the set tsconfig.json already reads.
  globalIgnores(["dist", "coverage", "reports", ".stryker-tmp", "node_modules"]),
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "*.config.ts"],
    extends: [
      // Only the type-aware halves of the two presets. Their syntax-only
      // counterparts restate rules `biome` runs under its `all` preset, and a
      // finding wants one owner rather than two.
      tseslint.configs.strictTypeCheckedOnly,
      tseslint.configs.stylisticTypeCheckedOnly,
      // Casts wrap the remaining entries. `jsdoc` hands its configs out of an
      // index signature, so the lookup reads as maybe-missing, and the security
      // plugin's published types still describe a flat config through the older
      // `Linter` interfaces. Each cast pins one value down instead of loosening
      // the array around it.
      jsdoc.configs["flat/recommended-tsdoc-error"] as ConfigObject,
      securityConfigs.recommended as unknown as ConfigObject,
    ],
    // `eslint-plugin-tsdoc` declares a rule interface of its own vintage, older
    // than the one `eslint` publishes now. Cast for the reason the extends list
    // gives.
    plugins: { tsdoc: tsdoc as unknown as EslintPlugin },
    languageOptions: {
      parserOptions: {
        // The service looks tsconfig.json up per file, which leaves the reach of
        // the typed rules to that file's `include` rather than to a second list
        // maintained here.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Every member of a closed union gets an arm. The option treats a
      // `default` arm as standing for the members left over, so a `switch`
      // written that way draws no finding.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      // Absent a comparator, `Array.prototype.sort` reads its elements as text
      // and files 10 before 9.
      "@typescript-eslint/require-array-sort-compare": "error",
      // Malformed TSDoc, caught by the plugin that parses the grammar rather
      // than by the `jsdoc` rules sitting next to it.
      "tsdoc/syntax": "error",
      // A doc comment is owed on the surface the package exports. What sits
      // behind that surface answers to the reader alone.
      "jsdoc/require-jsdoc": ["error", { publicOnly: true }],
      // `useSingleJsDocAsterisk` in `biome` already reports a doubled asterisk,
      // so this one steps aside.
      "jsdoc/no-multi-asterisks": "off",
      // A blank line before the first tag, and no opinion past that.
      "jsdoc/tag-lines": ["error", "any", { startLines: 1 }],
      // Any computed property access counts as injection to this rule, a loop
      // index into a local array included. Upstream describes the finding as a
      // prompt to review rather than as a defect.
      "security/detect-object-injection": "off",
      // Any comparison against a variable whose name reads like a credential draws
      // this one, and `token` is what a lexer calls the lexeme it just scanned. No
      // secret is compared anywhere in the package.
      "security/detect-possible-timing-attacks": "off",
    },
  },
  {
    // The entry point resolves the package manifest against its own location on
    // disk and reads it there. The rule fires on any argument that isn't a
    // string literal, which that URL isn't. Waiving it for the one file leaves
    // it live for a read whose path really does come from a caller.
    files: ["src/index.ts"],
    rules: { "security/detect-non-literal-fs-filename": "off" },
  },
]);

// biome-ignore lint/style/noDefaultExport: `eslint` reads a config module's default export.
export default config;
