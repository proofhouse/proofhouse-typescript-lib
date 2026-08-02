// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { describe, expect, it } from "vitest";

import { operatorSymbol } from "../src/formatter.ts";
import { BINARY_OPERATORS, type Expr, formatExpr, parse, UNARY_OPERATORS } from "../src/index.ts";

interface TextCase {
  readonly name: string;
  readonly text: string;
  readonly canonical: string;
}

// Each row parses the text on the left and writes the tree back out, so the string on
// the right is both the canonical form of that tree and, read as input, a spelling of
// the same tree the formatter had nothing left to change about.
const textCases: readonly TextCase[] = [
  { name: "a literal on its own", text: "42", canonical: "42" },
  { name: "spacing around an infix operator", text: "1+2", canonical: "1 + 2" },
  { name: "spacing is fixed, not preserved", text: "1   +2", canonical: "1 + 2" },
  { name: "the higher rank needs no bracket", text: "1+2*3", canonical: "1 + 2 * 3" },
  { name: "and loses one it arrived with", text: "1+(2*3)", canonical: "1 + 2 * 3" },
  { name: "the lower rank keeps its bracket", text: "(1+2)*3", canonical: "(1 + 2) * 3" },
  { name: "a higher rank on the left goes bare", text: "(1*2)+3", canonical: "1 * 2 + 3" },
  { name: "a chain to the left goes bare", text: "9-5-2", canonical: "9 - 5 - 2" },
  { name: "the same chain regrouped keeps a bracket", text: "9-(5-2)", canonical: "9 - (5 - 2)" },
  { name: "division chains to the left too", text: "8/4/2", canonical: "8 / 4 / 2" },
  { name: "a divisor that is itself a quotient", text: "8/(4/2)", canonical: "8 / (4 / 2)" },
  { name: "a product on the right of a product", text: "2*(3*4)", canonical: "2 * (3 * 4)" },
  { name: "a product on the left of one", text: "(2*3)*4", canonical: "2 * 3 * 4" },
  { name: "a sum under a quotient", text: "6/(2+1)", canonical: "6 / (2 + 1)" },
  { name: "a group that wrapped a literal", text: "((7))", canonical: "7" },
  { name: "a prefix minus hugs its operand", text: "-3", canonical: "-3" },
  { name: "and chains with nothing between", text: "--3", canonical: "--3" },
  { name: "a minus reaching over a sum", text: "-(1+2)", canonical: "-(1 + 2)" },
  { name: "a minus reaching over a product", text: "-(2*3)", canonical: "-(2 * 3)" },
  { name: "a minus on an operand of a product", text: "-2*3", canonical: "-2 * 3" },
  { name: "a minus on the right of an operator", text: "1- -2", canonical: "1 - -2" },
  { name: "a negative multiplier", text: "2*-3", canonical: "2 * -3" },
  { name: "a negative divisor", text: "1/-3", canonical: "1 / -3" },
];

interface TreeCase {
  readonly name: string;
  readonly tree: Expr;
  readonly canonical: string;
}

const three: Expr = { kind: "number", value: 3 };

// Trees written out by hand, which fixes the expected string against the tree itself
// rather than against whatever the parser made of some source.
const treeCases: readonly TreeCase[] = [
  { name: "a literal", tree: three, canonical: "3" },
  {
    name: "a negation",
    tree: { kind: "unary", operator: "neg", operand: three },
    canonical: "-3",
  },
  {
    name: "a sum of two literals",
    tree: {
      kind: "binary",
      operator: "add",
      left: { kind: "number", value: 1 },
      right: { kind: "number", value: 2 },
    },
    canonical: "1 + 2",
  },
  {
    name: "a difference nested on the right",
    tree: {
      kind: "binary",
      operator: "sub",
      left: { kind: "number", value: 9 },
      right: {
        kind: "binary",
        operator: "sub",
        left: { kind: "number", value: 5 },
        right: { kind: "number", value: 2 },
      },
    },
    canonical: "9 - (5 - 2)",
  },
  {
    name: "a quotient of a sum by a negation",
    tree: {
      kind: "binary",
      operator: "div",
      left: {
        kind: "binary",
        operator: "add",
        left: { kind: "number", value: 1 },
        right: { kind: "number", value: 2 },
      },
      right: { kind: "unary", operator: "neg", operand: three },
    },
    canonical: "(1 + 2) / -3",
  },
];

describe("formatExpr", () => {
  it.each(textCases)("$name", ({ text, canonical }) => {
    expect(formatExpr(parse(text))).toBe(canonical);
  });

  it.each(treeCases)("$name written out by hand", ({ tree, canonical }) => {
    expect(formatExpr(tree)).toBe(canonical);
  });

  it.each(textCases)("$name, written a second time", ({ canonical }) => {
    expect(formatExpr(parse(canonical))).toBe(canonical);
  });
});

describe("operatorSymbol", () => {
  it("spells every operator the grammar declares", () => {
    expect(BINARY_OPERATORS.map(operatorSymbol)).toStrictEqual(["+", "-", "*", "/"]);
    expect(UNARY_OPERATORS.map(operatorSymbol)).toStrictEqual(["-"]);
  });
});

describe("the round trip through parse", () => {
  it.each(textCases)("$name", ({ text }) => {
    const tree = parse(text);

    expect(parse(formatExpr(tree))).toStrictEqual(tree);
  });

  it.each(treeCases)("$name written out by hand", ({ tree }) => {
    expect(parse(formatExpr(tree))).toStrictEqual(tree);
  });
});
