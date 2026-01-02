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

# Run active dry-run writing outputs into generated/
./scripts/run-active.sh active-sample-repos.json generated/gh-cleanup-active active-dryrun

# Check summary with jq
jq -e '.steps' generated/gh-cleanup-active/active-dryrun-summary.json
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

Verification (copy/paste):

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

If you want, I can also add a small `verify-docs` CI job to this repo and a `PR_TEMPLATE.md` file. Mark this todo done when you're ready.
