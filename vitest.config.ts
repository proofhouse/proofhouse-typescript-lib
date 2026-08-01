// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { defineConfig, type ViteUserConfig } from "vitest/config";

// The explicit annotation is what `isolatedDeclarations` needs; exporting the
// `defineConfig` call directly leaves the default export without a declarable type.
const config: ViteUserConfig = defineConfig({
  // node:test owns the erasable suite, which the include glob would otherwise claim.
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/erasable/**"] },
});

// biome-ignore lint/style/noDefaultExport: `vitest` reads a config module's default export.
export default config;
