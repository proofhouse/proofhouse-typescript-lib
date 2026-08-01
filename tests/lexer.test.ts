// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// biome-ignore-all lint/style/noMagicNumbers: the offsets are the expectation under test.

import { describe, expect, it } from "vitest";

import {
  ExpressionError,
  LexError,
  TOKEN_KINDS,
  type Token,
  type TokenKind,
  tokenize,
} from "../src/index.ts";

function tok(kind: TokenKind, lexeme: string, offset: number): Token {
  return { kind, lexeme, offset };
}

// Pulls the error out of a failing scan so the offset and the message can be read
// directly, rather than matched through a thrown-value assertion.
function lexErrorFrom(text: string): LexError {
  try {
    tokenize(text);
  } catch (error) {
    if (error instanceof LexError) {
      return error;
    }
  }
  throw new Error(`tokenize(${JSON.stringify(text)}) raised no LexError`);
}

interface TokenCase {
  readonly name: string;
  readonly text: string;
  readonly expected: readonly Token[];
}

const tokenCases: readonly TokenCase[] = [
  { name: "one digit", text: "7", expected: [tok("number", "7", 0)] },
  { name: "digits form one literal", text: "1234", expected: [tok("number", "1234", 0)] },
  { name: "leading zeros stay in the lexeme", text: "007", expected: [tok("number", "007", 0)] },
  {
    name: "adjacent tokens need no separator",
    text: "1+2",
    expected: [tok("number", "1", 0), tok("plus", "+", 1), tok("number", "2", 2)],
  },
  {
    name: "every operator and parenthesis",
    text: "+-*/()",
    expected: [
      tok("plus", "+", 0),
      tok("minus", "-", 1),
      tok("star", "*", 2),
      tok("slash", "/", 3),
      tok("lparen", "(", 4),
      tok("rparen", ")", 5),
    ],
  },
  {
    name: "offsets count skipped whitespace",
    text: " 12 * (34 - 5) / 6 ",
    expected: [
      tok("number", "12", 1),
      tok("star", "*", 4),
      tok("lparen", "(", 6),
      tok("number", "34", 7),
      tok("minus", "-", 10),
      tok("number", "5", 12),
      tok("rparen", ")", 13),
      tok("slash", "/", 15),
      tok("number", "6", 17),
    ],
  },
];

interface EmptyCase {
  readonly name: string;
  readonly text: string;
}

const emptyCases: readonly EmptyCase[] = [
  { name: "empty string", text: "" },
  { name: "one space", text: " " },
  { name: "mixed whitespace", text: " \t\n  " },
];

interface ErrorCase {
  readonly name: string;
  readonly text: string;
  readonly character: string;
  readonly offset: number;
}

const errorCases: readonly ErrorCase[] = [
  { name: "letter at the start", text: "a", character: "a", offset: 0 },
  { name: "symbol after a number", text: "12 $ 3", character: "$", offset: 3 },
  { name: "decimal point", text: "1.5", character: ".", offset: 1 },
  { name: "astral character", text: "1+\u{1d51e}", character: "\u{1d51e}", offset: 2 },
];

describe("tokenize", () => {
  it.each(tokenCases)("$name", ({ text, expected }) => {
    expect(tokenize(text)).toStrictEqual(expected);
  });

  it.each(emptyCases)("$name yields no tokens", ({ text }) => {
    expect(tokenize(text)).toStrictEqual([]);
  });

  it("reaches every declared token kind", () => {
    const kinds = tokenize("1 + 2 - 3 * 4 / (5)").map((token) => token.kind);

    expect(new Set(kinds)).toStrictEqual(new Set(TOKEN_KINDS));
  });
});

describe("tokenize rejections", () => {
  it.each(errorCases)("$name", ({ text, character, offset }) => {
    const error = lexErrorFrom(text);

    expect(error.offset).toBe(offset);
    expect(error.message).toBe(`unexpected character "${character}" at offset ${String(offset)}`);
    expect(error.name).toBe("LexError");
    expect(error).toBeInstanceOf(ExpressionError);
  });

  it("reports an offset that indexes the source in UTF-16 code units", () => {
    const text = "12 * \u{1d51e}";
    const error = lexErrorFrom(text);

    expect(error.offset).toBe(5);
    expect(text.slice(error.offset)).toBe("\u{1d51e}");
  });
});
