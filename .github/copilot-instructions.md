# Copilot Instructions for This Project

Welcome to the project! This document guides GitHub Copilot, other AI coding assistants, and contributors on conventions, safety checks, and the PR process so generated code and suggestions stay consistent with our project's standards.

## How to use this file
- Audience: maintainers, contributors, and AI assistants. Use it to answer "how do I change X" questions quickly.
- When to update: any time conventions, CI, or code placement rules change. Add a short note in PRs that modified this file.
- Quick actions: copy the PR checklist block below into your PR description to speed review.

## Project Architecture
- This is a monorepo with multiple packages (for example: `packages/gh-cleanup`, `packages/github-rest`).
- Language: TypeScript targeting Node.js 22+ (native `fetch` available).
- All GitHub REST requests should be centralized in `packages/github-rest/src/*` (or the repo's established request utility). Use that shared client rather than calling `fetch`/`client` directly from command modules.
- **Package placement:** See `/.github/package-placement-rules.md` for placement rules.

## Preferred Frameworks & Tools
- **Language:** TypeScript (strict mode recommended).
- **Testing:** Vitest (use `vi` for mocking; mock network with `globalThis.fetch`).
- **Linting:** ESLint + Prettier.
- **Build:** `tsc`.
- **Containerization:** Docker (see `Dockerfile` in each package).

## Coding Style
- Use TypeScript types and interfaces for API responses and function signatures.
- Prefer `async/await` for asynchronous code.
- Use named exports for modules.
- Keep functions focused; prefer composition over inheritance.
- Centralize error handling in utilities.
- Use environment variables for secrets and tokens; never hardcode credentials.
- This repository uses ES Modules (ESM). Use `import`/`export` not `require()`.

## Testing Conventions
- Place tests next to modules (`*.test.ts`).
- Mock network calls with `vi` and `globalThis.fetch`.
- Cover success and failure cases.
- Run: `npm run test` or `npm run test:watch`.
- Example mock snippet:

```ts
import { vi } from 'vitest';
globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
```

## Documentation
- Add or update JSDoc for public APIs.
- Update this file if conventions change.
- For user docs, update `README.md`, package README, and `docs/*` as appropriate.
- When CLI commands change, update all references (examples, READMEs, docs).
- Example commands to run locally:

```bash
# Build package
npm --prefix packages/gh-cleanup run build

# Run gather dry-run writing outputs into generated/
./scripts/run-gather.sh active-sample-repos.json generated/gh-cleanup-gather gather-dryrun

# Check summary with jq
jq -e '.steps' generated/gh-cleanup-gather/gather-dryrun-summary.json
```

## Extensibility
- Add endpoints as modules in `packages/github-rest` and use the shared request utility.
- Design modules for extension (pluggable auth, tests, and docs).

## Miscellaneous
- Use `engines` in `package.json` to require Node.js >= 22.
- Prefer native APIs when available.
- Keep dependencies up to date and remove unused packages.
- Use `.env.example` and ensure `.env` is in `.gitignore`.


## Feature Addition Checklist

When adding a new feature or CLI command, include these in the PR:

- Plan: short TODO describing implementation units.
- Source changes: minimal, focused, and include tests. The change set should build across the monorepo.
- Documentation: update package and repo READMEs and any docs that reference the command.
- CI: update workflows and secrets if required; include workflow changes in the same PR.

Copy-paste PR template (add to your PR body):

```
Summary: One-paragraph summary of the change.

Checklist:
- [ ] Plan added to `plans/` or PR description
- [ ] Code compiles: `npm run build`
- [ ] Tests added/updated and pass: `npm run test`
- [ ] Docs updated (`README.md`, `docs/`)
- [ ] Smoke test/verify run and artifacts produced
- [ ] CI workflows updated (if required)
```

### Enforcement and verification

- Required: when adding/modifying `packages/gh-cleanup/src/commands/*` update docs or add a justification + follow-up TODO in the PR.
- Mandatory doc targets:
	- `packages/gh-cleanup/README.md`
	- `README.md`
	- any `docs/*.md` or `.github/*` files referencing the command

#### Verification (copy/paste)

```bash
# run from repo root - replace <cmd> with the command name
grep -R "<cmd>" README.md packages/**/README.md docs || true
```

Optional CI snippet (example) — add to `.github/workflows/*` to enforce docs presence:

```yaml
# example: verify-docs job (optional)
name: Verify Docs
on: [pull_request]
jobs:
  verify-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          set -e
          if ! grep -R "${{ github.event.pull_request.head.ref }}" README.md packages/**/README.md docs; then
            echo "Docs check failed"
            exit 1
          fi
```

## Incremental Implementation Guidance

Prefer a "build-up" approach (small, verifiable units). Key guidelines:

- Plan first: add a short plan/TODO and map commits to plan units.
- Register commands non-invasively with dynamic imports in `packages/gh-cleanup/src/lib/commands.ts`.
- Create minimal stubs exporting `*Command(argv)` and signatures before adding logic.
- Normalize I/O early (`--input`, `--out`, `--out-prefix`).
- Sequence steps using `--dry-run` for early verification; collect per-step results.
- Add staged confirmation before forwarding destructive flags.
- Implement `--continue-on-error` and aggregated error reporting as a dedicated unit.
- Add smoke tests and run them in CI where practical.

Benefits: faster reviews, safer rollouts, easier debugging.

## Command File Change Policy

When editing command implementations located under `packages/gh-cleanup/src/commands/` (or similar CLI command folders), the change MUST be accompanied by a short analysis and review checklist describing the intent, safety considerations, and verification steps. This ensures we don't accidentally change runtime behaviour, CLI flags, or safety checks (for example: fork-deletion safeguards).

Minimum required items to include in the change set or PR description when command files are modified:

- **Summary:** One-paragraph summary of the behavioral change (what's changing and why).
- **Safety checks:** Any runtime or API safety checks added or removed (e.g. skip-delete if active PRs exist).
- **Flags/doc updates:** Confirm relevant Markdown docs and `--help` examples were updated to match flag changes.
- **Testing/verification:** Describe how the change was validated locally (build, smoke-run, or unit tests) and any commands used to reproduce the verification.
- **Backward-compatibility:** Note breaking changes and suggested migration steps for users.

PR authors should add this checklist to the PR description and mark each item as satisfied. Reviewers should verify the checklist before approving the change. For safety-critical changes (deleting resources, destructive operations), include an explicit manual review approval by a repository maintainer in the PR comments.

---

Thank you for keeping the project clean and maintainable.

Contacts / Owners
- Primary: repo maintainers (ping the team or add a MAINTAINERS file)
- For Copilot/instructions updates: @repo-maintainer

**Copilot Guidance for This Repo**

- **Purpose:** Guidance for AI assistants and contributors working in this repository.
- **Centralized GitHub requests:** Keep GitHub REST requests in `packages/github-rest` and use the shared request client instead of calling `fetch` directly from command modules.
- **TypeScript practice:** Prefer explicit types and `async/await`; extend `tsconfig.base.json` for shared compiler options and keep `composite: true` for packages participating in project-reference builds.
- **Testing:** Place tests next to modules (`*.test.ts`), use `vitest` and `vi` for mocks, and mock network calls with `globalThis.fetch` in tests.
- **Command changes:** When editing files under `packages/gh-cleanup/src/commands/`, include the required PR checklist: summary, safety checks, docs/README updates, and tests covering behavior changes.
- **Build & CI:** After altering `package.json` or build deps, run `npm install` locally and commit the updated `package-lock.json` so CI `npm ci` remains deterministic.
- **Releases:** For publish automation, ensure `NPM_TOKEN` is set in CI. Consider Changesets for monorepo-aware versioning; if using `semantic-release`, update and commit the lockfile before CI runs.
- **Related docs:** See [TS Project References](docs/TS_PROJECT_REFERENCES.md) for build and project-reference conventions.

## Command File Consistency and Template (2026-01)

### Command File Template

All new command files must follow this template for consistency, error handling, and debug support:

```typescript
import { parseBaseFlags } from '../lib/flags.js';
import { reportError, extractStatus, getDebugConfig } from '../lib/debug.js';
import * as fs from 'fs';
// Import any required GitHub REST helpers

/**
 * Command: <command-name>
 *
 * Purpose:
 *   <Describe what this command does>
 *
 * Flags:
 *   - <list supported flags>
 *   - common base flags via `parseBaseFlags()` (e.g. `--debug`)
 *
 * Exports:
 *   - <commandName>Command(argv)
 */
export async function <commandName>Command(argv: string[]) {
  const args = parseBaseFlags(argv);
  const { input, out, debug } = args;
  const debugConfig = getDebugConfig(debug); // Always use this for debug
  if (!input || !out) throw new Error('Missing --input or --out');
  const raw = fs.readFileSync(input, 'utf8');
  let repos: string[] = [];
  try {
    repos = JSON.parse(raw);
  } catch {
    repos = raw.split('\n').map(x => x.trim()).filter(Boolean);
  }
  const results = [];
  for (const repoFull of repos) {
    const [owner, repo] = repoFull.split('/');
    // For each API call, use try/catch and add both the result and an <feature>Error property
    let feature = null;
    let status = 'ok';
    let message = undefined;
    let featureError = null;
    try {
      feature = await someApiCall(owner, repo);
      status = 'ok';
    } catch (err: any) {
      feature = null;
      status = extractStatus(err);
      message = err?.message || String(err);
      featureError = reportError(err, debugConfig);
    }
    results.push({ owner, repo, feature, status, ...(message ? { message } : {}), ...(featureError ? { featureError } : {}) });
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
  return results;
}
```

### Key Consistency Rules

- **Debug Handling:**
  - Always use `getDebugConfig(debug)` as the single source of truth for debug configuration.
  - Do not manually check `process.env` or parse debug flags elsewhere.
- **Error Reporting:**
  - For each API call, add both the result and a `<feature>Error` property if an error occurs.
  - Always include `status` and `message` fields for each repo/feature.
  - Use `reportError` and `extractStatus` for all error handling.
- **Input/Output:**
  - Use `parseBaseFlags` and accept `debug` from argv.
  - Read input as JSON or newline-delimited, write output as JSON with all error/status fields included.
- **Documentation:**
  - Include a clear header block documenting purpose, flags, and exports at the top of each command file.
- **Minimal Boilerplate:**
  - Command files should contain only business logic, error handling, and output. All shared logic (debug, error formatting) must be in utilities.

### Issues to Watch For

- Some legacy commands do not use the `<feature>Error` pattern or lack detailed error objects—refactor as needed.
- Not all commands propagate the debug flag or use `getDebugConfig`—ensure this is consistent.
- Some files lack a clear header block—add for clarity and maintainability.

**When adding or updating a command, copy the template above and follow all rules in this section.**
