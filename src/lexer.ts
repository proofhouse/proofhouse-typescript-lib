// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Lexer turning expression text into a token stream.

import { LexError } from "./errors.ts";
import type { Token, TokenKind } from "./tokens.ts";

// The scanner matches, in that order, a run of digits, one operator or parenthesis, or
// any single character other than whitespace. Whitespace matches no alternative, so the
// scan steps over it without a branch of its own. The u flag makes the last alternative
// take an astral character whole instead of splitting its surrogate pair, which keeps
// the offending character intact in an error message.
const SCANNER = /[0-9]+|[-+*/()]|\S/gu;

const DIGITS = /^[0-9]+$/u;

const SINGLE_CHAR_KINDS: ReadonlyMap<string, TokenKind> = new Map<string, TokenKind>([
  ["+", "plus"],
  ["-", "minus"],
  ["*", "star"],
  ["/", "slash"],
  ["(", "lparen"],
  [")", "rparen"],
]);

/**
 * Splits expression text into tokens.
 *
 * Whitespace separates tokens and is otherwise dropped. A maximal run of decimal digits
 * becomes one `number` token, and each of the six operator and parenthesis characters
 * becomes a token of its own kind. Empty or whitespace-only input yields no tokens.
 *
 * @param text - The expression source to scan.
 * @returns The tokens in the order they appear in the source.
 * @throws {LexError} When the text holds a character that can't begin a token.
 */
export function tokenize(text: string): readonly Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(SCANNER)) {
    const [lexeme] = match;
    let kind: TokenKind | undefined;
    if (DIGITS.test(lexeme)) {
      kind = "number";
    } else {
      kind = SINGLE_CHAR_KINDS.get(lexeme);
    }
    if (kind === undefined) {
      throw new LexError(lexeme, match.index);
    }
    tokens.push({ kind, lexeme, offset: match.index });
  }
  return tokens;
}
