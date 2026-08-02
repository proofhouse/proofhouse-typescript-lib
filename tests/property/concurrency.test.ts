// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { test } from "@fast-check/vitest";
import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type AsyncEvaluator,
  ExprCache,
  evaluateConcurrent,
  evaluateText,
  type Rational,
} from "../../src/index.ts";
import { expressionTexts } from "../../src/testing/index.ts";

// The one text every caller in the properties below asks for.
const SHARED_TEXT = "1+2";

// Enough callers for the scheduler to seat an arrival between another caller's miss and
// the computation that miss began, and few enough that a failing case still reads.
const MIN_CALLERS = 2;
const MAX_CALLERS = 5;

const ONE_COMPUTATION = 1;

// How much of the search each side gets. The real cache is put to the long one. The twin
// below breaks inside the first dozen orderings, so its budget stays small and the check
// that proves it stays cheap.
const SEARCH_RUNS = 1000;
const TWIN_RUNS = 200;

// The twin has to draw the same verdict on every machine and every day, which makes its
// search the one seeded run in the suite.
const TWIN_SEED = 20_260_802;

// Batches stay short enough that a counterexample prints in a couple of lines, and the
// ceiling reaches past one so a full pool and a walk in single file are both drawn.
const MAX_BATCH = 8;
const MAX_LIMIT = 4;
const MIN_LIMIT = 1;

interface Cache {
  get: (text: string) => Promise<Rational>;
}

// A cache written the natural way. The lookup misses and the work is awaited, and only
// once the value is back does the entry go in. Every caller arriving inside that window
// misses too and starts the work over. It stands here as the mistake the property
// underneath has to be able to see, since a property catching nothing passes as quietly
// as one catching everything.
class ExprCacheNoDedup implements Cache {
  readonly #compute: AsyncEvaluator;

  readonly #entries = new Map<string, Rational>();

  constructor(compute: AsyncEvaluator) {
    this.#compute = compute;
  }

  async get(text: string): Promise<Rational> {
    const filed = this.#entries.get(text);
    if (filed !== undefined) {
      return filed;
    }
    const value = await this.#compute(text);
    this.#entries.set(text, value);
    return value;
  }
}

// Whether the reduction answers a text at all. A batch ends at its first refusal where a
// walk in order carries on, so a zero divisor leaves the two sides nothing to compare.
function answered(text: string): boolean {
  try {
    evaluateText(text);
    return true;
  } catch {
    return false;
  }
}

const answerableTexts: Arbitrary<string> = expressionTexts().filter(answered);

// The claim, written once and asked of two caches. Callers want the same text, and the
// scheduler decides both the order they arrive in and the order the work completes in.
// One computation is what a cache owes them.
function computesOnce(build: (compute: AsyncEvaluator) => Cache): fc.IAsyncProperty<unknown[]> {
  return fc.asyncProperty(
    fc.scheduler(),
    fc.integer({ min: MIN_CALLERS, max: MAX_CALLERS }),
    async (scheduler, callers) => {
      let computations = 0;
      const compute = scheduler.scheduleFunction((text: string): Promise<Rational> => {
        computations += 1;
        return Promise.resolve(evaluateText(text));
      });
      const cache = build(compute);
      // Each caller's arrival is a scheduled task in its own right. Start them together
      // in one turn instead and the scheduler has no seat left to move anybody into, and
      // a cache that starts the work twice passes every run.
      const asks = Array.from({ length: callers }, (_, index) =>
        scheduler.schedule(Promise.resolve(index)).then(() => cache.get(SHARED_TEXT)),
      );

      await scheduler.waitFor(Promise.all(asks));

      expect(computations).toBe(ONE_COMPUTATION);
    },
  );
}

describe("ExprCache under an adversarial scheduler", () => {
  it("computes once whatever order the callers arrive and finish in", async () => {
    await fc.assert(
      computesOnce((compute) => new ExprCache(compute)),
      { numRuns: SEARCH_RUNS },
    );
  });

  it("catches a cache that files its entry after the wait", async () => {
    const outcome = await fc.check(
      computesOnce((compute) => new ExprCacheNoDedup(compute)),
      { numRuns: TWIN_RUNS, seed: TWIN_SEED },
    );

    expect(outcome.failed).toBe(true);
  });
});

// A ceiling changes when an expression is reduced. It never changes what the expression
// reduces to. The batch below draws its own ceiling so a pool with room to spare and a
// pool of one are both put to the same claim.
test.prop([
  fc.array(answerableTexts, { maxLength: MAX_BATCH }),
  fc.integer({ min: MIN_LIMIT, max: MAX_LIMIT }),
])("a batch run under a ceiling lands where one run in single file lands", async (texts, limit) => {
  expect(await evaluateConcurrent(texts, limit)).toStrictEqual(texts.map(evaluateText));
});
