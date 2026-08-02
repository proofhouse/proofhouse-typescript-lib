// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { expect } from "vitest";

import { LexError, type Token, tokenize } from "../../src/index.ts";
import { tokens } from "../../src/testing/index.ts";

// Any UTF-16 code unit at all, half of a surrogate pair included. Text reaches this
// library as a JavaScript string and nothing upstream promises whole pairs, so a stray
// half counts as ordinary input the scan must answer for rather than a case to generate
// around.
const codeUnits = fc.integer({ min: 0, max: 0xff_ff }).map((code) => String.fromCharCode(code));

const anyText = fc.string({ unit: codeUnits });

const BLANK = /^\s*$/u;

// What one scan came to, held as a value. Any error other than a `LexError` goes straight
// back out, which is where the claim about what leaves this call gets its teeth: a stray
// `TypeError` reaches the runner instead of passing for a refusal.
type Outcome =
  | { readonly kind: "scanned"; readonly tokens: readonly Token[] }
  | { readonly kind: "refused"; readonly error: LexError };

function scan(text: string): Outcome {
  try {
    return { kind: "scanned", tokens: tokenize(text) };
  } catch (error) {
    if (error instanceof LexError) {
      return { kind: "refused", error };
    }
    throw error;
  }
}

test.prop([anyText])("a scan accounts for the text or names an offset inside it", (text) => {
  const outcome = scan(text);
  if (outcome.kind === "refused") {
    expect(outcome.error.offset).toBeGreaterThanOrEqual(0);
    expect(outcome.error.offset).toBeLessThan(text.length);
    return;
  }
  // Tokens come back in source order and each one quotes the span the scan cut it from.
  // Whatever lies between two of them the scan threw away, and it throws away only space.
  let cursor = 0;
  for (const token of outcome.tokens) {
    expect(text.slice(cursor, token.offset)).toMatch(BLANK);
    expect(text.slice(token.offset, token.offset + token.lexeme.length)).toBe(token.lexeme);
    cursor = token.offset + token.lexeme.length;
  }
  expect(text.slice(cursor)).toMatch(BLANK);
});

test.prop([tokens()])("a drawn token is one the scanner would have produced", (token) => {
  expect(tokenize(token.lexeme)).toStrictEqual([
    { kind: token.kind, lexeme: token.lexeme, offset: 0 },
  ]);
});
