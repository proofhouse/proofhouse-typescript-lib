// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { version } from "../src/index.ts";

// Every checkout carries a manifest the reader accepts, which leaves the guard inside it
// with nothing to turn down. Sitting in front of node:fs is how a case gets to hand that
// guard some other text. Reads no case redirects go through to the real function.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const digits = /^\d+$/u;

const SEMVER_COMPONENTS = 3;

// One text per clause of the guard, in the order the clauses run. A bare number is no
// object. `null` answers to `typeof` as one anyway. The third holds no version key at
// all. The last holds the key and spells it as something other than a string.
const UNUSABLE_MANIFESTS = ["3", "null", "{}", '{"version": ["0.0.0"]}'];

describe("version", () => {
  it("reports three numeric components", () => {
    const parts = version().split(".");

    expect(parts).toHaveLength(SEMVER_COMPONENTS);
    for (const part of parts) {
      expect(part).toMatch(digits);
    }
  });

  it.each(UNUSABLE_MANIFESTS)("refuses a manifest reading %s", (text) => {
    vi.mocked(readFileSync).mockReturnValueOnce(text);

    expect(() => version()).toThrow("package manifest carries no string version field");
  });
});
