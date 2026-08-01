// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Parser turning expression text into a tree.

import type { BinaryOperator, Expr } from "./ast.ts";
import { ParseError } from "./errors.ts";
import { tokenize } from "./lexer.ts";
import type { Token, TokenKind } from "./tokens.ts";

// Descriptions the error message stitches together. Naming them holds one spelling per
// production across the raise sites.
const OPERAND = "an operand";
const CLOSING_PAREN = '")"';
const END_OF_INPUT = "end of input";

// Binding powers, weakest first.
const ADDITIVE = 1;
const MULTIPLICATIVE = 2;

// A binary operator parses its right operand one power up from itself, which is what
// leaves a chain of equally binding operators associating to the left.
const RIGHT_OPERAND_STEP = 1;

/** How tightly one infix operator binds, and which node it builds. */
interface BinaryRule {
  /** The operator the built node carries. */
  readonly operator: BinaryOperator;
  /** Binding power, compared against the power the caller is parsing at. */
  readonly precedence: number;
}

// One row per infix operator, so another operator costs a row here rather than a grammar
// function of its own. The key type admits the absent token as well, which lets a lookup
// take whatever sits ahead of the cursor: no row answers to a stream that ran out, and
// none answers to a token that spells something other than an operator.
const BINARY_RULES: ReadonlyMap<TokenKind | undefined, BinaryRule> = new Map<
  TokenKind | undefined,
  BinaryRule
>([
  ["plus", { operator: "add", precedence: ADDITIVE }],
  ["minus", { operator: "sub", precedence: ADDITIVE }],
  ["star", { operator: "mul", precedence: MULTIPLICATIVE }],
  ["slash", { operator: "div", precedence: MULTIPLICATIVE }],
]);

// Where the grammar functions have got to in the token stream. `endOffset` sits one past
// the last character of the source, which is where a report about input that ran out has
// to point.
interface Cursor {
  readonly tokens: readonly Token[];
  readonly endOffset: number;
  position: number;
}

// Parses one operand and then as much of the infix chain behind it as binds at least as
// tightly as the caller asked for.
function parseExpression(cursor: Cursor, minPrecedence: number): Expr {
  let left = parseOperand(cursor);
  let rule = peekBinaryRule(cursor);
  while (rule !== undefined && rule.precedence >= minPrecedence) {
    cursor.position += 1;
    const right = parseExpression(cursor, rule.precedence + RIGHT_OPERAND_STEP);
    left = { kind: "binary", operator: rule.operator, left, right };
    rule = peekBinaryRule(cursor);
  }
  return left;
}

// Parses whatever the grammar allows where a value belongs. That means a literal or a
// group with any number of minus signs in front of it. Every token kind gets an arm of
// its own, so a kind added to the lexer shows up as a compiler error here rather than as
// a parse that quietly accepts it.
function parseOperand(cursor: Cursor): Expr {
  const token = take(cursor, OPERAND);
  switch (token.kind) {
    case "number":
      return { kind: "number", value: Number.parseInt(token.lexeme, 10) };
    case "minus":
      return { kind: "unary", operator: "neg", operand: parseOperand(cursor) };
    case "lparen": {
      const inner = parseExpression(cursor, ADDITIVE);
      const closing = take(cursor, CLOSING_PAREN);
      if (closing.kind !== "rparen") {
        throw new ParseError(CLOSING_PAREN, quoted(closing.lexeme), closing.offset);
      }
      return inner;
    }
    case "plus":
    case "star":
    case "slash":
    case "rparen":
      throw new ParseError(OPERAND, quoted(token.lexeme), token.offset);
  }
}

// Reads the rule for the token ahead, and answers with nothing where the chain has to
// end.
function peekBinaryRule(cursor: Cursor): BinaryRule | undefined {
  return BINARY_RULES.get(cursor.tokens[cursor.position]?.kind);
}

// Steps over the token ahead and hands it back, reporting what was expected where the
// stream has nothing left to give.
function take(cursor: Cursor, expected: string): Token {
  const token = cursor.tokens[cursor.position];
  if (token === undefined) {
    throw new ParseError(expected, END_OF_INPUT, cursor.endOffset);
  }
  cursor.position += 1;
  return token;
}

// Wraps source text for a message, matching how the lexer quotes the character it
// turned down.
function quoted(lexeme: string): string {
  return `"${lexeme}"`;
}

/**
 * Parses expression text into a tree.
 *
 * Multiplication and division outrank addition and subtraction. Every infix operator
 * associates to the left. A leading minus binds tighter than either rank and chains, and
 * parentheses start the ranking over. Whatever the lexer turns down keeps its own error
 * rather than arriving as one of these.
 *
 * @param text - The expression source to parse.
 * @returns The root of the tree the text spelled.
 * @throws {@link ParseError} When the tokens don't form an expression.
 */
export function parse(text: string): Expr {
  const cursor: Cursor = { tokens: tokenize(text), endOffset: text.length, position: 0 };
  const expr = parseExpression(cursor, ADDITIVE);
  const trailing = cursor.tokens[cursor.position];
  if (trailing !== undefined) {
    throw new ParseError(END_OF_INPUT, quoted(trailing.lexeme), trailing.offset);
  }
  return expr;
}
