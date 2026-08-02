// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import process from "node:process";
import fc from "fast-check";

// What a run on every save pays for without anyone waiting on it.
const DRAWS_PER_PROPERTY = 100;

// One count reaches every property here. fast-check reads its global settings as a run
// starts and no suite below states a count of its own, which leaves the size of the
// search a decision made where the run begins. Raise FC_NUM_RUNS to hunt longer without
// touching a suite.

// biome-ignore lint/style/noProcessEnv: the count arrives from outside the tree and this one line reads it.
// biome-ignore lint/complexity/useLiteralKeys: `noPropertyAccessFromIndexSignature` in the compiler options asks for the index form here.
fc.configureGlobal({ numRuns: Number(process.env["FC_NUM_RUNS"] ?? DRAWS_PER_PROPERTY) });
