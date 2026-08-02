set unstable
set positional-arguments

# Run [script] recipes under bash rather than the default sh. On Linux
# sh is dash, which lacks [[ ]], <<<, and set -o pipefail — constructs
# [script] recipes are free to rely on. macOS sh is bash, so a dash
# incompatibility would stay hidden locally until CI runs on Linux.
set script-interpreter := ['bash', '-eu']

# Locate a Docker-compatible container runtime. Probe PATH first, then
# well-known install locations so the recipe still works inside agentic
# harnesses or sandboxes that strip /usr/local/bin from PATH. Override by
# setting CONTAINER_RUNTIME in the environment.
#
# The continuation lines of the `for` list below hang under the first
# candidate path rather than on a two-space grid, which is what shell
# style calls for and what `lint-editorconfig` would otherwise reject
# under this file's indent_size = 2. Exempt just that span rather than
# re-indent a block the sibling repos carry verbatim.
# editorconfig-checker-disable
container_runtime := env("CONTAINER_RUNTIME", `bash -c '
    docker_path=$(command -v docker 2>/dev/null || true)
    podman_path=$(command -v podman 2>/dev/null || true)
    for p in "$docker_path" \
             /usr/local/bin/docker \
             /opt/homebrew/bin/docker \
             /Applications/Docker.app/Contents/Resources/bin/docker \
             "$HOME/.orbstack/bin/docker" \
             "$HOME/.rd/bin/docker" \
             "$podman_path" \
             /opt/podman/bin/podman; do
        if [ -n "$p" ] && [ -x "$p" ]; then echo "$p"; exit 0; fi
    done
    echo docker
'`)

# editorconfig-checker-enable

# Shared container-run prefix. DOCKER_CONFIG points at a fresh empty
# directory so docker skips the osxkeychain credential helper (public
# Docker Hub pulls don't need it, and sandboxed environments can't
# always reach the helper binary). PATH gets the runtime's directory
# prepended for cases where docker itself isn't on the calling shell's
# PATH. Shell substitutions evaluate at recipe-run time, not
# Justfile-parse time.

docker_run := 'DOCKER_CONFIG="$(mktemp -d)" PATH="$(dirname ' + container_runtime + '):$PATH" ' + container_runtime + ' run --rm'

# The tombi release this repo's config and committed formatting are
# verified against. tombi comes from Homebrew rather than the lockfile,
# so `check-tombi-version` compares the local binary with this pin: a
# mismatch means local formatting may differ from what the gate expects.

# renovate: datasource=github-releases depName=tombi-toml/tombi

tombi_version := "1.2.5"

# actionlint version pin. The upstream image bundles actionlint (and
# the shellcheck it shells out to) at a known version, and actionlint
# publishes no npm package for devDependencies to carry, so we pin a
# Docker image by digest instead. Renovate tracks the version + digest
# pair below via the comment marker (the shared Justfile customManager
# from the org's renovate presets).

# renovate: datasource=docker depName=rhysd/actionlint
actionlint_version := "1.7.12"
actionlint_image := "docker.io/rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667"

# actionlint invocation. Mounts the repo read-only at /repo with -w /repo
# so actionlint finds .github/workflows/.
actionlint := docker_run + ' -v "$(pwd):/repo:ro" -w /repo ' + actionlint_image

# Build metadata. `date` is the *committer date* (UTC, ISO-8601), not
# build invocation time, so two checkouts of one commit agree on the
# instant, and `source_date_epoch` carries that instant as a unix
# timestamp for tooling that honors SOURCE_DATE_EPOCH. Nothing reads
# these yet: a library compiles no git-derived data into what it ships,
# and the block stays whole so the derivation reads the same here as in
# the sibling repositories. There is no version variable: package.json
# holds the version and the library reads it from there at run time.
#
# `--abbrev=7` / `--short=7` pin the abbreviated hash length so two
# checkouts of the same commit produce the same string. Without this,
# git uses `core.abbrev=auto`, whose length depends on object count
# (shallow clones, freshly-packed repos, and aged working copies all
# differ). 7 matches goreleaser's `.ShortCommit`.

