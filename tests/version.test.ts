// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { describe, expect, it } from "vitest";

import { version } from "../src/index.ts";

const digits = /^\d+$/u;

const SEMVER_COMPONENTS = 3;

describe("version", () => {
  it("reports three numeric components", () => {
    const parts = version().split(".");

    expect(parts).toHaveLength(SEMVER_COMPONENTS);
    for (const part of parts) {
      expect(part).toMatch(digits);
    }
  });
});
