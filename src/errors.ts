// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// biome-ignore-all lint/style/noExcessiveClassesPerFile: one module holds the hierarchy.

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
    super(`unexpected character "${character}" at offset ${String(offset)}`);
    this.name = "LexError";
    this.offset = offset;
  }
}

/** Raised when the token stream doesn't form an expression. */
export class ParseError extends ExpressionError {
  /** Where the parser stopped, as a UTF-16 code-unit index. */
  readonly offset: number;

  /**
   * The class assembles the message from its parts, so every raise site reports the same
   * shape and a caller reading one error has read them all.
   *
   * @param expected - What the grammar allowed at that point, such as `an operand`.
   * @param found - What stood there instead, quoted where it came from the source.
   * @param offset - UTF-16 code-unit index the report points at.
   */
  constructor(expected: string, found: string, offset: number) {
    super(`expected ${expected}, found ${found} at offset ${String(offset)}`);
    this.name = "ParseError";
    this.offset = offset;
  }
}

/**
 * Raised when evaluation meets a divisor that works out to zero.
 *
 * This error carries no offset where its siblings each carry one. The tree the
 * evaluator walks holds no source positions, so what gets reported here is a fact about
 * the tree rather than about a span of the text that spelled it.
 */
export class DivisionByZeroError extends ExpressionError {
  constructor() {
    super("division by zero");
    this.name = "DivisionByZeroError";
  }
}