commit := `git rev-parse --short=7 HEAD 2>/dev/null || echo ""`
date := `TZ=UTC git log -1 --format=%cd --date=format-local:%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown"`
source_date_epoch := `git log -1 --format=%ct 2>/dev/null || echo "0"`

# Default recipe
default: test

# --- Setup ---

# The one command a fresh checkout needs. Running it a second time
# costs little: the brew check short-circuits when every formula is
# already present, the style sync re-fetches what .vale.ini asks for at
# the time, and the hook install writes over .git/hooks with whatever
# the current config names. The runtime falls outside it, because
# mise.toml pins Node and the packageManager field in package.json
# decides which pnpm runs.

# Set up the development environment.
setup: install-brew install-tools prek-install

# Install Homebrew dependencies from Brewfile.
install-brew:
    brew bundle check || brew bundle install

# Today that means Vale's synced style packages; grows as new
# sync-style tools land.

# Refresh non-brew tooling.
install-tools:
    vale sync

# --- Build ---

# Compile dist: JavaScript, declarations, and the maps back to source.
# The build config is the one that emits, and it narrows the input to
# src; the root config it extends covers the tests too and only checks.
build:
    node node_modules/tsc7/bin/tsc -p tsconfig.build.json

# Build the package twice in throwaway clones of the committed tree and
# fail if the two tarballs disagree. pnpm's packer is deterministic on
# its own and reads no SOURCE_DATE_EPOCH, which is why the build never
# threads that variable through and why a digest mismatch points at the
# compiler rather than the archive: this is the standing check that
# TypeScript 7's parallel emit lays down the same bytes every run.
# Each clone gets the working tree's lockfile copied in, so the two
# installs resolve identical dependencies even while that file is
# untracked.
[script]
build-repro-check:
    dir_a=$(mktemp -d)
    dir_b=$(mktemp -d)
    trap 'rm -rf "$dir_a" "$dir_b"' EXIT
    for dir in "$dir_a" "$dir_b"; do
        git clone --quiet --no-hardlinks . "$dir"
        cp -f pnpm-lock.yaml "$dir/pnpm-lock.yaml"
        (cd "$dir" && pnpm install --frozen-lockfile && just build && pnpm pack)
    done
    digests=$(cd "$dir_a" && shasum -a 256 -- *.tgz)
    if ! (cd "$dir_b" && shasum -a 256 --check --strict <<< "$digests"); then
        echo "package digests differ between builds — the build is not reproducible" >&2
        exit 1
    fi

# Drop build output
clean:
    rm -rf dist
    rm -f *.tsbuildinfo

# --- Format ---

# Rewrites in place. Pair with `fix-markdown` for semantic lint fixes.

# Format Markdown files (whitespace, list markers, code fence styles).
format-markdown *args:
    rumdl fmt {{ if args == "" { "." } else { args } }}

# Lays down the shape biome.json describes: spaces two wide, a 100-column
# limit, double quotes, and imports in the order the assist settles on.
# Nothing else biome knows about a file reaches this recipe; the rules
# report through `lint-biome`, which rewrites no source.

# Format JSON, JS, and TS files in place via biome's formatter.
format *args:
    node_modules/.bin/biome format --write {{ if args == "" { "." } else { args } }}

# The in-place counterpart to the check `lint-toml` runs. It rewrites
# whitespace and style and nothing else: key order and array order stay
# as the author left them, because tombi.toml turns the schema-driven
# reordering off. That file also decides which paths the walk reaches,
# so this recipe takes no arguments either.

# Format TOML files in place.
format-toml:
    tombi format

# The writing half of a pair; `lint-just` is the half that only
# reports. Splitting them keeps the gate from editing the file it
# judges, the division `format-toml` and `lint-toml` already follow.
# `--fmt` is an unstable subcommand, so both recipes pass `--unstable`
# themselves instead of leaning on the setting at the top of this file,
# and dropping that setting would leave either one working.

