// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Only one loader ever opens this file, and it does so with `require`, which fixes the
// format regardless of what the rest of the tree writes. The directive below is the
// part that costs something: a module gets strict mode handed to it and a script has to
// ask.

"use strict";

// The library read top to bottom. The formatter writes a tree back out as text and the
// evaluator reduces one to a number, and each of them asks `parse` for a tree when it is
// handed text instead. `parse` drives the lexer and assembles the tree, the lexer spells
// text into tokens, and the errors at the foot answer to none of them. An import may
// travel down this list and nowhere else, which the rules built underneath the array
// state once per layer. A row that holds several names seats them at one height, where
// each of them is closed to the rest as well as to everything above. Rows for the cache
// and the concurrency work belong here when those modules arrive, and adding one is an
// edit to this array alone.
const LAYERS = [["formatter", "evaluator"], "parser", "ast", "lexer", "tokens", "errors"];

// One name and a row of names read the same way from here down.
function asRow(entry) {
  if (Array.isArray(entry)) {
    return entry;
  }
  return [entry];
}

const rows = LAYERS.map(asRow);

const layerRules = rows.slice(1).flatMap((row, index) => {
  const higher = rows.slice(0, index + 1).flat();
  const reach = higher.join(" or ");
  return row.map((layer) => ({
    name: `no-${layer}-to-upper`,
    comment: `Imports run down the layer list. ${layer} may not reach ${reach}.`,
    severity: "error",
    from: { path: `^src/${layer}[.]ts$` },
    to: { path: `^src/(${higher.join("|")})[.]ts$` },
  }));
});

const siblingRules = rows.flatMap((row) =>
  row.flatMap((layer) =>
    row
      .filter((sibling) => sibling !== layer)
      .map((sibling) => ({
        name: `no-${layer}-to-${sibling}`,
        comment: `${layer} and ${sibling} stand at one height, so neither one imports the other.`,
        severity: "error",
        from: { path: `^src/${layer}[.]ts$` },
        to: { path: `^src/${sibling}[.]ts$` },
      })),
  ),
);

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    ...layerRules,
    ...siblingRules,
    {
      name: "no-testing-in-production",
      comment:
        "Helpers written for suites to lean on ship inside the package and belong on " +
        "nobody's runtime path. Anything under src living outside that directory has " +
        "to stay clear of it. The directory itself turns up with the property-testing " +
        "work and this rule waits here so the first file lands already fenced.",
      severity: "error",
      from: { path: "^src", pathNot: "^src/testing" },
      to: { path: "^src/testing" },
    },
    {
      name: "no-circular",
      comment:
        "A cycle offers no end to begin at. Following either module means holding the " +
        "whole loop open, and loading or testing one of them drags the rest along. " +
        "Sink whatever both ends want into a module beneath them and the loop parts.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment:
        "A file with no import running into it or out of it is work that stalled or " +
        "work that finished and left. The exemption below covers the module the " +
        "exports map points consumers at, which nothing inside this tree should reach " +
        "for.",
      severity: "error",
      from: { orphan: true, pathNot: ["^src/index[.]ts$"] },
      to: {},
    },
    {
      name: "no-unreachable-from-entry",
      comment:
        "The walk sets out from the module consumers enter through and has to arrive " +
        "at each file under src. A pair of modules importing one another and nothing " +
        "besides clears the orphan rule above while running for nobody at all.",
      severity: "error",
      from: { path: "^src/index[.]ts$" },
      to: { path: "^src", reachable: false },
    },
  ],
  options: {
    // These three directories hold copies of the sources or of their dependencies, and
    // the edges inside them describe somebody else's decisions.
    exclude: { path: "node_modules|dist|coverage" },
    // Count an `import type` as an edge like any other. Skip them and a module wanted
    // for its types alone looks like it has no caller, while a loop closing through one
    // never shows up at all.
    tsPreCompilationDeps: "specify",
    // Point the resolver at the settings the compiler already works under. Nothing else
    // teaches it that a specifier ending in `.ts` is what this tree writes.
    tsConfig: { fileName: "tsconfig.json" },
  },
};
