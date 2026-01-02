# Command Group Orchestrator Plan

This document describes the design and rollout plan for two new non-breaking CLI orchestrator command groups for `gh-cleanup`: `active` and `maintenance`.

Goals
- Provide easy, repeatable orchestration of existing commands.
- Preserve existing behavior by reusing exported command wrappers and `runCommand` functions.
- Default to safe dry-run behavior for destructive operations.
- Accept `--input` for repo lists and produce consistent aggregated outputs.
- Include a smoke test that runs orchestrators in dry-run against a sample input.

Scope
- New command files to create:
  - `packages/gh-cleanup/src/commands/active.ts`
  - `packages/gh-cleanup/src/commands/maintenance.ts`
- CLI wiring: register `active` and `maintenance` in `packages/gh-cleanup/src/lib/commands.ts` and add help text in `packages/gh-cleanup/src/bin/cli.ts`.
- Add smoke test artifacts under `plans/smoke-tests/`.

Constraints
- This plan MUST NOT modify `./packages/github-rest` or `./packages/llm-completion`. All changes live in `packages/gh-cleanup`, `plans/`, `docs/`, or top-level `scripts/` and example files.

Scripts and examples
- Create two lightweight runner scripts at the repository root `./scripts/run-active.sh` and `./scripts/run-maintenance.sh` that invoke the `gh-cleanup` CLI with appropriate flags and accept an `--input` file path. These scripts are convenience wrappers for local testing and CI dry-runs.
- Add an example input file at the repository root: `sample-repos.json`. For testing purposes this file should contain two entries: one `Azure-Samples` repo and one `dfberry` repo (example below). The orchestrator should accept this file as the `--input` argument.


Orchestrator behavior

Active group (sequence):
1. `categorize-repos`
2. `describe-repos`
3. `evaluate-actions`
4. `summary`

Maintenance group (sequence):
1. `archive-stale-repos`
2. `delete-empty-repos`
3. `remove-forks`

Each orchestrator will:
- Dynamically import the module for each step (e.g., `await import('../commands/describe-repos.js')`) and call the thin CLI wrapper (e.g., `await m.describeReposCommand(argv)`), or call `runCommand(client, args)` when appropriate.
- Normalize and validate input flags at the orchestrator level and forward relevant flags to subcommands.

I/O (required)
- Accept `--input=<file>` at the orchestrator level. Supported formats:
  - JSON array of repo full names: `["owner/repo", ...]`
  - Plain newline-delimited `owner/repo` list
- Forward `--input` to underlying commands that accept it. If a subcommand requires a different shape, orchestrator will materialize a temporary normalized input file and pass its path to the subcommand.
- Output conventions:
  - Orchestrator accepts `--out` (single directory or file) and `--out-prefix`.
  - When aggregating per-step results, write files as `{out-prefix}-{step}.json` (e.g., `active-categorize-repos.json`) in the `--out` directory. Also produce a combined `{out-prefix}-summary.json` containing per-step metadata, status, and errors.
  - If `--output=md` is requested, produce an additional `{out-prefix}-summary.md` with a human-readable summary.

Safety (required)
- Orchestrators default to dry-run. No destructive actions are performed unless `--yes` is explicitly provided to the orchestrator.
- Only forward destructive flags (`--yes`, `--force`) to underlying commands if the orchestrator was invoked with them.
- Implement a staged confirmation before destructive stages:
  - Print planned destructive actions and, unless `--force` is present, require typed confirmation or require that `--yes` be explicitly given.
- Provide `--continue-on-error` (optional) to allow orchestrator to attempt remaining steps after a failure; default is to stop on first fatal error.

Auth & flags (required)
- Forward GitHub token and OpenAI flags from the orchestrator to subcommands (accept both env and flag forms).
- Validate GH token presence before any destructive stage and check (best-effort) for minimal scopes; if absent or insufficient, fail with actionable message.
- Never log tokens or OpenAI keys; mask any secret values in logs and summaries.
- Allow orchestrator-level overrides for `--out`/`--out-prefix` and `--input`.

Error handling (required)
- Default behavior: stop on first fatal error and exit non-zero.
- When `--continue-on-error` is provided, attempt remaining steps and collect per-step errors.
- Aggregate results into `{out-prefix}-summary.json` including per-step status, error messages (truncated/masked), and exit codes.
- Exit code policy:
  - `0` if all requested actions (or all dry-run-only checks) succeeded.
  - Non-zero if any fatal error occurred or any requested apply step failed.

Testing
 - Add `plans/smoke-tests/sample-repos.json` with a small set of synthetic repo names (or a single well-known public repo) suitable for dry-run. The repository root also contains `active-sample-repos.json` as a ready-to-use example.
- Add `plans/smoke-tests/orchestrator-dryrun.sh` that:
  - Runs both orchestrators in dry-run mode against `sample-repos.json`.
  - Verifies exit code is `0` and that `{out-prefix}-summary.json` is produced.
  - Cleans up generated temporary files.
