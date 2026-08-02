// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

import { describe, expect, it } from "vitest";

import {
  asyncOnce,
  DivisionByZeroError,
  ExprCache,
  evaluateConcurrent,
  evaluateText,
  type Rational,
} from "../src/index.ts";

const TEXT = "1/2";
const HALF: Rational = { num: 1n, den: 2n };

const FIRST_RUN = 1;
const SECOND_RUN = 2;

// A batch four times the ceiling, so the workers come back for more than one round.
const BATCH = 12;
const LIMIT = 3;
const ONE_AT_A_TIME = 1;
const NONE_AT_A_TIME = 0;

describe("asyncOnce", () => {
  it("runs the work once however many callers ask for it", async () => {
    let runs = 0;
    const once = asyncOnce((): Promise<number> => {
      runs += 1;
      return Promise.resolve(runs);
    });

    const [first, second] = await Promise.all([once(), once()]);
    const third = await once();

    expect(runs).toBe(FIRST_RUN);
    expect(first).toBe(FIRST_RUN);
    expect(second).toBe(FIRST_RUN);
    expect(third).toBe(FIRST_RUN);
  });

  it("keeps whatever the one run settled on, a failure included", async () => {
    let runs = 0;
    const once = asyncOnce((): Promise<number> => {
      runs += 1;
      return Promise.reject(new DivisionByZeroError());
    });

    await expect(once()).rejects.toBeInstanceOf(DivisionByZeroError);
    await expect(once()).rejects.toBeInstanceOf(DivisionByZeroError);
    expect(runs).toBe(FIRST_RUN);
  });
});

describe("ExprCache", () => {
  it("files the entry before it yields, so a caller mid-flight is a hit", async () => {
    let runs = 0;
    const gate = Promise.withResolvers<Rational>();
    const cache = new ExprCache((): Promise<Rational> => {
      runs += 1;
      return gate.promise;
    });

    const first = cache.get(TEXT);
    const second = cache.get(TEXT);
    expect(second).toBe(first);
    expect(runs).toBe(FIRST_RUN);

    gate.resolve(HALF);
    await expect(first).resolves.toStrictEqual(HALF);
    await expect(second).resolves.toStrictEqual(HALF);
  });

  it("answers a later caller from the entry it kept", async () => {
    let runs = 0;
    const cache = new ExprCache((text): Promise<Rational> => {
      runs += 1;
      return Promise.resolve(evaluateText(text));
    });

    await expect(cache.get(TEXT)).resolves.toStrictEqual(HALF);
    await expect(cache.get(TEXT)).resolves.toStrictEqual(HALF);
    expect(runs).toBe(FIRST_RUN);
  });

  it("drops a failed attempt and lets the next caller start another", async () => {
    let runs = 0;
    const cache = new ExprCache((text): Promise<Rational> => {
      runs += 1;
      if (runs === FIRST_RUN) {
        return Promise.reject(new DivisionByZeroError());
      }
      return Promise.resolve(evaluateText(text));
    });

    await expect(cache.get(TEXT)).rejects.toBeInstanceOf(DivisionByZeroError);
    await expect(cache.get(TEXT)).resolves.toStrictEqual(HALF);
    expect(runs).toBe(SECOND_RUN);
  });
});

describe("evaluateConcurrent", () => {
  it("returns the values positioned as their texts were", async () => {
    const values = await evaluateConcurrent(["1+1", TEXT, "6/3"], LIMIT);

    expect(values).toStrictEqual([{ num: 2n, den: 1n }, HALF, { num: 2n, den: 1n }]);
  });

  it("takes an empty batch to an empty result", async () => {
    await expect(evaluateConcurrent([], LIMIT)).resolves.toStrictEqual([]);
  });

  it("turns down a ceiling that would leave nothing able to run", async () => {
    await expect(evaluateConcurrent([TEXT], NONE_AT_A_TIME)).rejects.toBeInstanceOf(RangeError);
  });

  it("holds the number in flight to the ceiling", async () => {
    let live = 0;
    let peak = 0;
    // The count rises before the yield and falls after it, so the mark left behind names
    // every worker that had started and not finished at one moment.
    async function evaluate(text: string): Promise<Rational> {
      live += 1;
      peak = Math.max(peak, live);
      await Promise.resolve();
      live -= 1;
      return evaluateText(text);
    }
    const texts = Array.from({ length: BATCH }, (_, index) => String(index));

    const values = await evaluateConcurrent(texts, LIMIT, evaluate);

    expect(values).toHaveLength(BATCH);
    expect(peak).toBe(LIMIT);
  });

  it("fails the batch on the first refusal", async () => {
    await expect(evaluateConcurrent([TEXT, "1/0", "3"], ONE_AT_A_TIME)).rejects.toBeInstanceOf(
      DivisionByZeroError,
    );
  });
});