# Rewrite this Justfile in just's own canonical format.
format-just:
    just --fmt --unstable

# --- Fix ---

# One pass does both jobs: biome applies the lint fixes it rates safe
# and lays out whatever it touched, so nothing needs to run after it.
# Findings it cannot fix safely stay in place, where `lint-biome`
# reports them.

# Apply biome's safe lint fixes and reformat in place.
fix *args:
    node_modules/.bin/biome check --write --files-ignore-unknown=true {{ if args == "" { "." } else { args } }}

# Complement to `format-markdown` (which only rewrites whitespace and
# ordering, not semantic lints).

# Apply rumdl's auto-fixable rules to Markdown files.
fix-markdown *args:
    rumdl check --fix {{ if args == "" { "." } else { args } }}

# --- Lint ---

# A subset of `lint` below holding only the gates that read TypeScript,
# so an edit to the library can be checked without waiting on the prose,
# Markdown, YAML, and TOML passes over the whole tree. Later TypeScript
# gates land here as they arrive. The recipe is a dependency list and
# runs nothing of its own.
#
# One member reads well past TypeScript. `lint-reuse` weighs every
# tracked file, and it sits here because a new source file is the
# commonest way an undeclared one appears. The Python repositories
# place their own reuse gate in the equivalent list for that reason.
#
# The final two entries earn their place the same way. Neither the
# packed tarball nor the workflow that builds it changes on its own:
# whoever edits the library decides what leaves it and under which
# runner, so one name covers the whole of that edit.

# Run every TypeScript-flavored lint gate.
lint-ts-all: lint-biome typecheck lint-eslint lint-deadcode lint-dup-code lint-architecture lint-reuse lint-package lint-workflows

# One entry point for every gate that reads the source tree, so a
# contributor and a merge check always run the same set under the same
# name. `lint-ts-all` leads the list and carries the TypeScript gates in
# with it; the rest judge files of any language.

# Run every linter that operates on the source tree.
lint: lint-ts-all lint-prose lint-spelling lint-markdown lint-yaml lint-toml lint-just lint-editorconfig

# The glob steers vale away from the LICENSE (canonical Apache 2.0
# text), the generated changelog, vale's own synced style packages,
# scratch directories, the shared rule files and worktrees under
# .claude/, the COMMIT_AGENTMSG draft (.vale.ini scopes that file to
# the stricter commit rules and the commit-msg gate reads it there),
# the dependency tree, compiled output, and the coverage, report, and
# mutation scratch trees. Whatever survives the glob is inspected under
# the per-file-type rules in .vale.ini.

# Lint prose in Markdown files and source comments via vale.
lint-prose *args:
    vale --output=proofhouse-agent.tmpl --glob='!{LICENSE,CHANGELOG.md,.vale/*,tmp/*,.claude/rules/*,.claude/worktrees/*,COMMIT_AGENTMSG,dist/*,node_modules/*,coverage/*,reports/*,.stryker-tmp/*}' {{ if args == "" { "." } else { args } }}

# cspell is named by path so this reads the copy the lockfile pins
# rather than whichever one a machine keeps on PATH. Which files the
# walk covers is settled in .cspell.jsonc, apart from COMMIT_AGENTMSG:
# that draft belongs to the commit-message gate, which spell-checks it
# against a dictionary of its own. Passing a path with no matches is
# not an error, so a caller can name one file without knowing whether
# the config already excluded it.

# Check spelling in every tracked file type via cspell.
lint-spelling *args:
    node_modules/.bin/cspell --config .cspell.jsonc --no-summary --no-progress --no-must-find-files --exclude COMMIT_AGENTMSG {{ if args == "" { "." } else { args } }}

# rumdl handles structural lints (heading style, list marker style,
# code fence style); vale handles prose.

# Lint Markdown files against the project's .rumdl.toml ruleset.
lint-markdown *args:
    rumdl check {{ if args == "" { "." } else { args } }}

