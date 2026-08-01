set unstable := true
set positional-arguments := true

# Run [script] recipes under bash rather than the default sh. On Linux
# sh is dash, which lacks [[ ]], <<<, and set -o pipefail — constructs
# [script] recipes are free to rely on. macOS sh is bash, so a dash
# incompatibility would stay hidden locally until CI runs on Linux.
set script-interpreter := ['bash', '-eu']

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

# --- Lint ---

# One entry point for every gate that reads the source tree. Prose is
# the only member today and each linter added later appends itself to
# the dependency list, so a contributor and a merge check always run
# the same set under the same name.

# Run every linter that operates on the source tree.
lint: lint-prose

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

# --- Test ---

# Run tests
test *args:
    node_modules/.bin/vitest run "$@"

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

# --- Utilities ---

# Run once after cloning the repo, and whenever .vale.ini's Packages
# list changes. CI runs this before `just lint-prose`.

# Sync Vale styles and dictionaries.
vale-sync:
    vale sync

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
