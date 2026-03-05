# Project Context

- **Owner:** Dina Berry
- **Project:** GitHub REST API tooling monorepo — packages for extracting, analyzing, and acting on GitHub data to improve content, code, communications, planning, and CI
- **Stack:** TypeScript (strict, ESM), Node.js 22+, Vitest, npm workspaces, project references
- **Created:** 2026-03-05

### Testing Conventions

- Vitest with `vi` for mocking
- Mock `globalThis.fetch` for GitHub API calls
- Colocated `*.test.ts` files next to source modules
- Cover success and failure cases (rate limits, 404, 403, pagination)
- `vi.fn()` spies over global state; inject `importFn` for dynamic imports
- ESM `.js` extensions in test imports
- `npm run test` (all workspaces), `npm run test:ci` (CI mode with `--run`)

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-03-05 — Phase 1 test suite bootstrapped

- **Vitest setup:** `packages/github-rest` had no test infrastructure. Added `vitest` as devDep, created `vitest.config.ts`, updated `package.json` scripts to `vitest run` / `vitest` (watch).
- **Mock pattern for GitHubClient:** The client has `.get()`, `.post()`, `.patch()`, `.del()`, `.request()`, `.rawRequest()` methods. Mock all with `vi.fn()` and cast via `as unknown as GitHubClient`. This is the canonical mock shape for endpoint tests.
- **Branch encoding discovery:** Kaylee's `getBranchProtection` fix URL-encodes the branch name (e.g., `feature/test` → `feature%2Ftest`). Tests must expect the encoded form. Good safety measure for branch names with `/`.
- **permissions.ts mock layers:** Tests require `vi.mock('./repos.js')` for `getDefaultBranch` and `vi.mock('./security.js')` for delegated functions. The module graph is: permissions → repos + security.
- **issues.ts contract:** 7 functions all follow the same `(client, owner, repo, ...)` signature. GET endpoints use `{ params }` for query strings; POST/PATCH pass body directly. This is the standard pattern across all endpoint modules.
- **Index exports test:** Namespace exports (`export * as foo from ...`) are testable by checking `typeof pkg.foo === 'object'` and then `typeof pkg.foo.functionName === 'function'`.
- **Test count:** 35 tests across 3 files — 18 issues, 6 permissions, 11 index exports.

### 2026-03-05 — security-audit-repos test suite complete and passing

**Status:** ✅ 25/25 TESTS PASSING (Phase 1 QA work complete)

**Test-first pattern successfully executed:**
- Wrote 23 tests before Wash completed implementation (contracts defined upfront)
- Tests defined exact scoring values, error handling behavior, aggregation logic
- Wash implemented against test contracts; all tests pass

**Final test coverage (25 tests total):**
- **auditRepo function:** 6 tests (success, 404 handling, perfect score, error cases, invalid names, metadata failure)
- **Scoring algorithm:** 9 tests (individual penalties, cumulative deductions, score floor enforcement, edge cases)
- **auditRepos aggregation:** 5 tests (multiple repos, average calculation, empty list, single repo edge case, sort order)
- **generateAuditSummary:** 3 tests (string output, metrics presence, empty report)
- **Type contracts:** 2 tests (interface validation, export checks)

**Key innovations applied:**
- **Module-level mocking:** `vi.mock('github-rest')` enables solution-level tests independent of endpoint implementation
- **Realistic mock responses:** Mock return shapes match actual GitHub API contracts
- **404 graceful degradation:** Tests verify disabled features recorded as "not_enabled" state, not failures
- **Scoring algorithm specification:** Tests serve as executable specification of penalty values
- **Edge case identification:** Empty lists, score floors, mixed feature availability all identified through tests

**Coordination achievement:**
- Parallel work with Wash reduced total timeline (QA didn't block dev; dev had clear contract)
- Coordinator synchronized test mocking when Wash's implementation was complete
- All tests pass on first run after implementation

**Lessons for future solutions:**
- **Solution-level tests** should mock endpoint modules, not GitHubClient methods
- **Test-first pattern** enables parallel dev/QA work and unblocks fast implementation verification
- **Scoring and aggregation** logic must be tested exhaustively (complex state transformations)
- **Mock realism** (actual response shapes) prevents surprises in production

**Unblocks:** Phase 2 (sample-health-check) can begin immediately; all Phase 1 infrastructure solid

