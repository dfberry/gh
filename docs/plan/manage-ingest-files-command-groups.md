# Plan: Manage ingesting files for command groups (gather → evaluate)

Summary (single simple solution)
- Use per-repo output folders inside the existing `--out` directory. Each repo gets a safe-name folder (slashes replaced with `_`) and all step outputs for that repo are placed there. No index files, no new global run-name required. Consumers locate per-repo files by repo folder and step name.

Why this is the recommended single solution
- Minimal change surface: reuse existing `--out` / `--input` flags and add a deterministic folder layout.
- Deterministic discovery: consumers can compute a path from `outDir` + `repo_safe` + `stepName`.
- Preserves single-repo invocation semantics: every command still receives a single-repo input file when executed.
- Easier to debug and inspect manually (one folder per repo).

Conventions
- `--out` or `--out-dir`: output directory (default `./generated`).
- `repo_safe`: owner_repo where `/` is replaced with `_` (e.g. `org_one`).
- Per-repo folder: `${outDir}/${repo_safe}/`.
- Per-step per-repo output: `${outDir}/${repo_safe}/${stepName}.json` (result of the step).
- Per-step per-repo input (single-entry copy): `${outDir}/${repo_safe}/${stepName}-input.json` (JSON array with one repo string) — used when the step expects `--input`.

Runner behavior (gather / runGroupCommand)
1. Compute `outDir` (existing `args.out` or default `./generated`).
2. For each repo processed, compute `repo_safe` and ensure `${outDir}/${repo_safe}` exists.
3. When invoking a step for a repo, write the per-repo input (JSON array with only that repo) to `${outDir}/${repo_safe}/${stepName}-input.json` and pass `--input=<that path>` to the step. Write the step result to `${outDir}/${repo_safe}/${stepName}.json`.
4. Do not create a global index file; the filesystem layout is the index.

Consumer behavior (evaluate / single commands)
- If caller passes `--input` explicitly, use that (backwards-compatible).
- Else, when an `--out`/`--out-dir` is provided (or forwarded by runner), for each repo compute `${outDir}/${repo_safe}/${stepName}-input.json` and use it if present; otherwise try `${outDir}/${repo_safe}/${stepName}.json`.
- If neither exist, fall back to the runner-created single-entry normalized input (as currently done).
Examples
- Produce with gather:
  gh-cleanup gather --out=./generated
  -> writes `./generated/org_one/repo-secrets.json` and `./generated/org_one/repo-secrets-input.json`
- Consume with evaluate (no new flags):
  gh-cleanup evaluate --input=./generated/normalized.json --out=./generated
  -> for `org/one`, evaluate looks for `./generated/org_one/<step>-input.json` then `./generated/org_one/<step>.json` before falling back.

Testing
- Unit: update `runStepForEachRepo` tests to assert writes go to `${outDir}/${repo_safe}/...` and the child argv uses `--input=<per-repo-input>` and `--out=<per-repo-result>`.
- Integration: mock gather to produce per-repo folders, run evaluate with `--out` pointing to that dir and assert per-repo invocation counts.

Test changes (concrete)
- `packages/gh-cleanup/src/commandgroups/base.test.ts`:
  - Update `runStepForEachRepo` tests to expect calls that create the per-repo folder (`ensureDir`/`fs.mkdir`) for `${outDir}/${repo_safe}`.
  - Assert `writeNormalizedInput` / `fs.writeFile` is called with `${outDir}/${repo_safe}/${stepName}-input.json` for the per-repo input and that the child argv passed to the step contains `--input=<that path>` and `--out=${outDir}/${repo_safe}/${stepName}.json`.
  - When a wrapper throws, assert the error is recorded in `summary.steps` as before (no change).

- `packages/gh-cleanup/src/bin/commands.test.ts`:
  - Relax any hard-coded filename assertions to match the folder layout (use `path.join(outDir, repo_safe, ...)` helpers or regex matches).

- Command-specific tests (e.g., `gather-repo-secrets.test.ts`, others):
  - If they assert exact paths, update expected `--input`/`--out` to point to `${outDir}/${repo_safe}/...` instead of flat filenames.
  - Prefer asserting invocation counts over exact filenames when exact paths are not important to the test intent.

- Mocks and helpers:
  - Update mocks that previously returned flattened per-repo paths to return per-repo folder paths.
  - Add a small test helper `expectedRepoPath(outDir, repoFull, stepName, input?)` to centralize expected path logic.

- Integration/e2e tests:
  - Produce sample per-repo folders under a temp `outDir` and run `evaluate` pointing to that dir; assert per-repo invocations occur once per repo.

These test updates keep assertions focused on behavior (per-repo invocation, correct argv) rather than brittle filename strings.

Migration / compatibility notes
- No new CLI switches required. Existing scripts that pass `--out` continue to work.
- Optionally accept `--out-dir` alias if desired for clarity.

Tradeoffs
- Simpler and more robust; additional filesystem entries (one folder per repo) are trivial compared to the complexity of an index-based approach.

Next steps
- If you want, I can implement the `runStepForEachRepo` changes to write into per-repo folders and update a couple tests to confirm the behavior.

End of plan.
