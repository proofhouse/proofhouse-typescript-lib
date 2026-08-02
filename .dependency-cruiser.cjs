// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// Only one loader ever opens this file, and it does so with `require`, which fixes the
// format regardless of what the rest of the tree writes. The directive below is the
// part that costs something: a module gets strict mode handed to it and a script has to
// ask.

"use strict";

// The library read top to bottom. The concurrency work sits over all of it: a cache and a
// batch runner drive the pieces below them and nothing below knows either one exists. The
// formatter writes a tree back out as text and the evaluator reduces one to a number, and
// each of them asks `parse` for a tree when it is handed text instead. `parse` drives the
// lexer and assembles the tree, the lexer spells text into tokens, and the errors at the
// foot answer to none of them. An import may travel down this list and nowhere else, which
// the rules built underneath the array state once per layer. A row that holds several
// names seats them at one height, where each of them is closed to the rest as well as to
// everything above. A name ending in a slash is a directory rather than a module, and
// every file under it shares the one height. Adding a layer stays an edit to this array
// alone.
const LAYERS = [
  "concurrency/",
  ["formatter", "evaluator"],
  "parser",
  "ast",
  "lexer",
  "tokens",
  "errors",
];

// One name and a row of names read the same way from here down.
function asRow(entry) {
  if (Array.isArray(entry)) {
    return entry;
  }
  return [entry];
}

// Which files an entry stands for. A directory reaches whatever is under it, at whatever
// depth, while a plain name reaches the one module spelling it.
function pathOf(layer) {
  if (layer.endsWith("/")) {
    return `^src/${layer}`;
  }
  return `^src/${layer}[.]ts$`;
}

// The entry as prose reads it, without the mark that made it a directory.
function nameOf(layer) {
  if (layer.endsWith("/")) {
    return layer.slice(0, -1);
  }
  return layer;
}

const rows = LAYERS.map(asRow);

const layerRules = rows.slice(1).flatMap((row, index) => {
  const higher = rows.slice(0, index + 1).flat();
  const reach = higher.map(nameOf).join(" or ");
  return row.map((layer) => ({
    name: `no-${nameOf(layer)}-to-upper`,
    comment: `Imports run down the layer list. ${nameOf(layer)} may not reach ${reach}.`,
    severity: "error",
    from: { path: pathOf(layer) },
    to: { path: higher.map(pathOf) },
  }));
});

const siblingRules = rows.flatMap((row) =>
  row.flatMap((layer) =>
    row
      .filter((sibling) => sibling !== layer)
      .map((sibling) => {
        const here = nameOf(layer);
        const there = nameOf(sibling);
        return {
          name: `no-${here}-to-${there}`,
          comment: `${here} and ${there} stand at one height, so neither one imports the other.`,
          severity: "error",
          from: { path: pathOf(layer) },
          to: { path: pathOf(sibling) },
        };
      }),
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
        "Generators written for suites to draw from ship inside the package and belong " +
        "on nobody's runtime path. Anything under src living outside that directory " +
        "has to stay clear of it, which is what leaves a caller entering through the " +
        "main module with no test dependency loaded behind it.",
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
        "work that finished and left. The exemptions below cover the two modules the " +
        "exports map points consumers at, which nothing inside this tree should reach " +
        "for.",
      severity: "error",
      from: { orphan: true, pathNot: ["^src/index[.]ts$", "^src/testing/index[.]ts$"] },
      to: {},
    },
    {
      name: "no-unreachable-from-entry",
      comment:
        "The walk sets out from the module consumers enter through and has to arrive " +
        "at every file beside it. A pair of modules importing one another and nothing " +
        "besides clears the orphan rule above while running for nobody at all. The " +
        "generators are left out because the main module is precisely what must not " +
        "reach them.",
      severity: "error",
      from: { path: "^src/index[.]ts$" },
      to: { path: "^src", pathNot: "^src/testing", reachable: false },
    },
    {
      name: "no-unreachable-from-testing-entry",
      comment:
        "The same walk over the other subpath, which the exports map hands out under " +
        "its own name and no module here imports. A rule naming both roots at once " +
        "would ask each of them to reach what the other one does, and neither one " +
        "ever will.",
      severity: "error",
      from: { path: "^src/testing/index[.]ts$" },
      to: { path: "^src/testing", reachable: false },
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
