# Consolidate Commands: Central Registry Proposal

## Goal
Centralize all command keys, module paths, and group step lists into a single source-of-truth so `src/bin/commands.ts` and the group runners (`src/commandgroups/*`) consume the same definitions.

## New file
Create `packages/gh-cleanup/src/commands/index.ts` that exports:

- `COMMANDS`: a typed `Record<string, { module: string; wrapper: string }>` listing every command key, the runtime `module` path (e.g. `../commands/summary.js`) and the `wrapper` export name.
- `GROUPS`: a typed `Record<string, string[] | StepDef[]>` where `StepDef` is `{ name: string; module: string; wrapper: string }`. Each group (`gather`, `evaluate`, `change`) lists ordered step keys or expanded step metadata.

Example shapes (conceptual):

```ts
export const COMMANDS = {
  'summary': { module: '../commands/summary.js', wrapper: 'summaryCommand' },
  // ...
};

export const GROUPS = {
  gather: ['branch-protection', 'user-repos', 'collaborators', 'repo-secrets', 'actions', 'gather-root-contents', 'gather-root-readme', 'summary'],
  change: ['change-stale-repos', 'change-remove-empty-repos', 'change-remove-remove-forks'],
  evaluate: ['evaluate-categorize-repos', 'evaluate-describe-repos', 'evaluate-actions'],
};
```

## Use sites (no edits until approved)
- Replace the inline `_commands` map in `packages/gh-cleanup/src/bin/commands.ts` with a constructed map iterating `COMMANDS` and calling `makeRunner` for each entry.
- Replace inline `steps` arrays in `packages/gh-cleanup/src/commandgroups/gather.ts`, `evaluate.ts`, and `change.ts` to derive step objects from `GROUPS` + `COMMANDS`.

## Benefits
- Single authoritative list prevents drift between the CLI index and group definitions.
- `scripts/verify-docs.sh` and docs can reliably reference backticked command keys.
- Easier to add/remove commands and update groupings without duplicating metadata.
- Tests can import `COMMANDS`/`GROUPS` to validate shape and presence.

## Migration approach (safe, incremental)
1. Add `packages/gh-cleanup/src/commands/index.ts` exporting `COMMANDS` and `GROUPS` only.
2. Update `src/bin/commands.ts` to consume `COMMANDS` and construct runners programmatically.
3. Update one group (suggest `gather.ts`) to consume `GROUPS` and verify behavior.
4. Run `scripts/verify-docs.sh` and unit tests; fix import paths as needed.
5. Update remaining group files and run tests again.
6. Remove old inline maps once CI/tests pass.

## Compatibility / Pitfalls
- Ensure `module` strings use the runtime `../commands/*.js` paths expected by `makeRunner` (keep the same strings).
- Preserve `wrapper` names matching command exports.
- Keep `availableCommands()` behavior stable (same keys/order if relied upon).
- Watch ESM dynamic import resolution; keep the same dynamic-import pattern.

## Testing & Verification
- Build/package: `npm run build` (or `npm run start -w gh-cleanup -- --help`) to verify runtime imports.
- Run `scripts/verify-docs.sh` to ensure backticked keys appear in docs.
- Run package unit tests in `packages/gh-cleanup`.

## Next step (if approved)
Implement step 1: add `packages/gh-cleanup/src/commands/index.ts` and then update `packages/gh-cleanup/src/bin/commands.ts` to use it.


---
Plan saved by GitHub Copilot assistant.