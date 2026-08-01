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
# report through `lint-config`, which rewrites no source.

# Format JSON, JS, and TS files in place via biome's formatter.
format-config *args:
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

# Complement to `format-markdown` (which only rewrites whitespace and
# ordering, not semantic lints).

# Apply rumdl's auto-fixable rules to Markdown files.
fix-markdown *args:
    rumdl check --fix {{ if args == "" { "." } else { args } }}

# --- Lint ---

# One entry point for every gate that reads the source tree. Each
# linter added later appends itself to the dependency list, so a
# contributor and a merge check always run the same set under the same
# name.

# Run every linter that operates on the source tree.
lint: lint-prose lint-spelling lint-markdown lint-config lint-yaml lint-toml lint-just lint-editorconfig

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
# the version package.json pins.

# Lint JSON, JS, and TS files via biome.
lint-config *args:
    node_modules/.bin/biome check --files-ignore-unknown=true {{ if args == "" { "." } else { args } }}

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
