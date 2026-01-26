# Plan: Invoke a Single Command for a Single Repo

Purpose
- Describe a minimal, safe procedure to invoke any single `gh-cleanup` command for one repository.

Assumptions
- Repository is the local workspace root; CLI entrypoint is available via the project `bin` (or `makeRunner` helper for tests).
- Commands accept either `--repo=owner/name` or `--input=path.json` with a single repo entry.
- No code changes are made by this plan; it documents invocation patterns and test guidance.

Goals
- Provide command-line examples for running one command against a single repo.
- Explain using per-repo `--input` vs `--repo` flags and when to prefer each.
- Note safety flags (`--dry-run`, `--yes`, `--force`) and recommended test steps.

Steps
1. Identify the command to run (e.g., `gather-repo-secrets`, `describe-repo`, `delete-empty-repos`).
2. Prefer `--repo=owner/name` when the command supports a single-repo flag (simpler and avoids writing files).
   - Example: `node ./packages/gh-cleanup/dist/bin/cli.js describe-repo --repo=org/name --out=./out.json`
3. If the command only reads `--input`, create a temporary single-repo JSON file and pass it via `--input`.
   - Example:
     - Create: `echo '["org/name"]' > /tmp/single-repo.json`
     - Run: `node ./packages/gh-cleanup/dist/bin/cli.js gather-repo-secrets --input=/tmp/single-repo.json --out=./out.json`
4. When invoking via the test runner helper (`makeRunner`) use the same `--input` pattern in tests; the runner will create per-repo normalized inputs when appropriate.

Safety and flags
- Use `--dry-run` or omit `--yes` for any destructive command.
- For scripted runs where user confirmation is required, use `--yes` together with `--force` only after manual verification.

Testing guidance
- Unit tests: use `makeRunner('<module>', '<exportName>', mockImport)` with a mocked module to assert it was invoked once.
- Integration: run the CLI with a real `GH_TOKEN` in a controlled environment against a non-production repo.

Notes and recommendations
- Prefer `--repo` when available; it is simpler and avoids temporary files.
- Keep temporary input files in system temp (e.g., `$TMPDIR` or `/tmp`) and delete them after use.
- If a command must process many repos, call it repeatedly per-repo or use the existing group runner.

Files referenced
- This plan: `docs/plans/invoke-single-command-single-repo.md`

End of plan.
