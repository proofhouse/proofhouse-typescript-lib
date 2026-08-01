// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Node types the parser builds an expression out of.
//
// The tree stays small. One leaf carries a value and two branches carry operators, which
// is shape enough for the grammar the lexer feeds and little enough that a reader can
// hold it all at once without going to a diagram for help. Nodes carry no source
// position. Offsets belong to the tokens.

/**
 * The prefix operators the grammar spells.
 *
 * Negation is the only one so far. {@link UnaryOperator} derives its union from this
 * array, so the runtime list and the type can't drift apart, and code that wants to show
 * a reader which operators exist can read them off here rather than restate them and
 * wait to learn that a later release added one.
 */
export const UNARY_OPERATORS = ["neg"] as const;

/** Operator a {@link UnaryOp} node applies to its operand. */
export type UnaryOperator = (typeof UNARY_OPERATORS)[number];

/** The infix operators the grammar spells, weakest binding first. */
export const BINARY_OPERATORS = ["add", "sub", "mul", "div"] as const;

/** Operator a {@link BinaryOp} node applies to its operands. */
export type BinaryOperator = (typeof BINARY_OPERATORS)[number];

/** Integer literal, the one leaf the tree has. */
export interface Number {
  /** Marks a literal. */
  readonly kind: "number";
  /** The value the digits spelled, read in base ten. */
  readonly value: number;
}

/** Prefix operator standing in front of one operand. */
export interface UnaryOp {
  /** Marks a negation, and tells this node apart from the two beside it. */
  readonly kind: "unary";
  /** Which prefix operator to apply. */
  readonly operator: UnaryOperator;
  /** What it applies to, which is any node at all, negations included. */
  readonly operand: Expr;
}

/** Infix operator standing between a left and a right operand. */
export interface BinaryOp {
  /** Marks an operator with two operands. */
  readonly kind: "binary";
  /** Which infix operator to apply. */
  readonly operator: BinaryOperator;
  /** The operand on the left. */
  readonly left: Expr;
  /** The one on the right. */
  readonly right: Expr;
}

/**
 * Any node a parsed expression can hold.
 *
 * The `kind` field is what tells the arms apart. A `switch` over it narrows to one node
 * type per arm and the compiler counts those arms against the union, so a walk that
 * forgets a node type stops at the compiler rather than at the one input it has no arm
 * for. Every operand is itself an `Expr`, which lets a group nest as far down as the
 * source cares to take it and leaves any walk over the tree recursive in the same shape
 * the tree has.
 */
export type Expr = Number | UnaryOp | BinaryOp;
