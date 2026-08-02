// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Formatter writing an expression tree back out as source text.

import type { BinaryOperator, Expr, UnaryOperator } from "./ast.ts";

// The character the lexer reads each operator out of. Both operator unions key the one
// table, which they can because no name falls in both of them, and the compiler holds
// the table to every name either union declares.
const OPERATOR_SYMBOLS: Readonly<Record<BinaryOperator | UnaryOperator, string>> = {
  add: "+",
  sub: "-",
  mul: "*",
  div: "/",
  neg: "-",
};

// Binding powers on the grammar's own scale, matching the ranking the parser reads text
// under. A prefix minus outranks both infix ranks, and a literal outranks everything,
// which is what leaves those two needing no bracket wherever they land.
const ADDITIVE = 1;
const MULTIPLICATIVE = 2;
const UNARY = 3;
const ATOM = 4;

// A chain of equally binding operators groups from the left, so the operand on the right
// has to clear its operator by a step where the one on the left may tie it.
const RIGHT_OPERAND_STEP = 1;

// How tightly one infix operator binds. Each operator gets an arm of its own rather than
// a test for membership in the higher rank, which leaves an operator added to the
// grammar a compiler error here rather than a silent demotion to the weaker rank.
function binaryPrecedence(operator: BinaryOperator): number {
  switch (operator) {
    case "add":
    case "sub":
      return ADDITIVE;
    case "mul":
    case "div":
      return MULTIPLICATIVE;
  }
}

// What a node binds at, read off its kind.
function precedence(expr: Expr): number {
  switch (expr.kind) {
    case "number":
      return ATOM;
    case "unary":
      return UNARY;
    case "binary":
      return binaryPrecedence(expr.operator);
  }
}

// Writes a child out and brackets it where the slot binds tighter than the child does.
// Under that threshold the text would come back through the parser attached to something
// else. From the threshold up, a bracket would be a second spelling of the one tree.
function formatChild(child: Expr, minPrecedence: number): string {
  const text = formatExpr(child);
  if (precedence(child) < minPrecedence) {
    return `(${text})`;
  }
  return text;
}

/**
 * Reads the source character an operator is written with.
 *
 * The formatter builds its output out of these. A suite that renders a tree in some shape
 * of its own reads them here too, rather than keeping a second table that this one could
 * drift away from.
 *
 * @param operator - The operator to spell.
 * @returns The one character the lexer reads that operator out of.
 */
export function operatorSymbol(operator: BinaryOperator | UnaryOperator): string {
  return OPERATOR_SYMBOLS[operator];
}

/**
 * Writes a tree out as the one source text this library spells it with.
 *
 * Spacing never varies. An infix operator takes a single space on either side of it, and
 * a prefix minus takes none at all between itself and what it negates. Brackets go where
 * the ranking asks for them and nowhere else, which leaves the pair around `(1 + 2) * 3`
 * in place while `1 + 2 * 3` stands bare. Handing the result back to `parse` returns a
 * tree equal to the one that went in.
 *
 * @param expr - The root of the tree to write out.
 * @returns The canonical source text for that tree.
 */
export function formatExpr(expr: Expr): string {
  switch (expr.kind) {
    case "number":
      return String(expr.value);
    case "unary":
      return `${operatorSymbol(expr.operator)}${formatChild(expr.operand, UNARY)}`;
    case "binary": {
      const power = binaryPrecedence(expr.operator);
      const left = formatChild(expr.left, power);
      const right = formatChild(expr.right, power + RIGHT_OPERAND_STEP);
      return `${left} ${operatorSymbol(expr.operator)} ${right}`;
    }
  }
}
