// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Token kinds and the token record the lexer produces.

/**
 * The token kinds the expression grammar deals in. One kind covers integer literals,
 * and the rest each name a single operator or parenthesis character.
 *
 * {@link TokenKind} derives its union from this array, so the runtime list and the type
 * can't drift apart, and a caller can iterate the kinds without restating them.
 */
export const TOKEN_KINDS = [
  "number",
  "plus",
  "minus",
  "star",
  "slash",
  "lparen",
  "rparen",
] as const;

/** Classification of one scanned token. */
export type TokenKind = (typeof TOKEN_KINDS)[number];

/** One token produced by the lexer, pairing the text it matched with its kind. */
export interface Token {
  /** What kind of token this is. */
  readonly kind: TokenKind;
  /** The exact source text the token matched. */
  readonly lexeme: string;
  /**
   * Where the token starts in the source text, as a UTF-16 code-unit index.
   *
   * That's the index JavaScript strings themselves use, so `text.slice(offset)` begins
   * at the token. A character outside the basic multilingual plane counts as two.
   */
  readonly offset: number;
}
