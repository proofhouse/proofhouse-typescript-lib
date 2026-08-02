// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Public surface of the reference library for the Proofhouse TypeScript lib repository.

import { readFileSync } from "node:fs";

// The manifest is read at run time instead of imported as a JSON module: a static import
// pulls package.json under `rootDir` and reshapes what the build emits into dist. The
// relative URL resolves to the package root from src/ in a checkout and from dist/ in a
// packed tarball.
const manifestUrl: URL = new URL("../package.json", import.meta.url);

/**
 * Reads the version this package was built as.
 *
 * The value comes from the installed package manifest, so a consumer sees the version
 * of the copy it actually resolved rather than one frozen into the compiled output.
 *
 * @returns The manifest version string, such as `0.0.0`.
 * @throws {@link Error} When the manifest carries no string version field.
 */
export function version(): string {
  const manifest: unknown = JSON.parse(readFileSync(manifestUrl, "utf8"));
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("version" in manifest) ||
    typeof manifest.version !== "string"
  ) {
    throw new Error("package manifest carries no string version field");
  }
  return manifest.version;
}

// biome-ignore lint/performance/noBarrelFile: the exports map names this module as the entry point.
export {
  BINARY_OPERATORS,
  type BinaryOp,
  type BinaryOperator,
  type Expr,
  type Number,
  UNARY_OPERATORS,
  type UnaryOp,
  type UnaryOperator,
} from "./ast.ts";
export { DivisionByZeroError, ExpressionError, LexError, ParseError } from "./errors.ts";
export { evaluate, evaluateText, type Rational } from "./evaluator.ts";
export { formatExpr } from "./formatter.ts";
export { tokenize } from "./lexer.ts";
export { parse } from "./parser.ts";
export { TOKEN_KINDS, type Token, type TokenKind } from "./tokens.ts";
