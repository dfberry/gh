# Copilot Instructions for This Project

Welcome to the project! This file provides guidance for GitHub Copilot and other AI coding assistants to generate code and suggestions that are consistent with our project's standards and architecture.

## Project Architecture
- This is a monorepo with multiple packages, including a GitHub Security SDK (`npm_packages/gh`).
- The SDK is written in TypeScript and targets Node.js 22+ (uses native fetch).
- All HTTP requests to GitHub APIs are centralized in `src/core/request.ts` using the `ghRequest` utility.
- Each API module (e.g., `dependabotAlerts.ts`) should use the base request utility for consistency and maintainability.
- **Package placement:** See the detailed placement rules in [/.github/package-placement-rules.md](.github/package-placement-rules.md).

## Preferred Frameworks & Tools
- **Language:** TypeScript (strict mode recommended)
- **Testing:** Vitest (use `vi` for mocking, `globalThis.fetch` for HTTP mocks)
- **Linting:** ESLint with Prettier integration
- **Build:** TypeScript compiler (`tsc`)
- **Containerization:** Docker (see `Dockerfile` in each package)

## Coding Style
- Use TypeScript types and interfaces for all API responses and function signatures.
- Prefer async/await for asynchronous code.
- Use named exports for all modules.
- Keep functions small and focused; prefer composition over inheritance.
- Centralize error handling in utility functions where possible.
- Use environment variables for secrets and tokens; never hardcode credentials.
 - This repository uses ES Modules (ESM) across all packages. Avoid `require()` and CommonJS patterns; use `import`/`export` and ESM-compatible APIs.

## Testing Conventions
- Place all test files next to the modules they test, using the `.test.ts` suffix.
- Mock all network calls using `vi.fn()` and `globalThis.fetch`.
- Cover both success and error scenarios in tests.
- Run tests with `npm run test` or `npm run test:watch`.

## Documentation
- Add or update JSDoc comments for all public functions and types.
- Update the `.github/copilot-instructions.md` file if project conventions change.
- For user-facing documentation, update `README.md` or `INSTRUCTIONS.md` as appropriate.
 - When a command's functionality or CLI switches change, update all relevant Markdown documentation files (for example `README.md`, package-level `README.md`, files in `docs/`, and any other `*.md` that reference the command or its flags) to reflect the changes.

## Extensibility
- When adding new GitHub API endpoints, create a new module and use the shared request utility.
- Design modules for easy extension and future-proofing (e.g., support for new authentication methods).

## Miscellaneous
- Use the `engines` field in `package.json` to enforce Node.js version requirements.
- Prefer native APIs (e.g., fetch) over polyfills or external libraries when available.
- Keep dependencies up to date and remove unused packages regularly.


## Feature Addition Checklist

For any new feature or command added to this repository, include the following items in the change set:

- Plan: a short, high-level plan or TODO list describing the implementation steps and any dependencies.
- Source changes: the code implementing the feature, kept minimal and focused; include tests where appropriate. All source code changes aren't complete until all projects in the monorepo build successfully.
- Documentation: update relevant `README.md` files (package-level and repository-level) to document CLI flags, examples, and input/output shapes.
- CI: update GitHub Actions/workflows if the feature requires new build, lint, or test steps, or additional secrets; add workflow changes to the same PR.

### Enforcement and verification

- Required: when adding or modifying CLI commands under `packages/gh-cleanup/src/commands/` the PR MUST update documentation as described below. If documentation is not updated the PR description must include a justification and a TODO for the follow-up docs change.
- Documentation targets that MUST be updated for command changes:
	- package-level README: `packages/gh-cleanup/README.md` (add the command entry, flags, and examples).
	- repository-level README: `README.md` (update the high-level command list and pipeline examples where applicable).
	- any `docs/*.md` or `.github/*` files that reference the command or its flags.
- Verification: before merging, run a quick grep to ensure command name appears in documentation. Example:

```bash
# run from repo root - replace <cmd> with the command name
grep -R "<cmd>" README.md packages/**/README.md docs || true
```

- Optional CI: maintainers are encouraged to add a lightweight `verify-docs` job to CI that fails when new commands are added without updating docs. See `docs/` for examples.

Including these items ensures consistent reviews, reproducible builds, and clear usage for maintainers and users.

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

Thank you for helping keep this project clean, consistent, and maintainable!
