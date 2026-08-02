// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { describe, expect, it } from "vitest";

import {
  DivisionByZeroError,
  type Expr,
  ExpressionError,
  evaluate,
  evaluateText,
  type Rational,
} from "../src/index.ts";

interface ValueCase {
  readonly name: string;
  readonly text: string;
  readonly value: Rational;
}

const valueCases: readonly ValueCase[] = [
  { name: "a literal lifts to a whole value", text: "7", value: { num: 7n, den: 1n } },
  { name: "addition", text: "2+3", value: { num: 5n, den: 1n } },
  { name: "subtraction", text: "10-4", value: { num: 6n, den: 1n } },
  { name: "multiplication", text: "6*7", value: { num: 42n, den: 1n } },
  { name: "a quotient that comes out whole", text: "8/2", value: { num: 4n, den: 1n } },
  { name: "a third stays a third", text: "1/3", value: { num: 1n, den: 3n } },
  { name: "a quotient reduces", text: "2/6", value: { num: 1n, den: 3n } },
  { name: "sixths and thirds meet at a half", text: "1/3 + 1/6", value: { num: 1n, den: 2n } },
  { name: "three thirds come back to one", text: "1/3+1/3+1/3", value: { num: 1n, den: 1n } },
  { name: "a third multiplied back out", text: "1/3*3", value: { num: 1n, den: 1n } },
  { name: "multiplication outranks addition", text: "1+2*3", value: { num: 7n, den: 1n } },
  { name: "a group outranks the operator around it", text: "(1+2)*3", value: { num: 9n, den: 1n } },
  { name: "division outranks subtraction", text: "8-4/2", value: { num: 6n, den: 1n } },
  { name: "subtraction associates to the left", text: "9-5-2", value: { num: 2n, den: 1n } },
  { name: "division associates to the left", text: "8/4/2", value: { num: 1n, den: 1n } },
  { name: "a leading minus", text: "-3", value: { num: -3n, den: 1n } },
  { name: "two of them cancel", text: "- -3", value: { num: 3n, den: 1n } },
  { name: "three of them do not", text: "---3", value: { num: -3n, den: 1n } },
  { name: "a minus reaching over a group", text: "-(1+2)", value: { num: -3n, den: 1n } },
  { name: "a minus on the right of an operator", text: "2*-3", value: { num: -6n, den: 1n } },
  { name: "a negative divisor moves its sign up", text: "6/-2", value: { num: -3n, den: 1n } },
  { name: "the sign of a fraction sits on top", text: "1/-3", value: { num: -1n, den: 3n } },
  { name: "two negatives leave none", text: "-1/-3", value: { num: 1n, den: 3n } },
  { name: "zero has one spelling", text: "0/5", value: { num: 0n, den: 1n } },
  { name: "and negating it does not make a second", text: "-0", value: { num: 0n, den: 1n } },
];

interface ZeroDivisorCase {
  readonly name: string;
  readonly text: string;
}

const zeroDivisorCases: readonly ZeroDivisorCase[] = [
  { name: "a literal zero divisor", text: "1/0" },
  { name: "a divisor that works out to zero", text: "1/(2-2)" },
  { name: "zero over zero", text: "0/0" },
  { name: "a divisor that is zero in fraction form", text: "1/(1/3-1/3)" },
];

describe("evaluateText", () => {
  it.each(valueCases)("$name", ({ text, value }) => {
    expect(evaluateText(text)).toStrictEqual(value);
  });
});

describe("evaluate", () => {
  it("walks a tree it was handed directly", () => {
    const tree: Expr = {
      kind: "binary",
      operator: "mul",
      left: { kind: "unary", operator: "neg", operand: { kind: "number", value: 4 } },
      right: { kind: "number", value: 5 },
    };

    expect(evaluate(tree)).toStrictEqual({ num: -20n, den: 1n });
  });
});

describe("zero divisors", () => {
  it.each(zeroDivisorCases)("$name", ({ text }) => {
    expect(() => evaluateText(text)).toThrow(DivisionByZeroError);
  });

  it("turns down a tree it was handed directly", () => {
    const tree: Expr = {
      kind: "binary",
      operator: "div",
      left: { kind: "number", value: 1 },
      right: { kind: "number", value: 0 },
    };

    expect(() => evaluate(tree)).toThrow(DivisionByZeroError);
  });

  it("names itself and answers to the base error", () => {
    try {
      evaluateText("5/0");
      expect.unreachable("evaluateText returned a value for a zero divisor");
    } catch (error) {
      expect(error).toBeInstanceOf(ExpressionError);
      expect((error as Error).name).toBe("DivisionByZeroError");
      expect((error as Error).message).toBe("division by zero");
    }
  });
});
