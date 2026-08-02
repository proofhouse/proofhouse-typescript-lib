// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Evaluator reducing an expression tree to an exact number.

import type { BinaryOperator, Expr } from "./ast.ts";
import { DivisionByZeroError } from "./errors.ts";
import { parse } from "./parser.ts";

// The value with its sign dropped. A divisor is read off that rather than off a
// numerator that may be negative.
function magnitude(value: bigint): bigint {
  if (value < 0n) {
    return -value;
  }
  return value;
}

// Greatest common divisor, by Euclid. Both arguments arrive at zero or higher, which is
// what the caller has to hold up: over a negative one the remainders alternate in sign
// and the result comes back negative.
function gcd(first: bigint, second: bigint): bigint {
  let larger = first;
  let smaller = second;
  while (smaller !== 0n) {
    const remainder = larger % smaller;
    larger = smaller;
    smaller = remainder;
  }
  return larger;
}

// Brings a numerator and a denominator into the one spelling the type promises. Nothing
// here divides by zero: the only quotient with a zero denominator is the one the div arm
// turns down before it ever reaches this.
function normalize(num: bigint, den: bigint): Rational {
  let signedNum = num;
  let positiveDen = den;
  if (den < 0n) {
    signedNum = -num;
    positiveDen = -den;
  }
  const divisor = gcd(magnitude(signedNum), positiveDen);
  return { num: signedNum / divisor, den: positiveDen / divisor };
}

// Applies an infix operator to two values that are already exact. Addition and
// subtraction cross-multiply onto the common denominator the two terms have between
// them, which the normalize call then reduces back down.
function applyBinary(operator: BinaryOperator, left: Rational, right: Rational): Rational {
  switch (operator) {
    case "add":
      return normalize(left.num * right.den + right.num * left.den, left.den * right.den);
    case "sub":
      return normalize(left.num * right.den - right.num * left.den, left.den * right.den);
    case "mul":
      return normalize(left.num * right.num, left.den * right.den);
    case "div":
      if (right.num === 0n) {
        throw new DivisionByZeroError();
      }
      return normalize(left.num * right.den, left.den * right.num);
  }
}

/**
 * An exact number, held as an integer numerator over an integer denominator.
 *
 * Both terms are arbitrary-precision integers, so a third divided out of one arrives as
 * a third rather than as the float nearest it, and a sum of three of them comes back to
 * one exactly. Every value handed out is normalized: the denominator stays positive,
 * the two terms have no factor left in common, and the sign rides on the numerator.
 * That leaves one spelling per number, so a caller may compare two results field by
 * field.
 */
export interface Rational {
  /** The numerator, carrying the sign of the value. */
  readonly num: bigint;
  /** The denominator, which is never zero and never negative. */
  readonly den: bigint;
}

/**
 * Reduces a tree to the exact number it stands for.
 *
 * A literal lifts to a whole value and the arithmetic stays exact from there, so a
 * quotient reduces where a decimal would round. Every node kind gets an arm of its own,
 * which leaves a kind added to the tree a compiler error here rather than a walk that
 * skips it.
 *
 * @param expr - The root of the tree to reduce.
 * @returns The exact value the tree stands for.
 * @throws {@link DivisionByZeroError} When a divisor in the tree works out to zero.
 */
export function evaluate(expr: Expr): Rational {
  switch (expr.kind) {
    case "number":
      return { num: BigInt(expr.value), den: 1n };
    case "unary": {
      // Negation is the only prefix operator the grammar spells, so no arm per operator
      // stands here. A flipped numerator leaves the denominator positive and the terms
      // with no factor in common, so nothing has to reduce a second time.
      const operand = evaluate(expr.operand);
      return { num: -operand.num, den: operand.den };
    }
    case "binary":
      return applyBinary(expr.operator, evaluate(expr.left), evaluate(expr.right));
  }
}

/**
 * Parses expression text and reduces it to the exact number it stands for.
 *
 * @param text - The expression source to reduce.
 * @returns The exact value the text stands for.
 * @throws {@link LexError} When the text holds a character that can't begin a token.
 * @throws {@link ParseError} When the tokens don't form an expression.
 * @throws {@link DivisionByZeroError} When a divisor in the expression works out to zero.
 */
export function evaluateText(text: string): Rational {
  return evaluate(parse(text));
}