# One pass over the TypeScript and the JSON beside it, covering layout
# drift and the lint rules together. Every rule biome ships is on, so
# correctness, style, complexity, and import order all answer here. The
# executable comes from node_modules by path, which holds the check to
# the version package.json pins. Warnings fail the run too: the preset
# leaves some rules below error severity, and a plain `biome check`
# prints those findings and still exits 0, which would leave the rules
# behind them unenforced.

# Lint JSON, JS, and TS files via biome.
lint-biome *args:
    node_modules/.bin/biome check --error-on-warnings --files-ignore-unknown=true {{ if args == "" { "." } else { args } }}

# The rules behind this one consult the type checker, which lets them
# settle questions no single file's text can answer: whether a promise
# was ever awaited, whether a condition had another outcome available to
# it, whether a `switch` covers the union it opens. Two entries in
# biome.json sit at off for that reason. noUnnecessaryConditions and
# useAwait have counterparts here, no-unnecessary-condition and
# require-await, that judge the same code with the types to hand. The
# invocation names no path: the parser service resolves tsconfig.json
# per file, and eslint.config.ts lists the roots that file already
# includes. A warning ends the run the way an error does, which is what
# turns a suppression comment outliving its finding into a failure.

# Lint TypeScript against the type-aware eslint rule set.
lint-eslint:
    node_modules/.bin/eslint . --max-warnings=0

# Neither of the two gates above can see past the file it has open, so a
# function every caller stopped calling still typechecks and still
# formats. knip resolves the imports instead and reports what the
# resolution never arrives at: a module, an export, a type, or a package
# in the manifest. `includeEntryExports` in knip.json holds the exported
# surface to that same standard. Everything a library publishes leaves
# through one module, and without that setting the walk would stop at
# its door and take the whole surface on trust. What the setting really
# asks is whether the suite covers the surface, since a test is the only
# caller a published name has in here. The ignore list beside it names
# the packages this file runs by path, which no import can reach.

# Check for unused files, exports, and dependencies via knip.
lint-deadcode:
    node_modules/.bin/knip

# Every gate above reads a name and decides whether it holds up. None of
# them compares two passages of code and notices that one was pasted
# from the other, which is how an expression package grows: the next
# operator starts as a copy of the last one. jscpd compares the token
# streams and reports the pairs. The Python repositories reach the same
# finding through pylint's similarities checker.
#
# The flags live here rather than in a .jscpd.json so each one can be
# answered for. A threshold names the share of duplicated lines a run
# forgives, and 0 leaves it forgiving nothing. Beside it sits the size a
# match has to reach before it counts, in tokens rather than lines so
# that reformatting cannot talk the number down. 50 is what jscpd would
# use unasked; writing it out means a release that revises the default
# has to revise this line as well. The roots follow as arguments,
# because jscpd reads paths from the command line and its config file
# holds settings alone.
#
# One limit sits outside the flags. jscpd passes over a clone whose
# copy appears in the opening 28 lines or so of the file receiving it,
# whatever token count the run demands, as 5.0.14 still shows. A
# duplicate planted to test this gate has to go below that mark to
# register.

# Report copy-pasted passages across the sources and the suite.
lint-dup-code:
    node_modules/.bin/jscpd --threshold 0 --min-tokens 50 src tests

# A layered library stays layered only while something checks. depcruise
# resolves every import in the tree into one graph and holds it to the
# contracts written in .dependency-cruiser.cjs. The layer order comes
# first. Beside it sit a ban on loops, a ban on files stranded off the
# graph, a requirement that the walk from the entry point arrive at each
# source file, and a fence around the test helpers this package will
# publish later. The Python repositories draw their layer contract with
# import-linter, which has no answer for the two rules about reaching.
#
# A second pass follows and asks whether the first one saw anything at
# all. The parse runs under the library compiler in devDependencies, so
# a tree that later carries TypeScript 7 by itself would walk nothing
# and report that cleanly. Feeding the summary to jq and demanding a
# module count above zero makes an empty walk fail instead. The sources
# on their own settle the question.

