# Plan: Refactor command modules to accept repos arrays (not input files)

Summary
-------
This document describes the recommended refactor to make command worker functions accept an array of repositories to act on (e.g. `string[]` or `any[]`) instead of calling `readInputRepos()` or reading files directly. The goal is to separate CLI concerns (parsing/reading inputs) from business logic and make the workers easier to test and reuse.

Why
---
- Improves testability (no filesystem I/O inside workers).
- Enables composition: callers can fetch repos from any source (file, API, previous command output).
- Keeps CLI wrappers responsible only for args parsing and compatibility.

Files identified for change
-------------------------
The following command modules currently call `readInputRepos()` or otherwise read input files and should be refactored:

- `packages/gh-cleanup/src/commands/gather-actions.ts`
- `packages/gh-cleanup/src/commands/gather-repo-secrets.ts`
- `packages/gh-cleanup/src/commands/gather-collaborators.ts`
- `packages/gh-cleanup/src/commands/gather-root-contents.ts`
- `packages/gh-cleanup/src/commands/gather-root-readme.ts`
- `packages/gh-cleanup/src/commands/gather-branch-protection.ts` (already follows pattern; use as canonical example)
- `packages/gh-cleanup/src/commands/evaluate-repos-for-empty.ts`
- `packages/gh-cleanup/src/commands/change-stale-repos.ts` (supports file OR pagination; adjust to accept repo objects/arrays)
- `packages/gh-cleanup/src/commands/change-remove-remove-forks.ts` (currently filters by input file; refactor to accept repo list or filter set)

Recommended refactor pattern (params object)
-------------------------------------------
Design goal: make workers receive a single `params` object with two properties:

- `args`: the parsed CLI flags (unchanged shape), and
- `data`: a payload object containing runtime data the worker needs — primarily `repos`.

Worker signature example:

```ts
export type Params<ArgsT, DataT> = { args: ArgsT; data: DataT };

export async function runCommand(client: GitHubClient, params: Params<Args, { repos: string[] }>) : Promise<any> {
  const { args, data } = params;
  const repos = data.repos; // worker uses only this; no file I/O
  // ... perform work using repos
}
```

Wrapper responsibilities
- CLI wrappers remain responsible for `argv`, `parseArgs()`, and any I/O. They should produce a `params` object and pass it into workers.
- For compatibility, wrappers should still support `--input`/`--input-file` by calling `readInputRepos()` and setting `params.data.repos`. Over time callers should provide `params.data.repos` directly.

Impacted command groups
-----------------------
- Gather commands (`gather-*`):
  - `gather-actions.ts`
    Before signature:
    ```ts
    export async function runCommand(client: GitHubClient, args: Args): Promise<GatherActionsEntry[]>
    ```
  - `gather-repo-secrets.ts`
    Before signature:
    ```ts
    export async function runRepoSecrets(client: GitHubClient, args: Args): Promise<GatherActionsEntry[]>
    ```
  - `gather-collaborators.ts`
    Before signature:
    ```ts
    export async function runCollaborators(client: GitHubClient, args: Args): Promise<GatherActionsEntry[]>
    ```
  - `gather-root-contents.ts`
    Before signature:
    ```ts
    export async function runCommand(client: GitHubClient, args: Args): Promise<GatherActionsEntry[]>
    ```
  - `gather-root-readme.ts`
    Before signature:
    ```ts
    export async function runCommand(client: GitHubClient, args: Args): Promise<GatherActionsEntry[]>
    ```
  - `gather-branch-protection.ts` (already aligned; use as example)
    Before signature:
    ```ts
    export async function runBranchProtection(client: GitHubClient, args: Args): Promise<GatherActionsEntry[]>
    ```
- Evaluate commands:
  - `evaluate-repos-for-empty.ts`
    Before signature:
    ```ts
    export async function runCommand(client: GitHubClient, args: Args)
    ```
- Change / destructive commands:
  - `change-stale-repos.ts` (may accept repo objects; wrapper should fetch objects)
    Before signature:
    ```ts
    export async function runCommand(client: any, args: Args): Promise<any>
    ```
  - `change-remove-remove-forks.ts` (filters by input; needs refactor to accept repo list or set)
    Before signature:
    ```ts
    export async function runCommand(client: GitHubClient, args: Args)
    ```

Backwards compatibility
- Keep CLI entry functions (`*Command`) signatures and behavior unchanged. Have wrappers build `params` and pass into workers.

Repo object vs string
- `data.repos` should be typed per-command: `string[]` for `owner/repo` lists and `RepoObject[]` for commands needing metadata.

Changes required in `base.ts`
----------------------------
`packages/gh-cleanup/src/commandgroups/base.ts` orchestrates per-repo invocation of command wrappers today by creating a per-repo normalized input file and building `childArgv` (CLI-style argv) then calling the wrapper: `m[s.wrapper](childArgv, githubClient)`. To support the new `params` pattern the following changes are required:

