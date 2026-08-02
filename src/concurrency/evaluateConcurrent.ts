// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Batch reduction holding a ceiling on how much runs at once.

import { evaluateText, type Rational } from "../evaluator.ts";
import type { AsyncEvaluator } from "./exprCache.ts";

// One expression in flight is the least a batch can proceed on. Zero would leave the
// runner holding a batch it never starts.
const MIN_LIMIT = 1;

// What runs when a caller names no worker of its own. Reduction here costs microseconds,
// and giving up the turn first is what keeps a long batch from holding the loop for the
// whole of its length.
async function reduceHere(text: string): Promise<Rational> {
  await Promise.resolve();
  return evaluateText(text);
}

/**
 * Reduces a batch of expressions under a ceiling on how many run at once.
 *
 * Results come back in the order the texts arrived, whatever order the work finished in.
 * A caller reaches for the ceiling when each reduction costs something outside this
 * process. Ten thousand texts handed over at once open ten thousand of whatever the worker
 * opens.
 *
 * The first failure is the batch's failure. Work already under way runs to its end with
 * its results dropped. No text past that point starts.
 *
 * @param texts - The expression sources to reduce. Results arrive in this order.
 * @param limit - How many may be in flight at once. One or higher.
 * @param compute - What reduces one text. Defaults to reducing it in this process.
 * @returns The values those texts stand for, positioned as the texts were.
 * @throws {@link RangeError} When the limit leaves nothing able to run.
 */
export async function evaluateConcurrent(
  texts: readonly string[],
  limit: number,
  compute: AsyncEvaluator = reduceHere,
): Promise<readonly Rational[]> {
  if (limit < MIN_LIMIT) {
    throw new RangeError(`limit must be ${String(MIN_LIMIT)} or higher, got ${String(limit)}`);
  }
  const values: Rational[] = [];
  // One cursor over the batch, shared by every worker below. Each of them takes the next
  // text the moment it comes free, which keeps a slow expression from stalling the rest of
  // its share while another worker has nothing to do.
  const remaining = texts.entries();
  async function work(): Promise<void> {
    for (let next = remaining.next(); next.done !== true; next = remaining.next()) {
      const [index, text] = next.value;
      // biome-ignore lint/performance/noAwaitInLoops: a worker takes the next text only once it's free, which is what the ceiling means.
      values[index] = await compute(text);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, texts.length) }, work));
  return values;
}
