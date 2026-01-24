# Evaluate Base Plan

Goal: introduce a reusable evaluation layer so `evaluate-*` commands analyze `gather` outputs and produce structured evaluation artifacts; `change-*` commands will then operate on those evaluation artifacts. Keep existing files intact; add new files and wire them incrementally so each small step can be built and tested.

Generated files are in the repo in ./generated to see current user repo output. These should be treated as readonly. Don't change or remove them.

Phased plan (small, testable steps):

1) Create base evaluator lib
- File: `packages/gh-cleanup/src/lib/evaluate-base-user-repos.ts`
- Responsibilities: accept `inputFile` and optional `configFile` paths from incoming parameters (do NOT hardcode any file or directory paths). The library should load the input JSON from the provided `inputFile` argument (or throw a clear error if missing) and load an optional evaluation `configFile` when provided. Expose a typed API to run generic checks (e.g., provide hooks for "isEmpty", "isStale", "isForkCandidate").
- Shared functionality to push into the base (extracted from existing `change-*` commands):
	- Input & config loading: unified `loadInputFile(inputFile)` and `loadConfigFile(configFile)` helpers that return repo arrays and a typed config.
	- Repo-list parsing: normalize JSON shapes (array, { repos: [] }, { items: [] }, or newline lists) and return canonical `Repo` objects.
	- Common filters: `excludeForks`, `excludeArchived`, visibility/size filters, and simple predicate helpers `isEmptyCandidate(repo)`, `isStaleCandidate(repo, cfg)`, `isForkCandidate(repo, cfg)`.
	- Pagination wrapper usage: helpers to call `repos.listAuthenticatedUserRepos` via the pagination utilities when no input file is supplied.
	- Normalized GitHub call wrapping: helper to call `wrapGitHubRest` and return consistent `GitHubRestResult` handling for callers.
	- Metadata enrichment: small utilities to fetch repo metadata (commits/pulls) and permissions, reusing `repos.fetchRepoMetadata`, `getRepoPermissions`, and surfacing results consistently.
	- Result shaping: produce a consistent per-repo `evaluation` object shape (e.g., `{ full_name, reason, score?, repo, status, message }`) to be emitted by all evaluate commands.
	- Output helpers: `emitEvaluationOutput(outPath, payload)` to write files and preserve `inputPath`/`configPath` in outputs.
	- Confirmation & dry-run helpers: non-destructive default behavior and a typed confirmation helper for any later `change-*` steps.
- No changes to existing files in this step; they will be refactored later to consume evaluate outputs.


2) Implement `evaluate-repos-for-empty`
- File: `packages/gh-cleanup/src/commands/evaluate-repos-for-empty.ts`
- Use `evaluate-base-user-repos` to determine empty candidates and emit evaluation JSON (list of candidates with metadata).

3) Add simple config support
- Support `--config-file=<path>` (JSON) for per-evaluation rules (e.g., stale days, exclude forks)
- Provide a default config path `./packages/gh-cleanup/evaluate-config.json` if none provided.


4) Wire `evaluate-repos-for-empty` into the CLI (register command)
- Register the `evaluate-repos-for-empty` command module with the project's command registry so it can be invoked directly via the CLI (e.g. `npm --prefix packages/gh-cleanup run evaluate-repos-for-empty -- --input-file=...`). Keep this command non-destructive by default.



5) Wire evaluate commands into evaluate group
- Add the individual evaluate command modules into the existing `packages/gh-cleanup/src/commandgroups/evaluate.ts` steps list so they can be executed via the group. Keep the group non-destructive; commands will be added but only evaluation steps will run by default.

6) Manual user test
- Run the evaluate commands manually against the sample gather output and verify results by inspection. Example commands:

    ```bash
    # evaluate empty candidates
    npm --prefix packages/gh-cleanup run evaluate-repos-for-empty -- --input-file=./generated/gh-cleanup-gather/gather-user-repos.json --out=./generated/evaluate-repos-for-empty.json

    # evaluate stale/archive candidates (pass optional config)
    npm --prefix packages/gh-cleanup run evaluate-repos-for-archive -- --input-file=./generated/gh-cleanup-gather/gather-user-repos.json --config-file=./packages/gh-cleanup/evaluate-config.json --out=./generated/evaluate-repos-for-archive.json

    # evaluate fork candidates
    npm --prefix packages/gh-cleanup run evaluate-repos-for-forks -- --input-file=./generated/gh-cleanup-gather/gather-user-repos.json --out=./generated/evaluate-repos-for-forks.json
    ```

    - Verification checklist (manual):
        - **Files:** confirm `generated/evaluate-*.json` files were created.
        - **Shape:** open one file and confirm it contains an array or `repos`/`evaluation` field with repo objects.
        - **Sample entry:** confirm at least one repo entry has `full_name` and candidate `reason` or similar metadata.
        - **Config:** change `--config-file` values (e.g., `olderThanDays`) to verify behavior changes.
        - **Report:** save any unexpected results and share the output files for follow-up.

7) Implement `evaluate-repos-for-archive`
- File: `packages/gh-cleanup/src/commands/evaluate-repos-for-archive.ts`
- Use `evaluate-base-user-repos` and config (older-than-days) to mark stale repos.
- After implementation: register the command with the project's CLI (update command registry).

8) Implement `evaluate-repos-for-forks`
- File: `packages/gh-cleanup/src/commands/evaluate-repos-for-forks.ts`
- Use `evaluate-base-user-repos` to identify owned fork candidates.
- After implementation: register the command with the project's CLI (update command registry).

9) Follow-up: adapt `change-*` commands to accept evaluate output
- Once evaluate artifacts are stable, refactor `change-*` commands to read evaluation outputs instead of raw gather lists (done incrementally in follow-up PRs).

Testing and roll-forward strategy:
- Each step will be implemented in a single commit/file addition and built with `npm run build`.
- After steps 1-3 we will run the evaluate command on the sample `generated` output to confirm shape and content.

Safety and non-destructive rules:
- Evaluation commands must not perform destructive GitHub operations.
- All GitHub calls remain in `github-rest` helpers; evaluation code should call those helpers via `wrapGitHubRest`.