1. Stop creating and passing `childArgv` for per-repo runs. Instead, construct a `params` object and call wrappers with `params`.
2. Update wrappers to accept `params` (or to accept both `argv` and `params` temporarily for backwards compatibility).
3. Optionally stop writing per-repo normalized input files; if you need to keep them for backward compatibility or auditing, keep writing but do not rely on the worker reading them.

Before (current `runStepForEachRepo` excerpt):

```ts
    const childArgv: string[] = [];
    // create a per-repo normalized input file so steps that read --input only see this repo
    const perRepoInputName = `${outPrefix}-${s.name}-input.json`;
    const perRepoInputPath = await writeNormalizedInput(repoOutDir, perRepoInputName, [repoFull]);
    childArgv.push(`--input=${perRepoInputPath}`);
    childArgv.push(`--out=${stepOut}`);
    childArgv.push(`--owner=${owner}`);
    childArgv.push(`--repo=${repo}`);
    // forward flags
    if (!forwardApply) childArgv.push('--dry-run'); else { if (args.yes) childArgv.push('--yes'); if (args.force) childArgv.push('--force'); }

    const m = await import(s.module);
    if (typeof m[s.wrapper] === 'function') {
      await m[s.wrapper](childArgv, githubClient);
    }
```

After (params-based invocation):

```ts
    // Build the params object: keep CLI flags in args, put repo list into data
    const childArgs = {
      ...args,
      owner,
      repo,
      out: stepOut,
      dryRun: !forwardApply ? true : args.dryRun,
    } as GroupArgs;

    const params = { args: childArgs, data: { repos: [repoFull] } };

    const m = await import(s.module);
    if (typeof m[s.wrapper] === 'function') {
      // wrapper now accepts params instead of argv
      await m[s.wrapper](params, githubClient);
    }
```

Notes:
- The `childArgs` object above intentionally mirrors the previous `childArgv` contents but as a structured object, preserving flags like `--dry-run`, `--yes`, `--force`, and debug.
- Wrappers should read options from `params.args` and the repos from `params.data.repos`. For example, in the wrapper:

```ts
export async function actionsCommand(params: { args: Args; data: { repos: string[] } }, client?: GitHubClient) {
  const { args, data } = params;
  const repos = data.repos;
  // call worker
  const res = await runCommand(client, params);
  await writeOutput(res, args);
  return res;
}
```

Migration steps (per module)
---------------------------
1. Pick a canonical example (use `gather-branch-protection.ts` as reference).
2. For each target file:
   - Edit the worker function (`runCommand` / `runXyz`) so it takes `repos` as an explicit parameter.
   - Move any `readInputRepos()` calls out of the worker into the CLI wrapper function (`*Command`) which already parses `argv`.
   - Adjust `parseArgs` only if needed for `--input`/`--input-file` flags — keep them for the wrapper.
   - Ensure `writeOutput` continues to accept `args` and behaves the same.
3. Update unit tests for the worker to pass `repos` directly (mock GitHub client and avoid filesystem reads).
4. Update integration/CLI-level tests to exercise wrapper behavior when `--input` is provided (these tests can still mock `readInputRepos`).

Testing guidance
---------------
- Unit tests: test workers by passing arrays directly. Mock GitHub client calls. No filesystem I/O.
- Wrapper tests: keep a small number of tests that verify the wrapper reads files when `--input` is provided and calls the worker with the correct array — for these, mock `readInputRepos` (like existing `commands-shared.test.ts` approach using `vi.doMock`).
- Run full test suite after each set of refactors to detect regressions.

Example change (gather-actions)
--------------------------------
Before (simplified):

```ts
export async function runCommand(client: GitHubClient, args: Args) {
  const repos = await readInputRepos(args.input);
  // iterate repos and call API
}
```

After (worker + wrapper):

```ts
export async function runCommand(client: GitHubClient, repos: string[], args: Args) {
  // iterate repos and call API
}

export async function actionsCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  const repos = args.input ? await readInputRepos(args.input) : /* other fallback */ [];
  const res = await runCommand(client, repos, args);
  await writeOutput(res, args);
  return res;
}
```

Sequencing suggestion
---------------------
1. Implement the pattern in one gather command (`gather-actions`), update unit tests.
2. Iterate through other gather-* commands (`gather-repo-secrets`, `gather-collaborators`, `gather-root-contents`, `gather-root-readme`).
3. Handle the commands that operate on repo objects (`change-stale-repos` and `change-remove-remove-forks`) by making the wrapper fetch repo objects and passing them to the evaluator worker.
4. Update `evaluate-repos-for-empty` to accept repo objects (it already expects repo objects in its evaluator).
5. Run full test suite and fix any incidental breakages.

Notes and caveats
-----------------
- Keep CLI-level behavior stable: users invoking CLI with `--input`/`--input-file` should see no functional change.
- Document new worker signatures in code comments and update unit tests.
- If multiple commands share a common pattern, consider adding a small helper `loadReposFromArgs(args)` to the CLI layer to centralize input-file handling.

If you want, I can implement step 1 (refactor `gather-actions` to the new pattern, update its tests, and run the test file) as a follow-up patch.

---
Generated on: 2026-01-27
