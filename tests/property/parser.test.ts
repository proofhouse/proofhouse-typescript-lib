// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { test } from "@fast-check/vitest";
import { expect } from "vitest";

import { formatExpr, parse } from "../../src/index.ts";
import { expressions } from "../../src/testing/index.ts";

// Deep enough for a bracket to sit under a bracket, which is where the writer and the
// reader have the most room to disagree.
const DEPTH = 4;

// The table-driven suite next door picks the shapes somebody thought to write down. This
// says the same thing about every shape at once. Whatever the writer emits, the reader
// takes back to the tree behind it.
test.prop([expressions(DEPTH)])("a tree written out and read back arrives unchanged", (expr) => {
  expect(parse(formatExpr(expr))).toStrictEqual(expr);
});
