# Agent instructions

Guidance for AI coding agents working in this repository. Read it alongside the per-tool documentation and any memory files the harness loads.

## Commit messages

Draft every commit message in `COMMIT_AGENTMSG` at the repo root before you run `git commit`. A gitignore entry keeps that file out of history, so it serves purely as a scratchpad for iterating on the message. The workflow goes like this.

1. Write the full message (subject, body, and trailers) to `COMMIT_AGENTMSG`.
2. Run `just lint-commit-msg` and resolve whatever it reports.
3. Commit the validated draft with `git commit -F COMMIT_AGENTMSG`.

`just lint-commit-msg` mirrors the commit-msg hook. Vale reads the message under the commit scope (which catches AI commit tells via `ai-tells-commits`). cspell reads it against the commit dictionary. commitlint checks the Conventional Commits shape, and commit-trailers checks trailer order. Running it while drafting surfaces problems early, rather than at the commit-msg hook where a late failure interrupts the commit.

The prek commit-msg hook on `.git/COMMIT_EDITMSG` stays the real gate. `COMMIT_AGENTMSG` and its recipe only preview that gate, so a clean recipe run predicts a clean commit but never replaces the hook.

## Coverage hints

Every line, branch, function, and statement under `src` has to carry a test behind it, and each file answers for its own numbers. When the report calls a branch uncovered, a test is missing, and writing that test is the fix. A `v8 ignore` hint belongs only where no test could reach the line at all, and it always reads `/* v8 ignore <kind> -- @preserve: <reason> */`. Drop the `@preserve` marker and the transform strips the comment before the coverage provider ever sees it. Whoever reviews the change weighs the reason after the colon.

`v8 ignore next 3` looks like it names a count, and it doesn't. One line drops out while the other two stay scored, which leaves the gate green over a hole nobody wrote down. Wrap a span in `v8 ignore start` and `v8 ignore stop` instead. Excusing one arm of a conditional means putting the hint inside that arm, since a hint over the `if` speaks about the statement rather than about either branch beneath it.

Reviewers reject a hint with no reason beside it, the same way they reject an undocumented lint suppression. Nothing in this repository carries a hint today.

## Regression examples

The suites under `tests/property` remember nothing between runs. fast-check draws its cases fresh each time and lets them go when the process ends, so a case that once broke the code comes back only by chance. Carry it in the change instead. A failing property prints the shrunk value it settled on, together with the seed and the path it took to get there. Write that value into a plain test beside the property. Watch that test fail on the same ground before you repair the source.

Leave the property unseeded afterwards. A pinned seed narrows the search that turned the case up in the first place, and the example test beside it already holds that ground. The seed in the report reproduces a run while you work on it and belongs nowhere else.

## Prose lint output

The toolchain already defaults to the agent template. Both `just lint-prose` and the prek vale hook pass `--output=proofhouse-agent.tmpl`, so add the flag yourself only when invoking vale directly on specific paths. The template, synced from the proofhouse style package, prints one self-contained line per finding (location, severity, rule, the exact matched text, and the replacement parameter when the rule defines one) plus a totals line, so you can apply fixes without re-reading context through separate commands. Empty output means a clean run, and the exit code carries the result.
