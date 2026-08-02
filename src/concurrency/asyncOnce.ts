// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Single-flight wrapper around work that should happen one time.

/**
 * Wraps a function so the work behind it runs one time for any number of callers.
 *
 * The first call starts the work and every caller after it receives the promise that call
 * produced, arrivals partway through included. Whatever the one run settled on is what
 * comes back from then on, a rejection as much as a value. What the wrapper holds to is a
 * single run rather than a single success, so code wanting a fresh attempt after a failure
 * wraps the function again.
 *
 * @param initialize - The work to run once.
 * @returns A function handing back the result of that run.
 */
export function asyncOnce<T>(initialize: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  // Nothing waits between the test and the assignment, so a second caller arriving in the
  // same turn of the loop finds the promise the first one left rather than starting the
  // work over.
  return (): Promise<T> => {
    pending ??= initialize();
    return pending;
  };
}
