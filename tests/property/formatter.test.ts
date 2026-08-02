// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { test } from "@fast-check/vitest";
import { expect } from "vitest";

import { formatExpr, parse } from "../../src/index.ts";
import { expressionTexts } from "../../src/testing/index.ts";

// Canonical text should be a fixed point. Reading one back and writing it out again has
// to produce the same characters, or the form a caller ends up with depends on how many
// trips through here the text has already made.
test.prop([expressionTexts()])("canonical text comes back out unchanged", (text) => {
  expect(formatExpr(parse(text))).toBe(text);
});
