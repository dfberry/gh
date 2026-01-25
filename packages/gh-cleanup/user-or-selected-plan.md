# user-or-selected: Implementation Plan

## Summary

- Add a top-level selection mode so the CLI runs in exactly one of:
  - `selected`: operate on repos provided via input files (current behavior)
  - `user`: ignore input files and operate on the authenticated user's repos
- If neither mode is passed, CLI prints help + version and exits.

## Design

1. Flags
   - `--mode=selected|user` (primary)
   - `--selected` (shorthand for `--mode=selected`)
   - `--user` (shorthand for `--mode=user`)

2. UX rules
   - If no mode: print help and package version, exit(0).
   - Mode is required for any command that would operate on repos.
   - Mode precedence: explicit `--mode` wins; `--selected`/`--user` are accepted.
   - Expose chosen mode via the runtime-mode singleton (`packages/gh-cleanup/src/lib/runtime-mode.ts`) so modules call `getMode()`.

## Implementation Steps

1. CLI changes - COMPLETED
   - File: `packages/gh-cleanup/src/bin/cli.ts`
   - Parse mode flags early (before command dispatch).
   - If mode missing: print help + version and exit.
   - Set runtime mode using the new `packages/gh-cleanup/src/lib/runtime-mode.ts` singleton (`setMode()`), not `process.env`.
   - Pass GitHub client and argv to `runCommand` unchanged.
   - Notes: CLI now uses async file I/O for package.json version lookup (`fs/promises`).

2. Shared command-group changes
    - File: `packages/gh-cleanup/src/commandgroups/base.ts`
    - Read mode from the runtime singleton (`getMode()` / `ensureMode()`), not from `process.env`.
    - If `mode === 'user'`:
       - Ignore `--input`/`--input-file` and call the centralized helper `fetchAuthenticatedUserRepos(client)` (in `packages/gh-cleanup/src/lib/fetch-user-repos.ts`).
       - Normalize the returned repo objects to `owner/name` strings and produce a normalized input JSON (via `writeNormalizedInput`) so downstream steps are unchanged.
    - If `mode === 'selected'`:
       - Preserve current behavior: resolve input file, parse repos.
    - Ensure result returned from `runGroupCommand` includes `mode` for auditability and log the chosen mode.

    Completed work (so far)
    - CLI: mode flags parsing implemented; mode is stored via `runtime-mode` singleton and validated.
    - CLI: async `readFile` used instead of sync fs.
    - Repo scripts: `package.json` gained `:user` variants for `gather`, `evaluate`, `change`, and `all`.
    - Repository Copilot instructions updated to explicitly forbid synchronous FS APIs.
    - Runtime singleton added: `packages/gh-cleanup/src/lib/runtime-mode.ts`.
    - Authenticated-user repo fetch helper added: `packages/gh-cleanup/src/lib/fetch-user-repos.ts` and used by `gather-user-repos`.

3. GitHub client usage
   - Use shared client in `packages/github-rest` (do not call `fetch` directly).
   - Implement a small helper in `base.ts` to paginate `/user/repos` using the shared client APIs (`request` or `paginate`).
   - Fail fast with clear error if client not present in user mode.

4. Tests
   - Add unit tests next to modified modules:
     - `packages/gh-cleanup/src/bin/cli.test.ts`
     - `packages/gh-cleanup/src/commandgroups/base.test.ts`
   - Mock network via `vi` and `globalThis.fetch` or mock the shared GitHub client.
   - Cases:
     - No mode prints help + version (assert exit behavior / printed text).
     - `--mode=selected` uses provided input file (mock `parseRepoInput`).
     - `--mode=user` fetches user repos and writes normalized input (mock client to return a few repos).
     - Error fetching user repos surfaces a helpful error.
     - Downstream steps receive normalized input file path as `--input`.

   - Implementation notes for tests:
      - Use `vitest` for unit tests and `vi` for mocking.
      - Mock network/GitHub interactions by mocking `packages/gh-cleanup/src/lib/fetch-user-repos.ts`.
      - Mock filesystem interactions (`ensureDir`, `writeNormalizedInput`) so tests remain unit-level and fast.
      - Tests added: `packages/gh-cleanup/src/commandgroups/base.test.ts` (covers `user` and `selected` modes).

   Remaining work
   - Update `packages/gh-cleanup/src/commandgroups/base.ts` to read mode via `getMode()` and implement user-mode repo fetching and normalized input writing.
   - Implement and unit-test the helper that paginates `/user/repos` via the shared GitHub client.
   - Add tests for CLI and `runGroupCommand` behaviors.
   - Update package and repo `README.md` to document the new `--mode` flags and `:user` scripts.

5. Docs & examples
   - Update package README: `packages/gh-cleanup/README.md` (describe new flags and examples).
   - Update repo `README.md` if it references CLI usage.
   - Update any scripts or docs that relied on implicit selected behavior.

6. Safety & verification
   - Preserve existing destructive safety checks: `--yes` and `--force` handling unchanged.
   - Confirm that forwarding destructive flags still requires confirmation when using `--yes` without `--force`.
   - Ensure normalized input writing occurs before any destructive steps run.
   - Add logging line indicating which mode was chosen (helpful for CI runs).

## Verification Checklist (local)

- `npm --prefix packages/gh-cleanup run build`
- Run tests: `npm --prefix packages/gh-cleanup run test`
- Smoke run:
  - Selected mode: `./packages/gh-cleanup/dist/bin/cli.js --mode=selected categorize-repos --input=path/to/sample.json`
  - User mode: `./packages/gh-cleanup/dist/bin/cli.js --mode=user summary`
- Check outputs in `generated/` and review summary file includes `mode`.

## PR Checklist (required by repo)

- [ ] Summary: one-paragraph change summary in PR body.
- [ ] Safety checks documented for any changed commands.
- [ ] Docs updated: `packages/gh-cleanup/README.md` and `README.md` if referenced.
- [ ] Tests added/updated and pass: `npm run test`.
- [ ] Build: `npm run build` (package compiles).
- [ ] Verification steps run and artifacts produced.

## Notes / Implementation hints

- Keep behavior backward-compatible for callers that already pass input files by requiring explicit `--mode=selected`.
- Use environment variable to avoid changing many function signatures.
- Centralize GitHub API calls in `packages/github-rest` and mock those in tests as per repo guidance.

## Estimated task breakdown

- CLI parsing & env wiring: 1–2 hours
- `base.ts` user-mode implementation + helper: 2–4 hours
- Tests & mocks: 2–4 hours
- Docs & PR checklist: 30–60 minutes

---

End.