# Check imports against the layer order and the reachability contracts.
lint-architecture:
    node_modules/.bin/depcruise src tests --config .dependency-cruiser.cjs
    node_modules/.bin/depcruise src --config .dependency-cruiser.cjs -T json | jq -e '.summary.totalCruised > 0' > /dev/null

# A tracked file has to name its copyright holder and its license
# somewhere reuse can find. TypeScript sources answer in their opening
# two lines and the rest answer through REUSE.toml, where one
# annotation can speak for a whole directory.
#
# reuse comes from PyPI and this package declares no Python
# dependencies, so the recipe hands the pin to uvx and lets its cache
# hold the release. The sibling Python repositories put it in a
# dependency group instead. Renovate reads the pin straight off the
# line below. Its extra supplies the encoding detector reuse falls back
# on when a file will not decode as UTF-8. The other flag drops the
# per-file process pool, whose startup outweighs the parallelism at
# this file count and whose semaphores a restricted environment may
# refuse outright.

# Verify SPDX compliance with reuse.
lint-reuse:
    uvx --from 'reuse[charset-normalizer]==6.2.0' reuse --no-multiprocessing lint

# Every gate before this one judges the tree as a contributor reads it.
# This one judges the archive an installer unpacks. publint builds that
# archive the way a registry would and holds the manifest to what came
# out: an exports target absent from the pack, a files list that left
# the compiler's output behind, a types condition ordered after the
# import it is meant to precede. attw packs a second copy and follows
# each entry point through the resolution a consumer's own compiler
# performs, reporting where the walk lands on JavaScript with no
# declarations beside it. Neither tool opens src at all, which is why
# the recipe waits on `build` and why no hook runs it: a full compile
# is more than a commit should cost.
#
# attw takes its entry points from the exports map, which this package
# has declared since before there was anything to resolve. A package
# whose only public surface is an executable hands the walk nothing and
# has to name its entry points another way. The profile narrows the
# verdict to the resolution modes an import-only package answers to,
# and this one emits nothing a require could reach.
#
# publint spells a flag `--pack` as well and means the opposite thing
# by it: which package manager should do the packing, not a request to
# pack. It settles that question by itself here, so the flag belongs to
# the second line alone and reading it across the two would quietly
# change what the first one asks.

# Check the packed package shape and its type resolution.
lint-package: build
    node_modules/.bin/publint
    node_modules/.bin/attw --pack . --profile esm-only

# --strict treats warnings as errors so the gate matches CI behavior;
# per-rule tuning lives in .yamllint.yaml.

# Lint YAML files (config, workflows, action definitions).
lint-yaml *args:
    yamllint --strict {{ if args == "" { "." } else { args } }}

# tombi is the org gate for TOML and it reads every tracked file of
# that kind: the runtime pins and its own config today, and whatever
# else the tree grows later. A file with an associated schema validates
# offline against the embedded SchemaStore copy; the rest get syntax
# and style checks. The formatter runs here too, in the mode that
# reports a diff instead of applying one, so layout drift fails the
# gate rather than being repaired behind the contributor's back. Going
# offline keeps a merge check independent of SchemaStore's uptime, and
# warnings count as failures the way they do everywhere else in this
# file. Which paths the walk covers is settled in tombi.toml, which is
# why this recipe alone among its neighbors accepts no path arguments.

# Lint and format-check every tracked TOML file.
lint-toml:
    tombi format --check --diff
    tombi lint --offline --error-on-warnings

# Advisory rather than fatal: tombi comes from Homebrew and moves on
# its own schedule, and that is fine so long as it stays visible rather
# than silently reformatting a file the gate then rejects.

