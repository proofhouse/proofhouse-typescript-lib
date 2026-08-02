// SPDX-License-Identifier: Apache-2.0
// Copyright Authors of Proofhouse

// The coverage job rules on one merged report, and a merge that lost a slot on the way
// still writes a well-formed lcov file. Parsing it is therefore no evidence of anything.
// What follows puts the threshold question to the merged numbers a second time: for each
// record, and again for the report taken whole, the lines and branches and functions a
// file declares have to match the ones a run reached. An empty report fails too, because
// there is nothing in it for a comparison to catch.

import { readFileSync } from "node:fs";
import process from "node:process";

// One row per kind of measurement: the key lcov writes the declared count under, the key
// it writes the reached count under, and the word a shortfall gets described in.
const MEASURES = [
  { total: "LF", covered: "LH", noun: "lines" },
  { total: "BRF", covered: "BRH", noun: "branches" },
  { total: "FNF", covered: "FNH", noun: "functions" },
];

const HEADER = /^SF:(.+)$/;
const COUNT = /^(LF|LH|BRF|BRH|FNF|FNH):(\d+)$/;
const LINE_BREAK = /\r?\n/;
const NO_ARGUMENT = 2;

// Splits the report into one entry per record: the source path the record opened with
// and the counts it declared. The entries stay in file order rather than going into a
// map, so a merge that emitted one path twice gets read as two records instead of
// quietly collapsing to the last of them.
function readRecords(text) {
  const records = [];
  let counts = new Map();
  for (const line of text.split(LINE_BREAK)) {
    const [, path] = HEADER.exec(line) ?? [];
    const [, key, value] = COUNT.exec(line) ?? [];
    if (path !== undefined) {
      counts = new Map();
      records.push({ path, counts });
    } else if (key !== undefined) {
      counts.set(key, Number(value));
    }
  }
  return records;
}

// Describes every measure whose reached count falls short of its declared one.
function shortfalls(subject, counts) {
  const misses = [];
  for (const measure of MEASURES) {
    const total = counts.get(measure.total) ?? 0;
    const covered = counts.get(measure.covered) ?? 0;
    if (covered !== total) {
      misses.push(`${subject}: ${covered} of ${total} ${measure.noun} covered`);
    }
  }
  return misses;
}

const [report] = process.argv.slice(2);
if (report === undefined) {
  process.stderr.write("usage: check-lcov.mjs <merged lcov report>\n");
  process.exit(NO_ARGUMENT);
}

const records = readRecords(readFileSync(report, "utf8"));
const failures = records.flatMap((record) => shortfalls(record.path, record.counts));

if (records.length === 0) {
  failures.push(`${report}: holds no coverage records`);
} else {
  const totals = new Map();
  for (const record of records) {
    for (const [key, value] of record.counts) {
      totals.set(key, (totals.get(key) ?? 0) + value);
    }
  }
  failures.push(...shortfalls(`${report} over ${records.length} files`, totals));
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`${report}: ${records.length} files covered in full\n`);
