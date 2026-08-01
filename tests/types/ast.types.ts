// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// What a parsed tree is made of, stated as types. A caller that walks the tree reads
// these records field by field, so their shape is as much of the contract as the
// functions are. `tsconfig.json` takes in `tests`, which leaves the blocking compiler
// gate to rule on the file, and `vitest` collects `tests/**/*.test.ts` and never opens
// it. The assertions compile away to empty calls.

import { expectTypeOf } from "expect-type";

import {
  type BinaryOp,
  type BinaryOperator,
  type Expr,
  // The leaf shares its name with a global, which the lint rules turn down as an
  // identifier here even where the tree it belongs to reads better for it.
  type Number as NumberNode,
  parse,
  type UnaryOp,
  type UnaryOperator,
} from "../../src/index.ts";

// A parse hands back the union and not one arm of it. The caller narrows.
expectTypeOf(parse).returns.toEqualTypeOf<Expr>();

// The leaf, which carries the value the digits stood for and not the digits.
expectTypeOf<NumberNode>().toEqualTypeOf<{
  readonly kind: "number";
  readonly value: number;
}>();

// One operand under a prefix operator, and any node at all can be that operand.
expectTypeOf<UnaryOp>().toEqualTypeOf<{
  readonly kind: "unary";
  readonly operator: UnaryOperator;
  readonly operand: Expr;
}>();

// An infix operator with an operand on each side. Left and right hold the order the
// source wrote them in.
expectTypeOf<BinaryOp>().toEqualTypeOf<{
  readonly kind: "binary";
  readonly operator: BinaryOperator;
  readonly left: Expr;
  readonly right: Expr;
}>();

// The union closes here. A walk over it stays exhaustive until another node type is
// added on purpose.
expectTypeOf<Expr>().toEqualTypeOf<NumberNode | UnaryOp | BinaryOp>();