# Warn when the local tombi differs from the verified release.
[script]
check-tombi-version:
    local=$(tombi --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [[ "${local}" != "{{ tombi_version }}" ]]; then
        echo "warning: local tombi ${local} != verified {{ tombi_version }}" >&2
        echo "         formatting may differ from what the gate expects" >&2
    else
        echo "tombi ${local} matches the verified release"
    fi

# Reports drift and rewrites nothing; `format-just` settles what it
# finds. Each of the other gates answers for a language somebody else
# owns — biome for TypeScript and JSON, rumdl for Markdown, yamllint
# for YAML, tombi for TOML — which left this file, the one they are all
# invoked through, formatted however the last edit happened to leave
# it.

# Check this Justfile against just's own formatter in --check mode.
lint-just:
    just --fmt --check --unstable

# Charset, line endings, a final newline, trailing whitespace, and both
# the indent style and its width. .editorconfig has decided all of that
# since the repository's first week, for editors that bothered to look
# and for nothing that could fail a merge. Handed no paths the checker
# walks what git tracks, so compiled output and Vale's synced style
# packages sit outside the run to begin with;
# .editorconfig-checker.json names them again for a caller that does
# pass paths, and adds the changelog, whose layout belongs to the tool
# that regenerates it wholesale. The binary is spelled out in full:
# upstream release archives carry a short `ec` alias, and the Homebrew
# formula this repo provisions from builds the long name alone.

# Check every tracked file against the rules in .editorconfig.
lint-editorconfig:
    editorconfig-checker

# actionlint walks `.github/workflows/` by default, parses each
# workflow, and flags unknown actions, mis-typed expressions,
# shellcheck issues inside `run:` blocks, and SHA-pin drift.
# Complements `lint-yaml` (which checks YAML structure) with
# workflow-shape rules yamllint can't see. Pinned Docker image;
# Renovate bumps the version + digest via the shared Justfile
# customManager.
#
# `lint-ts-all` reaches this recipe now. It sat outside every aggregate
# for as long as it was the only gate here pointed at a directory
# instead of at the sources, which made it the one gate a contributor
# had to remember by name. Workflow files rarely move without the code
# they build moving too. GitHub runs the same check from a shared
# caller workflow, and that is the side a hook would duplicate, so
# there is none.

# Lint GitHub Actions workflow files via actionlint.
lint-workflows:
    {{ actionlint }}

# Running the same gates the commit-msg hook runs surfaces message
# problems while iterating rather than at commit time. Reads the draft
# from the repo-root COMMIT_AGENTMSG file (gitignored; see AGENTS.md for
# the workflow) and runs the commit-msg stage through prek, which fires
# the four shared hooks from proofhouse/pre-commit-hooks:
# commit-trailers, commitlint, vale-commit-msg, and cspell-commit-msg.
# The real gate stays the prek commit-msg hook on .git/COMMIT_EDITMSG;
# this recipe only mirrors it. Commit the validated draft with
# `git commit -F COMMIT_AGENTMSG`.

# Pre-validate a drafted commit message against the commit-msg gates.
lint-commit-msg:
    prek run --stage commit-msg --commit-msg-filename COMMIT_AGENTMSG

# --- Test ---

# Run tests
test *args:
    node_modules/.bin/vitest run "$@"

# A second suite, far smaller, that runs on the runtime and nothing else:
# no vitest, no transform, no step of any kind between the sources and
# Node. It reaches an assertion only when every module behind the entry
# point survives type stripping, which is what makes syntax the runtime
# can't erase fail here rather than pass quietly under a compiler.
# vitest passes the directory over for the same reason. Node expands the
# pattern itself, so it stays quoted rather than going to the shell.

# Run the smoke suite as raw TypeScript under Node's type stripping.
test-erasable:
    node --test "tests/erasable/**/*.test.ts"

# Typecheck the sources and the tests. tsc7 is named by path because
# both compilers in devDependencies ship a tsc binary and only one of
# them wins the .bin link, which would leave install order deciding
# which compiler rules on the code.
typecheck:
    node node_modules/tsc7/bin/tsc -p tsconfig.json

# --- Dependencies ---

# Check pnpm-lock.yaml against package.json. The lockfile-only flag is
# what makes this a check and not an install: pnpm compares the two
# files, reports every specifier that disagrees, and leaves node_modules
# alone either way. CI runs it on every pull request; contributors run a
# plain install and commit the lockfile it writes.
lock-check:
    pnpm install --frozen-lockfile --lockfile-only

# Two files name the pnpm version: the packageManager field, which
# decides what runs, and mise.toml, which installs it for a local
# checkout. Renovate carries both in a single pull request, so the
# ordinary path keeps them level and this recipe answers for the rest —
# a hand edit to one of them, or a bump landed by anything else. It sits
# outside `lint` on the grounds that neither file is source and a
# disagreement here breaks nothing until somebody installs.

# Check that package.json and mise.toml pin the same pnpm.
[script]
check-tool-pins:
    manifest=$(node -p 'require("./package.json").packageManager.split("+")[0].split("@")[1]')
    mise=$(grep -E '^pnpm *= *"' mise.toml | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
    if [[ "$manifest" != "$mise" ]]; then
        echo "pnpm pins disagree: packageManager $manifest, mise.toml $mise" >&2
        exit 1
    fi
    echo "pnpm $manifest pinned consistently in package.json and mise.toml"

# --- Utilities ---

# Run once after cloning the repo, and whenever .vale.ini's Packages
# list changes. CI runs this before `just lint-prose`.

# Sync Vale styles and dictionaries.
vale-sync:
    vale sync

# Run pre-commit hooks on changed files (the everyday invocation).
prek:
    prek

# Useful after a hook config change or before a release sweep.

# Run pre-commit hooks on every file in the tree.
prek-all:
    prek run --all-files

# The hooks cover commit-msg, pre-commit, and pre-push. `just setup`
# runs this automatically; it stays a separate recipe so contributors
# can re-install the hooks (which modify .git/) without re-running the
# whole setup.

# Install the project's pre-commit hooks.
prek-install:
    prek install -t commit-msg -t pre-commit -t pre-push

# Check that the two-compiler wiring is intact. typescript supplies the
# JS API that typed lint tooling loads, and tsc7, an alias of
# TypeScript 7, is the compiler the gates run. Both expected versions
# come out of package.json, so a dependency bump moves the pins and the
# assertions together instead of leaving them to drift apart.
[script]
doctor:
    want_api=$(node -p 'require("./package.json").devDependencies.typescript')
    have_api=$(node -p 'require("typescript").version')
    if [[ "$have_api" != "$want_api" ]]; then
        echo "typescript resolves to $have_api, package.json pins $want_api" >&2
        exit 1
    fi
    want_gate=$(node -p 'require("./package.json").devDependencies.tsc7.split("@").pop()')
    have_gate=$(node node_modules/tsc7/bin/tsc --version)
    if [[ "$have_gate" != "Version $want_gate" ]]; then
        echo "tsc7 reports '$have_gate', the alias pins typescript $want_gate" >&2
        exit 1
    fi
    echo "typescript $want_api (API), tsc7 $want_gate (gate)"

# `cog changelog` emits Markdown without an H1, so the pipeline prepends
# one and writes the file before linting it in place: rumdl matches the
# CHANGELOG.md per-file-ignores in .rumdl.toml (which disable MD024 for
# the repeated version headings) against on-disk paths, not stdin.

# Generate the full CHANGELOG.md from Conventional Commit history.
generate-changelog:
    cog changelog | { echo "# Changelog"; cat; } > CHANGELOG.md
    rumdl check --fix CHANGELOG.md

# Useful during release prep to see what `cog changelog` will emit
# before committing the regeneration.

# Preview the changelog entries since the last tagged release.
preview-changelog:
    cog changelog --at $(git describe --tags)..HEAD -t full_hash | rumdl check -d MD041 --fix --stdin

# Output goes to stdout; pipe to a file or paste into the GitHub
# release body.

# Generate release notes for a version, or for HEAD if none is given.
[script]
generate-release-notes version="":
    v=$([[ -n "{{ version }}" ]] && echo "v{{ version }}" || echo "..$(git rev-parse HEAD)")
    cog changelog --at $v -t full_hash | rumdl check -d MD024,MD041 --isolated --fix --stdin
