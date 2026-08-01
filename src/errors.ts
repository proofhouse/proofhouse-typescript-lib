// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Errors raised while processing expressions.

/**
 * Base class for every expression-processing error this library raises.
 *
 * The parsing and evaluation stages hang their own errors off this class as they land,
 * so a caller has one type to catch for anything the pipeline turns down.
 */
export class ExpressionError extends Error {}

/** Raised when the lexer meets a character that can't begin a token. */
export class LexError extends ExpressionError {
  /** Where the offending character sits, as a UTF-16 code-unit index. */
  readonly offset: number;

  /**
   * @param character - The character that couldn't begin a token.
   * @param offset - UTF-16 code-unit index of that character in the source text.
   */
  constructor(character: string, offset: number) {
    super(`unexpected character "${character}" at offset ${offset}`);
    this.name = "LexError";
    this.offset = offset;
  }
}
