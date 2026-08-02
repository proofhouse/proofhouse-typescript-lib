// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { test } from "@fast-check/vitest";
import { expect } from "vitest";

import { DivisionByZeroError, type Expr, evaluate } from "../../src/index.ts";
import { expressions } from "../../src/testing/index.ts";

// Deep enough for a zero divisor to arrive through arithmetic rather than sit in the
// source, since a quotient whose two operands agree reaches zero by subtraction.
const DEPTH = 4;

const ZERO = 0n;
const ONE = 1n;

function gcd(first: bigint, second: bigint): bigint {
  let larger = first;
  let smaller = second;
  while (smaller !== ZERO) {
    [larger, smaller] = [smaller, larger % smaller];
  }
  return larger;
}

function magnitude(value: bigint): bigint {
  if (value < ZERO) {
    return -value;
  }
  return value;
}

// Whether a quotient anywhere in the tree has a divisor working out to zero. The walk
// asks each side first and only then takes its value, so no call below reaches a subtree
// that would refuse. Repeating the arithmetic here rather than reading a flag off the
// evaluator leaves the property with two independent answers to compare.
function dividesByZero(expr: Expr): boolean {
  switch (expr.kind) {
    case "number":
      return false;
    case "unary":
      return dividesByZero(expr.operand);
    case "binary":
      if (dividesByZero(expr.left) || dividesByZero(expr.right)) {
        return true;
      }
      return expr.operator === "div" && evaluate(expr.right).num === ZERO;
  }
}

// One claim per half of the split. A tree with no zero divisor in it yields a normalized
// value, and anything else escaping the call fails the test outright. A tree that does
// hold one draws the typed error and no other.
test.prop([expressions(DEPTH)])("a tree yields a value or refuses over a zero divisor", (expr) => {
  if (dividesByZero(expr)) {
    expect(() => evaluate(expr)).toThrow(DivisionByZeroError);
    return;
  }
  const value = evaluate(expr);
  expect(value.den).toBeGreaterThan(ZERO);
  expect(gcd(magnitude(value.num), value.den)).toBe(ONE);
});
