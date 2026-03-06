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

### 2026-03-06 — Phase 2 sample-health-check test suite written (test-first)

**Status:** ✅ 116 TESTS WRITTEN (awaiting Wash's implementation)

**Test-first pattern applied again:**
- Wrote 116 tests across 3 files before implementation exists
- Tests define exact contracts for all 25 check functions, scoring logic, and aggregation
- Wash can implement against these test contracts

**Test coverage (116 tests total):**
- **checks.test.ts (74 tests):** All 25 check functions tested across 7 dimensions:
  - Documentation Quality (6 checks, 16 tests): README exists/quality/sections, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT
  - Repository Hygiene (5 checks, 13 tests): .gitignore, description, topics, not archived, default branch
  - CI/CD Presence (3 checks, 8 tests): has workflows, recent success, no failures
  - Dependency Freshness (3 checks, 8 tests): critical/high dependabot, automated security fixes
  - Activity & Maintenance (4 checks, 13 tests): recent commit/push, manageable issues, has releases
  - Branch Protection (1 check, 2 tests): branch protected
  - Azure-Specific (3 checks, 14 tests): azure topic, language topics, description mentions Azure

- **scoring.test.ts (24 tests):**
  - HEALTH_WEIGHTS sum validation (1 test)
  - gradeFromScore: all 5 grade values + all boundary values (16 tests)
  - calculateHealthScore: all pass, none pass, mixed, realistic scenario (4 tests)
  - generateDimensionSummary: grouping, all pass, all fail, empty (4 tests — note: was counted as 3 in prior estimate)

- **index.test.ts (18 tests):**
  - checkRepoHealth: success, high score, 404 handling, network error, structure validation, 7 dimensions, 25 signals (7 tests)
  - checkReposHealth: aggregation, empty list, mixed, grade distribution, worst dimension (5 tests)
  - generateHealthSummary: markdown output, grade distribution, empty report, repo details (4 tests)
  - Type contracts: RepoHealthCheck fields, HealthCheckReport summary (2 tests)

**Mock strategy:**
- `vi.mock('github-rest')` at module level — same pattern as security-audit-repos
- `mockHealthyRepo()` helper sets all endpoints to return healthy defaults
- Individual tests override specific mocks to test failure paths

**Key patterns established:**
- Check functions are pure: `(data) => CheckResult` — no API calls, easy to test
- Scoring isolated in scoring.ts with HEALTH_WEIGHTS constant
- All checks verify: `passed` boolean, `earned` value, `weight`, `dimension`, `signal`
- Boundary testing on gradeFromScore (90/89, 75/74, 50/49, 25/24)
- Date-based tests use relative dates (3 months ago, 8 months ago) for determinism

**Unblocks:** Wash can implement checks.ts, scoring.ts, index.ts against these contracts

### 2026-03-05 — Cross-Agent Context (Wash & Kaylee)

**From Wash (Solutions Dev):**
- Implemented full `sample-health-check` solution with 25 pure check functions
- Orchestration layer calls 12 github-rest endpoints (8 existing + 4 from Kaylee)
- Graceful degradation via Promise.allSettled
- All 116 tests pass on first run after implementation

**From Kaylee (Core Dev):**
- Added 4 P0 endpoints: `getCommunityProfile`, `fileExists`, `getDecodedFileContent`, `getLatestWorkflowRun`
- 17 new tests (52 total) all pass for github-rest
- Your test mocks during implementation enabled Wash to work in parallel
- When Kaylee's endpoints merge, live health-check runs will work

### 2026-03-06 — Strict TypeScript types added to github-rest endpoints (lockout fix)

**Status:** ✅ COMPLETE — 52/52 tests passing

**Context:** Mal rejected sample-health-check because github-rest endpoints returned `Promise<any>`. Kaylee (original author) was locked out per protocol. Zoe applied the type fixes.

**Changes made:**
1. **actions.ts** — Added 4 interfaces (`Workflow`, `WorkflowRun`, `WorkflowsResponse`, `WorkflowRunsResponse`) and replaced all `Promise<any>` / `Promise<any | null>` return types with strict types across all 4 functions.
2. **contents.ts** — Added 2 interfaces (`ContentItem`, `ContentFile`), replaced `const repoData: any` with `Repository` type (imported from `../types/index.js`), replaced `as any` cast with proper `ContentFile` type, and added return types to `getRootContents`, `getContents`, and `getDecodedFileContent`.
3. **index.ts** — Exported all new types: `WorkflowsResponse`, `WorkflowRunsResponse`, `WorkflowRun`, `Workflow`, `ContentItem`, `ContentFile`.

**Key observations:**
- Adding strict return types is a non-breaking change — narrows `any` to specific types
- Existing tests required zero modifications (they already used properly-shaped mock data)
- The `import type` + `.js` extension ESM conventions were followed consistently
- `ContentFile.encoding` typed as `string` to match GitHub API (could be `base64` or others)
- `WorkflowRun.conclusion` is `string | null` because in-progress runs have null conclusion

**Unblocks:** sample-health-check can proceed without `as any` casts in consumer code

### 2026-03-06 — Phase 3 create-remediation-issues test suite written (test-first)

**Status:** ✅ 75 TESTS WRITTEN (69 failing as expected, 6 constants/exports passing)

**Test-first pattern applied for third time:**
- Wrote 75 tests across 2 files before implementation exists
- Tests define exact contracts for analysis functions, deduplication, dry-run, formatting
- Wash can implement against these test contracts

**Test coverage (75 tests across 2 files):**
- **index.test.ts (61 tests):**
  - `analyzeSecurityFindings` (11 tests): critical/high dependabot, secret scanning, code scanning, branch protection, automated security fixes, threshold logic, multi-repo, no duplicates per repo, alert counts in body
  - `analyzeHealthFindings` (7 tests): grade D/F repos, dimension-specific issues, threshold customization, grade/score in body, multi-repo
  - `deduplicateIssues` (6 tests): open issue match → skip, closed issue → create, no match → create, mixed duplicates/new, correct API calls, error handling
  - `dry-run mode` (4 tests): no createIssue calls, summary reports, no label/issue API calls, dedup still runs
  - `formatIssueTitle` (5 tests): source tag, owner/repo, finding type, optional detail, health tag
  - `formatIssueBody` (4 tests): repo name, context data, severity, valid markdown
  - `createRemediationIssues` orchestrator (8 tests): security creation, health creation, both together, remediation labels, source labels, extra labels, issue number/URL, summary stats
  - `edge cases` (10 tests): empty reports, all healthy, both security+health issues, single-source input, no reports, missing fields, missing dimensions
  - `constants and exports` (6 tests): threshold values, labels, function exports
- **cli.test.ts (14 tests):**
  - `parseArgs` (9 tests): all flags individually, combined flags
  - `runCli` (5 tests): file reading, output writing, option passthrough

**Architecture decisions in tests:**
- **Input types defined locally** in `types.ts` — mirrors JSON shapes from security-audit-repos and sample-health-check (solutions don't import from each other; data flows via files)
- **Deduplication by title pattern** — matches open issues only; closed issues are not duplicates
- **Severity mapping:** critical dependabot + secrets = critical; high dependabot + code scanning = high; branch protection = medium; auto-fix = low
- **Default thresholds:** security score < 70, health grade D or F
- **Label convention:** all issues get `automated-remediation`, plus `security` or `health`
- **Dimension-specific issues** for health: dimensions with passRate < 0.5 get separate issues

**Mock strategy:**
- `vi.mock('github-rest')` at module level — issues namespace (createIssue, listIssues, addLabelsToIssue, createLabel)
- CLI tests also mock `node:fs/promises` and `./index.js` for isolation
- Test data factories: `makeSecurityRepo()`, `makeHealthRepo()`, `makeSecurityReport()`, `makeHealthReport()`

### 2026-03-06 — Phase 3 create-remediation-issues test suite written (test-first)

**Status:** ✅ 75 TESTS WRITTEN (all passing after implementation)

**Test-first pattern applied for third time:**
- Wrote 75 tests across 2 files before implementation exists
- Tests define exact contracts for analysis functions, deduplication, dry-run, formatting
- Wash implemented against these test contracts

**Test coverage (75 tests across 2 files):**
- **index.test.ts (61 tests):**
  - `analyzeSecurityFindings` (11 tests): critical/high dependabot, secret scanning, code scanning, branch protection, automated security fixes, threshold logic, multi-repo, no duplicates per repo, alert counts in body
  - `analyzeHealthFindings` (7 tests): grade D/F repos, dimension-specific issues, threshold customization, grade/score in body, multi-repo
  - `deduplicateIssues` (6 tests): open issue match → skip, closed issue → create, no match → create, mixed duplicates/new, correct API calls, error handling
  - `dry-run mode` (4 tests): no createIssue calls, summary reports, no label/issue API calls, dedup still runs
  - `formatIssueTitle` (5 tests): source tag, owner/repo, finding type, optional detail, health tag
  - `formatIssueBody` (4 tests): repo name, context data, severity, valid markdown
  - `createRemediationIssues` orchestrator (8 tests): security creation, health creation, both together, remediation labels, source labels, extra labels, issue number/URL, summary stats
  - `edge cases` (10 tests): empty reports, all healthy, both security+health issues, single-source input, no reports, missing fields, missing dimensions
  - `constants and exports` (6 tests): threshold values, labels, function exports
- **cli.test.ts (14 tests):**
  - `parseArgs` (9 tests): all flags individually, combined flags
  - `runCli` (5 tests): file reading, output writing, option passthrough

**Architecture decisions in tests:**
- **Input types defined locally** in `types.ts` — mirrors JSON shapes from security-audit-repos and sample-health-check (solutions don't import from each other; data flows via files)
- **Deduplication by title pattern** — matches open issues only; closed issues are not duplicates
- **Severity mapping:** critical dependabot + secrets = critical; high dependabot + code scanning = high; branch protection = medium; auto-fix = low
- **Default thresholds:** security score < 70, health grade D or F
- **Label convention:** all issues get `automated-remediation`, plus `security` or `health`
- **Dimension-specific issues** for health: dimensions with passRate < 0.5 get separate issues

**Mock strategy:**
- `vi.mock('github-rest')` at module level — issues namespace (createIssue, listIssues, addLabelsToIssue, createLabel)
- CLI tests also mock `node:fs/promises` and `./index.js` for isolation
- Test data factories: `makeSecurityRepo()`, `makeHealthRepo()`, `makeSecurityReport()`, `makeHealthReport()`

**Unblocks:** Wash implemented `src/index.ts` against these 75 test contracts

### 2026-03-06 — Phase 3 create-remediation-issues Implementation Complete

**Status:** ✅ ALL 75 TESTS PASSING

**Implementation by Wash:**
- `solutions/create-remediation-issues/src/index.ts` (432 lines, all functions)
- `solutions/create-remediation-issues/src/cli.ts` (74 lines, CLI orchestration)
- Two-tier threshold model: signal-based findings fire for every repo, score-based only fire as catch-all
- Exact title deduplication with fail-open on API errors
- Severity mapping from test contracts (overrides Mal spec where divergent)
- All 75 tests passing on first run post-implementation
- Build clean with zero errors

**Test contract findings (deviations from Mal's spec):**
- Branch protection disabled → severity 'medium' (spec said 'high')
- Automated security fixes disabled → severity 'low' (spec said 'medium')
- Health grade F → severity 'high' (spec said 'critical')
- High dependabot threshold: `>= 3` (spec said `> 3`)
- **Note:** Tests are the contract — always follow test expectations over design doc