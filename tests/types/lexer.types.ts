// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// What a caller of the lexer is promised, stated as types. `tsconfig.json` takes in
// `tests`, so the blocking compiler gate is what rules on this file: a widened
// return type or a dropped modifier fails `just typecheck`. No runner opens this
// file. `vitest` collects `tests/**/*.test.ts`, and every assertion below is an
// empty function call once the types come off anyway.

import { expectTypeOf } from "expect-type";

import { type LexError, type Token, type TokenKind, tokenize } from "../../src/index.ts";

// The sequence handed back is `readonly`. A caller that sorts or pushes in place is
// rewriting the array the lexer built, and the type is what turns that away.
expectTypeOf(tokenize).returns.toEqualTypeOf<readonly Token[]>();

// Field by field. The modifiers count as part of the record.
expectTypeOf<Token>().toEqualTypeOf<{
  readonly kind: TokenKind;
  readonly lexeme: string;
  readonly offset: number;
}>();

// The union is derived from TOKEN_KINDS rather than written out, so spelling the
// members here is what makes an added or dropped kind a deliberate act.
expectTypeOf<TokenKind>().toEqualTypeOf<
  "number" | "plus" | "minus" | "star" | "slash" | "lparen" | "rparen"
>();

// A caught error carries the position as a number, which is what a caller needs to
// point at the offending character.
expectTypeOf<LexError>().toHaveProperty("offset").toEqualTypeOf<number>();
