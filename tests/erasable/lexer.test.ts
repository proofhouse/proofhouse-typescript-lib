// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import assert from "node:assert/strict";
import { test } from "node:test";

import { LexError, type TokenKind, tokenize } from "../../src/index.ts";

// Node's own test runner drives this file, and staying off `vitest` is the
// whole point of it. Nothing transforms a module on the way in, so the first
// assertion arrives only once the runtime has stripped the types from the
// public entry point and from every module behind it. Compile the same sources
// first and syntax the runtime can't erase would go by unremarked. The import
// list carries an inline type specifier for that reason too: erasing that
// specifier belongs to what a passing run proves.

const ADDITION_KINDS: readonly TokenKind[] = ["number", "plus", "number"];

const REJECTED_OFFSET = 2;

test("the public entry point tokenizes under Node's type stripping", () => {
  const kinds = tokenize("1+2").map((token) => token.kind);

  assert.deepEqual(kinds, ADDITION_KINDS);
});

test("a rejected character still arrives as a LexError with its offset", () => {
  assert.throws(
    () => {
      tokenize("1+$");
    },
    (error: unknown) => error instanceof LexError && error.offset === REJECTED_OFFSET,
  );
});
