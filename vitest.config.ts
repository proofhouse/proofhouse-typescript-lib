// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { configDefaults, defineConfig, type ViteUserConfig } from "vitest/config";

// The explicit annotation is what `isolatedDeclarations` needs; exporting the
// `defineConfig` call directly leaves the default export without a declarable type.
const config: ViteUserConfig = defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // node:test owns the erasable suite, which the include glob would otherwise claim.
    // Naming it alone would drop the defaults with `node_modules` among them, because
    // this key is an assignment and not an addition.
    exclude: [...configDefaults.exclude, "tests/erasable/**"],
    // Fixed order lets one test depend on what another leaves behind. The suite
    // keeps passing while that coupling hardens. Randomizing the files and the
    // tests within them makes the dependency fail instead. Every run reports its
    // seed, and `sequence.seed` accepts that number to repeat the same order.
    sequence: { shuffle: true },
    coverage: {
      provider: "v8",
      // The default here is whatever a run loaded, which reads the wrong way round:
      // a module the suite never imports would leave the report rather than sink it.
      // Naming the tree keeps every source file in the denominator, reached or not.
      include: ["src/**"],
      exclude: ["**/*.d.ts"],
      reporter: ["text", "lcov"],
      // Per file, so a module nobody tested can't hide behind the ones that are.
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
        perFile: true,
      },
    },
  },
});

// biome-ignore lint/style/noDefaultExport: `vitest` reads a config module's default export.
export default config;
