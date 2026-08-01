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
  },
});

// biome-ignore lint/style/noDefaultExport: `vitest` reads a config module's default export.
export default config;
