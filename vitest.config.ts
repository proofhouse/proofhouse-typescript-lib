// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { defineConfig, type ViteUserConfig } from "vitest/config";

// The explicit annotation is what `isolatedDeclarations` needs; exporting the
// `defineConfig` call directly leaves the default export without a declarable type.
const config: ViteUserConfig = defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});

export default config;
