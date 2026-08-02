// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Cache collapsing repeated asks for one expression onto a single computation.

import type { Rational } from "../evaluator.ts";

/**
 * How a cache turns expression text into a value.
 *
 * The reduction this package performs is synchronous, so the shape exists for the work a
 * caller puts behind it: a value fetched over a network, or one handed to a worker thread.
 *
 * @param text - The expression source to reduce.
 * @returns The value that text stands for.
 */
export type AsyncEvaluator = (text: string) => Promise<Rational>;

/**
 * Keeps one computation per expression text and hands it to everyone asking for it.
 *
 * Callers naming the same text share a promise, and the work behind it runs one time. That
 * holds for a caller arriving while an earlier one is still waiting, which is the case a
 * cache written around `await` gets wrong. The entry is filed before this class gives up
 * its turn, so no window opens in which a lookup misses work already under way.
 *
 * A failure isn't kept. The entry drops out once the work rejects and the next ask starts
 * a fresh attempt, so a divisor that was zero for one caller doesn't decide the answer for
 * every caller after. Everyone waiting on the failed attempt still sees the rejection.
 */
export class ExprCache {
  readonly #compute: AsyncEvaluator;

  readonly #entries = new Map<string, Promise<Rational>>();

  /**
   * @param compute - The work to run for a text the cache hasn't seen.
   */
  constructor(compute: AsyncEvaluator) {
    this.#compute = compute;
  }

  /**
   * Reads the value for an expression, starting the work if nobody has.
   *
   * @param text - The expression source to reduce.
   * @returns The value that text stands for, shared with every other caller naming it.
   */
  get(text: string): Promise<Rational> {
    const filed = this.#entries.get(text);
    if (filed !== undefined) {
      return filed;
    }
    // Calling an `async` function runs it up to its first `await` and no further. No
    // `await` stands between the two statements below. The entry is in the map before
    // control leaves this method. That alone is what makes a second caller in the same
    // turn a hit rather than a second run.
    const started = this.#compute(text).catch((reason: unknown) => {
      this.#entries.delete(text);
      throw reason;
    });
    this.#entries.set(text, started);
    return started;
  }
}