- Example smoke-test invocation (in repository root):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.." || exit 1
SAMPLE=plans/smoke-tests/sample-repos.json
OUT_DIR=$(pwd)/generated/gh-cleanup-smoke
rm -rf "$OUT_DIR" && mkdir -p "$OUT_DIR"
# Active dry-run
node packages/gh-cleanup/dist/bin/cli.js active --input "$SAMPLE" --out "$OUT_DIR" --out-prefix active-dryrun --dry-run
# Maintenance dry-run
node packages/gh-cleanup/dist/bin/cli.js maintenance --input "$SAMPLE" --out "$OUT_DIR" --out-prefix maintenance-dryrun --dry-run
# Check summaries
jq -e '.steps' "$OUT_DIR/active-dryrun-summary.json"
jq -e '.steps' "$OUT_DIR/maintenance-dryrun-summary.json"
echo "Smoke tests passed"
```

(Adjust invocation if the project uses `ts-node` or other tool in dev workflow.)

CLI wiring
- Add entries in `packages/gh-cleanup/src/lib/commands.ts` like:

```ts
'active': async (argv: string[]) => {
  const m = await import('../commands/active.js');
  await m.activeCommand(argv);
},
'maintenance': async (argv: string[]) => {
  const m = await import('../commands/maintenance.js');
  await m.maintenanceCommand(argv);
},
```

- Update `packages/gh-cleanup/src/bin/cli.ts` help text to document new groups and `--input` / `--out-prefix` conventions.

Implementation order (incremental, verifiable)

These implementation units are intentionally small and non-invasive so each step can be reviewed and validated before moving to the next.

Unit 0 — Plan persisted
- Commit this plan file (`plans/command-group.md`). (Done)

Unit 1 — CLI registration & help (non-destructive)
- Add `active` and `maintenance` entries to `packages/gh-cleanup/src/lib/commands.ts` using the dynamic import pattern. Add help text to `packages/gh-cleanup/src/bin/cli.ts` describing the new subcommands and `--input`/`--out-prefix` flags. No implementation code imported by those entries should run at import time.
- Verify: running `node packages/gh-cleanup/dist/bin/cli.js --help` (or `ts-node` equivalent) shows the new commands listed.

Unit 2 — Create minimal stubs (safe, type-checkable)
- Create `packages/gh-cleanup/src/commands/active.ts` and `packages/gh-cleanup/src/commands/maintenance.ts` as small modules that export the thin wrapper functions (`activeCommand(argv)` / `maintenanceCommand(argv)`) which only parse args, validate `--input` presence if provided, and then exit with status 0 (no destructive work). These stubs will also export `parseArgs`, `runCommand`, and `writeOutput` signatures so other code can import them later.
- Verify: TypeScript compiles for `packages/gh-cleanup` and `node packages/gh-cleanup/dist/bin/cli.js active --help` or `--dry-run` returns successfully.

Unit 3 — Input normalization & I/O contracts (dry-run)
- Implement input parsing at the orchestrator level: accept `--input` (JSON or newline list) and normalize into a temporary JSON file. Implement `--out` and `--out-prefix` handling. Still perform no destructive actions — only read and write files.
- Verify: run the new orchestrators in dry-run mode against `plans/smoke-tests/sample-repos.json` and confirm per-step `{out-prefix}-{step}.json` artifacts are produced.

Unit 4 — Sequencing with underlying commands (dry-run-only invocation)
- For each orchestrator, implement the sequential invocation of subcommands by dynamic import and calling their thin wrappers, but pass `--dry-run` and ensure destructive flags are not forwarded. Collect per-step results and write the combined `{out-prefix}-summary.json`.
- Verify: dry-run end-to-end execution produces aggregated outputs and returns exit code 0.

Unit 5 — Safety gating for destructive steps
- Add orchestrator-level forwarding rules: only forward `--yes`/`--force` to destructive subcommands if the orchestrator was invoked with them. Add staged confirmation behavior requiring typed input unless `--force` is present.
- Verify: with and without `--yes` the destructive steps are blocked or permitted as expected; run automated smoke tests in both modes (dry-run and with `--yes` but still simulated in CI or local testing environment).

Unit 6 — Error handling & `--continue-on-error`
- Implement aggregated error collection and `--continue-on-error` behavior. Ensure exit codes follow the policy in this plan.
- Verify: run tests that injection-fail a substep and assert aggregated summary and exit code behavior.

Unit 7 — Full integration & docs
- Update `packages/gh-cleanup/README.md` with examples, add smoke tests to `plans/smoke-tests/`, and (optionally) add CI job to run the smoke tests in dry-run mode.
- Final verification: full TypeScript build, smoke tests pass, and `scripts/verify-github-rest.sh` still reports no direct client/fetch calls introduced.

Rollout & docs
- Commit plan to `plans/command-group.md` (this file).
- Implement orchestrator modules behind feature branch; run smoke tests locally.
- Update package-level README (`packages/gh-cleanup/README.md`) with new commands and usage examples.
- Optionally add a lightweight CI job to run the smoke test in dry-run mode on PRs for this feature.

Safety checklist (before merging)
- [ ] Plan file added to repo (`plans/command-group.md`).
- [ ] Orchestrator code implemented and tests pass locally.
- [ ] Smoke tests run and pass (dry-run only).
- [ ] `scripts/verify-github-rest.sh` passes (no direct client/fetch calls introduced).
- [ ] README updated with examples.
- [ ] CI updated if adding smoke tests to pipeline.

Maintainer notes
- Prefer calling thin CLI wrappers (`*Command(argv)`) to preserve per-command CLI parsing and help behavior.
- Keep orchestrator code minimal and focused on sequencing, I/O normalization, and safety checks.

---

Created by automation on 2026-01-02.
