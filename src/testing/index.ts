// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Generators handing out the values this library deals in.
//
// A suite that wants a thousand expressions rather than the dozen somebody wrote down
// reaches for these. They live under the package because a downstream suite testing code
// built on this library wants the same trees, and the import path is what keeps
// fast-check off the runtime path of anyone entering through the main module.

import fc, { type Arbitrary } from "fast-check";

import { BINARY_OPERATORS, type Expr, UNARY_OPERATORS } from "../ast.ts";
import { formatExpr } from "../formatter.ts";
import type { Token, TokenKind } from "../tokens.ts";

// Each token kind that spells one fixed character, paired with the character. A literal
// is the kind left out, since its text varies and the row would have nothing to hold.
const PUNCTUATION: readonly (readonly [Exclude<TokenKind, "number">, string])[] = [
  ["plus", "+"],
  ["minus", "-"],
  ["star", "*"],
  ["slash", "/"],
  ["lparen", "("],
  ["rparen", ")"],
];

// Bounds on what a draw may hold. A literal stays well inside the range a decimal string
// converts back from, so a tree written out and read again comes back with the value it
// left with. Digit runs stay short enough to read in a failure report and long enough to
// carry a leading zero or two.
const MAX_LITERAL = 9999;
const MAX_DIGITS = 6;

// Nothing pairs a drawn token with a source text, so its offset answers to the type and
// to nothing else. The ceiling only keeps the number readable.
const MAX_OFFSET = 4096;

// How deep the trees behind {@link expressionTexts} go. Depth enough to reach past the
// bracketing rules, and little enough that a counterexample still reads at a glance.
const TEXT_DEPTH = 4;

const digitRuns: Arbitrary<string> = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: MAX_DIGITS })
  .map((digits) => digits.join(""));

const offsets: Arbitrary<number> = fc.nat({ max: MAX_OFFSET });

/**
 * Draws a token of the shape the lexer produces.
 *
 * Kind and text agree in every draw. A literal carries a run of decimal digits and each
 * other kind carries the single character that spells it, so handing the text back to
 * `tokenize` returns the same token at offset zero. The offset itself is any
 * non-negative index with no source text behind it.
 *
 * @returns An arbitrary over well-formed tokens.
 */
export function tokens(): Arbitrary<Token> {
  const literals = fc
    .tuple(digitRuns, offsets)
    .map(([lexeme, offset]): Token => ({ kind: "number", lexeme, offset }));
  const punctuation = fc
    .tuple(fc.constantFrom(...PUNCTUATION), offsets)
    .map(([[kind, lexeme], offset]): Token => ({ kind, lexeme, offset }));
  return fc.oneof(literals, punctuation);
}

/**
 * Draws an expression tree.
 *
 * Every draw is a tree the parser could have built. Literals sit at the leaves and both
 * operator kinds stand over them. A divisor may work out to zero, which leaves a
 * property free to say what happens then.
 *
 * @param maxDepth - How many operator levels may stand over a leaf. Zero draws a bare
 * literal. Each level past that multiplies the size of what comes back.
 * @returns An arbitrary over well-formed trees.
 */
export function expressions(maxDepth: number): Arbitrary<Expr> {
  const literals = fc.nat({ max: MAX_LITERAL }).map((value): Expr => ({ kind: "number", value }));
  if (maxDepth <= 0) {
    return literals;
  }
  // One arbitrary for the level below, shared by both operator shapes. Building it once
  // leaves the cost of a deep tree linear in the depth rather than exponential in it.
  const operands = expressions(maxDepth - 1);
  const unaryNodes = fc
    .tuple(fc.constantFrom(...UNARY_OPERATORS), operands)
    .map(([operator, operand]): Expr => ({ kind: "unary", operator, operand }));
  const binaryNodes = fc
    .tuple(fc.constantFrom(...BINARY_OPERATORS), operands, operands)
    .map(([operator, left, right]): Expr => ({ kind: "binary", operator, left, right }));
  return fc.oneof(literals, unaryNodes, binaryNodes);
}

/**
 * Draws expression source text.
 *
 * Each draw is a tree written out in canonical form, so the text parses and comes back
 * as the tree behind it. Text of some other shape has to come from somewhere
 * else: a suite wanting input the parser turns down draws strings directly, and one
 * wanting deeper trees maps {@link formatExpr} over {@link expressions} at the depth it
 * has in mind.
 *
 * @returns An arbitrary over canonical expression text.
 */
export function expressionTexts(): Arbitrary<string> {
  return expressions(TEXT_DEPTH).map(formatExpr);
}
