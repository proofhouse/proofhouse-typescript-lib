// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// biome-ignore-all lint/style/noMagicNumbers: the offsets are the expectation under test.

import { describe, expect, it } from "vitest";

import { operatorSymbol } from "../src/formatter.ts";
import { type Expr, ExpressionError, LexError, ParseError, parse } from "../src/index.ts";

// Writes a tree back out with a bracket around every operator it applies. Precedence and
// associativity then read straight off the expected string, where a nest of object
// literals would leave them to be worked out. The symbols come from the formatter, which
// owns how an operator spells out.
function render(expr: Expr): string {
  switch (expr.kind) {
    case "number":
      return String(expr.value);
    case "unary":
      return `(${operatorSymbol(expr.operator)}${render(expr.operand)})`;
    case "binary":
      return `(${render(expr.left)} ${operatorSymbol(expr.operator)} ${render(expr.right)})`;
  }
}

// Runs a parse that has to fail and hands the error back, so its offset and its message
// can be asserted as ordinary values.
function parseErrorFrom(text: string): ParseError {
  let raised: unknown;
  try {
    parse(text);
  } catch (error) {
    raised = error;
  }
  if (raised instanceof ParseError) {
    return raised;
  }
  throw new Error(`parse(${JSON.stringify(text)}) raised no ParseError`);
}

interface TreeCase {
  readonly name: string;
  readonly text: string;
  readonly tree: string;
}

const treeCases: readonly TreeCase[] = [
  { name: "a literal on its own", text: "42", tree: "42" },
  { name: "multiplication outranks addition", text: "1 + 2 * 3", tree: "(1 + (2 * 3))" },
  { name: "division outranks subtraction", text: "1 - 6 / 3", tree: "(1 - (6 / 3))" },
  { name: "the higher rank can come first", text: "2 * 3 + 4", tree: "((2 * 3) + 4)" },
  { name: "addition associates to the left", text: "1 + 2 + 3", tree: "((1 + 2) + 3)" },
  { name: "subtraction associates to the left", text: "9 - 4 - 2", tree: "((9 - 4) - 2)" },
  { name: "division associates to the left", text: "8 / 4 / 2", tree: "((8 / 4) / 2)" },
  { name: "a group outranks the operator around it", text: "(1 + 2) * 3", tree: "((1 + 2) * 3)" },
  { name: "a group nests", text: "((7))", tree: "7" },
  { name: "a group starts the ranking over", text: "2 * (3 + 4 * 5)", tree: "(2 * (3 + (4 * 5)))" },
  { name: "a leading minus binds tighter than a product", text: "-2 * 3", tree: "((-2) * 3)" },
  { name: "a leading minus chains", text: "--3", tree: "(-(-3))" },
  { name: "a leading minus reaches over a group", text: "-(1 + 2)", tree: "(-(1 + 2))" },
  { name: "a minus on the right of an operator", text: "1 - -2", tree: "(1 - (-2))" },
  { name: "whitespace is nothing to the tree", text: "  1+2  ", tree: "(1 + 2)" },
];

interface FailureCase {
  readonly name: string;
  readonly text: string;
  readonly message: string;
  readonly offset: number;
}

const failureCases: readonly FailureCase[] = [
  {
    name: "empty input",
    text: "",
    message: "expected an operand, found end of input at offset 0",
    offset: 0,
  },
  {
    name: "whitespace alone",
    text: "   ",
    message: "expected an operand, found end of input at offset 3",
    offset: 3,
  },
  {
    name: "an infix operator where a value belongs",
    text: "* 2",
    message: 'expected an operand, found "*" at offset 0',
    offset: 0,
  },
  {
    name: "an operator with nothing on its right",
    text: "1 +",
    message: "expected an operand, found end of input at offset 3",
    offset: 3,
  },
  {
    name: "a minus with nothing to negate",
    text: "3 * -",
    message: "expected an operand, found end of input at offset 5",
    offset: 5,
  },
  {
    name: "an empty group",
    text: "()",
    message: 'expected an operand, found ")" at offset 1',
    offset: 1,
  },
  {
    name: "a group left open",
    text: "(1 + 2",
    message: 'expected ")", found end of input at offset 6',
    offset: 6,
  },
  {
    name: "a group interrupted by a second value",
    text: "(1 + 2 3)",
    message: 'expected ")", found "3" at offset 7',
    offset: 7,
  },
  {
    name: "a closing parenthesis with nothing open",
    text: "1)",
    message: 'expected end of input, found ")" at offset 1',
    offset: 1,
  },
  {
    name: "input past the end of the expression",
    text: "1 2",
    message: 'expected end of input, found "2" at offset 2',
    offset: 2,
  },
];

describe("parse", () => {
  it.each(treeCases)("$name", ({ text, tree }) => {
    expect(render(parse(text))).toBe(tree);
  });

  it("reads a multi-digit literal as one value", () => {
    expect(parse("1234")).toStrictEqual({ kind: "number", value: 1234 });
  });
});

describe("parse rejections", () => {
  it.each(failureCases)("$name", ({ text, message, offset }) => {
    const error = parseErrorFrom(text);

    expect(error.message).toBe(message);
    expect(error.offset).toBe(offset);
    expect(error.name).toBe("ParseError");
    expect(error).toBeInstanceOf(ExpressionError);
  });

  it("points its offset at the token it turned down", () => {
    const text = "12 + 34 )";
    const error = parseErrorFrom(text);

    expect(text.slice(error.offset)).toBe(")");
  });

  it("lets a character the lexer turns down through as it is", () => {
    expect(() => parse("1 $ 2")).toThrow(LexError);
  });
});
