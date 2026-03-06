# Project Context

- **Owner:** Dina Berry
- **Project:** GitHub REST API tooling monorepo — packages for extracting, analyzing, and acting on GitHub data to improve content, code, communications, planning, and CI
- **Stack:** TypeScript (strict, ESM), Node.js 22+, Vitest, npm workspaces, project references
- **Created:** 2026-03-05

### Solutions

- `solutions/get-pr-comments` — Extract PR comments for analysis
- `solutions/get-user-comments` — Extract user comment history across repos
- `solutions/move-between-repos` — Move content (issues, files) between repositories
- `solutions/get-instruction-from-pr-comments` — Extract actionable instructions from PR feedback using LLM
- `solutions/security-audit-repos` — ✅ P0 BASELINE SECURITY SCANNER (APPROVED by Mal, 2026-03-05)
- All solutions compose from `packages/github-rest` and `packages/llm-completion`
- Philosophy: DRY — solutions are thin orchestrations, heavy lifting in packages

## Core Context

**From early Phase 1 & 2 work (2026-03-05):**
- Mal proposed 6 new solutions (Phase 1-4 rollout): security-audit-repos (P0), sample-health-check (P0), create-remediation-issues (P1), pr-feedback-aggregator (P1), azure-best-practices-check (P2), sample-auto-fix (P2)
- All solutions follow consistent pattern: `src/index.ts` (library) + `src/cli.ts` (CLI entry) + optional `prompts/`
- Measurement framework: monthly audits stored in `generated/` with baseline tracking
- github-rest endpoints inventory: 40+ functions across 10 modules already in place; Phase 1 fixes (getBranchProtection recursion, circular imports, missing issues.ts, missing exports) unblocked everything
- Test-first pattern established: write tests before implementation to define contracts and enable parallel work
- Solution patterns: Promise.allSettled for graceful degradation, weighted scoring (start at base, deduct/award points), dual output formats (JSON + Markdown)
- Graceful degradation via 404 handling (features disabled don't fail checks)

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-03-06 — create-remediation-issues Phase 3 Complete

**Status:** ✅ PHASE 3 COMPLETE (P1 remediation issue creator fully implemented and tested)

**Solution delivery:**
- Wash implemented `solutions/create-remediation-issues/` — full pipeline: report analysis → finding extraction → deduplication → GitHub Issue creation
- All 75 tests passing (61 index + 14 CLI), build clean with zero errors
- Zoe's test-first scaffolding once again enabled zero-blocking parallel implementation

**Architecture decisions:**
- **Two-tier threshold model:** Signal-based findings (dependabot, code scanning, secret scanning, branch protection, auto-fix) fire for EVERY repo regardless of score. Score-based findings only fire for repos below the threshold AND only when no signal-based findings exist. This avoids noisy duplicate issues.
- **Exact title dedup:** Deduplication matches by exact title string against open issues with the `automated-remediation` label. Closed issues are not considered duplicates. API errors fail-open (create the issue anyway).
- **Client-side state filtering:** Deduplication filters returned issues by `state === 'open'` on the client side for robustness, even though the API accepts a state parameter.
- **Formatting composition:** `buildIssue()` helper composes `formatIssueTitle()` and `formatIssueBody()` to build complete RemediationIssue objects, keeping analysis functions clean.
- **CLI uses `new GitHubClient()` constructor** instead of `createGitHubClient()` factory — ensures non-undefined client in mock environments where factory returns undefined.

**Test contract findings (deviations from Mal's spec):**
- Branch protection disabled → severity 'medium' (spec said 'high')
- Automated security fixes disabled → severity 'low' (spec said 'medium')
- Health grade F → severity 'high' (spec said 'critical')
- High dependabot threshold: `>= 3` (spec said `> 3`)
- Tests are the contract — always follow test expectations over design doc

### 2026-03-06 — create-remediation-issues Phase 3 Complete

**Status:** ✅ PHASE 3 COMPLETE (P1 remediation issue creator fully implemented and tested)

**Solution delivery:**
- Wash implemented `solutions/create-remediation-issues/` — full pipeline: report analysis → finding extraction → deduplication → GitHub Issue creation
- All 75 tests passing (61 index + 14 CLI), build clean with zero errors
- Zoe's test-first scaffolding once again enabled zero-blocking parallel implementation

**Architecture decisions:**
- **Two-tier threshold model:** Signal-based findings (dependabot, code scanning, secret scanning, branch protection, auto-fix) fire for EVERY repo regardless of score. Score-based findings only fire for repos below the threshold AND only when no signal-based findings exist. This avoids noisy duplicate issues.
- **Exact title dedup:** Deduplication matches by exact title string against open issues with the `automated-remediation` label. Closed issues are not considered duplicates. API errors fail-open (create the issue anyway).
- **Client-side state filtering:** Deduplication filters returned issues by `state === 'open'` on the client side for robustness, even though the API accepts a state parameter.
- **Formatting composition:** `buildIssue()` helper composes `formatIssueTitle()` and `formatIssueBody()` to build complete RemediationIssue objects, keeping analysis functions clean.
- **CLI uses `new GitHubClient()` constructor** instead of `createGitHubClient()` factory — ensures non-undefined client in mock environments where factory returns undefined.

**Test contract findings (deviations from Mal's spec):**
- Branch protection disabled → severity 'medium' (spec said 'high')
- Automated security fixes disabled → severity 'low' (spec said 'medium')
- Health grade F → severity 'high' (spec said 'critical')
- High dependabot threshold: `>= 3` (spec said `> 3`)
- Tests are the contract — always follow test expectations over design doc

**Status:** ✅ PHASE 2 COMPLETE (P0 health-check fully implemented and tested)

**Solution delivery:**
- Wash built `solutions/sample-health-check/` with additive 100-point scoring model (0 → 100, award points for healthy signals)
- Zoe wrote 116 test cases (74 checks, 24 scoring, 18 orchestration) before implementation
- Kaylee added 4 P0 endpoints: getCommunityProfile, fileExists, getDecodedFileContent, getLatestWorkflowRun
- All 116+52=168 tests passing; build verified with zero errors

**Architecture pattern (Additive vs. Deductive):**
- security-audit-repos (Phase 1) uses deductive: 100 base → deduct penalties (critical -20, etc.) → clamp at 0
- sample-health-check (Phase 2) uses additive: 0 base → award points for healthy signals → normalize to 100
- Deductive model penalizes failures; additive rewards good practices; both achieve 0-100 score range

**Dimensional breakdown & weights (100pts total normalized):**
- Documentation (25pts): README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT quality checks
- CI/CD (20pts): Workflows exist, recent success, failure detection
- Dependency Freshness (16pts): No critical/high Dependabot alerts, auto-fix enabled
- Activity (16pts): Recent commits/pushes, manageable issue count, has releases
- Hygiene (12pts): .gitignore, description, topics, not archived, default branch
- Azure-Specific (7pts): Azure topic, language topics, description mentions Azure
- Branch Protection (5pts): Default branch protected

**Test-First Pattern Success:**
- Parallel work coordination: Zoe wrote 116 tests while Wash implemented (zero blocking)
- Kaylee added 4 endpoints in parallel; solution uses mocked versions in tests
- When Kaylee's endpoints merge into github-rest, live runs work without code changes
- All tests pass on first run post-implementation (test contracts honored)

**Unblocks Phase 3:** create-remediation-issues, pr-feedback-aggregator, azure-best-practices-check now have established patterns and test infrastructure

### 2026-03-05 — Cross-Agent Context (Kaylee & Zoe)

**From Kaylee (Core Dev):**
- Added 4 P0 endpoints to github-rest: `getCommunityProfile`, `fileExists`, `getDecodedFileContent`, `getLatestWorkflowRun`
- 17 new tests (52 total) all passing
- All endpoints your orchestration layer calls are now available or mocked

**From Zoe (Tester):**
- Wrote 116 comprehensive tests before your implementation (test-first pattern)
- Tests define exact contracts for all 25 check functions, scoring logic, aggregation
- All 116 tests pass on first run post-implementation
- Test mocking enabled parallel work: your implementation unblocked by test writing

### 2026-03-08 — Verbose Logging for Pipeline Transparency

**Status:** ✅ VERBOSE LOGGING COMPLETE (both create-remediation-issues and pr-feedback-aggregator now show progress)

**Problem:** Steps 3 & 4 of `npm run pipeline` showed no output between step header and completion. Users running `--verbose` saw almost nothing. Compare to steps 1 & 2 (security-audit, health-check) which show detailed per-repo progress.

**Solution delivery:**
- Added `verbose?: boolean` to RemediationOptions and PRFeedbackOptions types
- Added gated console.log progress to core functions (analyzeSecurityFindings, analyzeHealthFindings, deduplicateIssues, createRemediationIssues, fetchPRComments, generateReport)
- Updated CLI modules to show input paths, output paths, and formatted summaries
- Pattern: `const verbose = options?.verbose ?? false;` + gated `if (verbose) console.log(...)`

**Verbose output patterns added:**
- **create-remediation-issues:**
  - "Analyzing security report: N repos..."
  - "  {owner}/{repo}: N findings (finding-types)"
  - "Deduplication: N to create, M duplicates skipped"
  - "Dry run: N issues would be created" OR "Created N issues, skipped M duplicates"
  - Formatted summary table with totals
- **pr-feedback-aggregator:**
  - "Analyzing N repositories..."
  - "  {owner}/{repo}: fetching PRs..."
  - "  ✓ {owner}/{repo}: N PRs, M comments"
  - "  ⚠ {owner}/{repo}: not found, skipping"
  - "  (dry-run: skipping LLM analysis)"
  - "Aggregated: N PRs, M comments, X patterns"
  - Formatted summary table

**Design choices:**
- No logging library — just `console.log` gated by verbose flag (keep it simple)
- Pass verbose through options objects (not a separate parameter)
- Follow security-audit/health-check pattern for per-repo progress (repo name + bullet + data)
- Use ✓/⚠ symbols for success/warning (matches existing solutions)
- Summary tables use 60-char separator lines and left-aligned labels

**All tests still pass:** 75 tests (create-remediation-issues), 70 tests (pr-feedback-aggregator), build clean with zero errors

**Key files modified:**
- `solutions/create-remediation-issues/src/types.ts` (+1 field: verbose)
- `solutions/create-remediation-issues/src/index.ts` (5 functions + verbose output)
- `solutions/create-remediation-issues/src/cli.ts` (input paths + summary table)
- `solutions/pr-feedback-aggregator/src/index.ts` (2 functions + verbose output)
- `solutions/pr-feedback-aggregator/src/cli.ts` (input path + output paths + summary table)

### 2026-03-09 — Pipeline Error Logging for All Solutions

**Status:** ✅ COMPLETE (all 4 solutions + pipeline script now collect and log errors)

**Problem:** Per-repo API errors (401 auth, 404 not-found, 403 rate-limit) were silently swallowed. Dina couldn't tell which repos failed or why without running with --verbose and reading console output.

**Solution delivery:**
- Added `PipelineError` interface to all 4 solutions (defined per-solution since packages are independent)
- Core functions (`auditRepos`, `checkReposHealth`, `createRemediationIssues`, `generateReport`) now collect errors into `errors?: PipelineError[]` on their return types
- CLI layers write `{step}-errors.log` files in the output directory when errors are present
- `scripts/run-pipeline.mjs` checks all output directories for `*-errors.log` files and prints a summary
- All 286 tests pass, build clean with zero errors

**Architecture decisions:**
- **Optional errors field:** `errors?: PipelineError[]` is optional on all result types so existing consumers (including tests) are unaffected
- **Error categorization helper:** Each solution has a `categorizePipelineError()` that maps caught errors to structured `PipelineError` objects with human-readable messages and fix suggestions
- **Fail-open preserved:** create-remediation-issues deduplication still creates issues on API error (fail-open), but now also logs the error
- **Error log format:** Simple human-readable text with `[CATEGORY] repo` + error + fix suggestion — not JSON, designed for Dina to scan quickly
- **Pipeline doesn't fail on errors:** Error logs are informational. Pipeline continues and reports error log locations at the end.

**Error categories:**
- `auth` — 401 errors → "Check your GITHUB_TOKEN in .env"
- `not_found` — 404 errors → "Verify the repo exists and you have access"
- `rate_limit` — 403/rate limit → "Wait a few minutes or use a token with higher limits"
- `api_error` — other API errors → "Check the error message for details"

**Key files modified:**
- `solutions/security-audit-repos/src/index.ts` (PipelineError + error collection in auditRepos)
- `solutions/security-audit-repos/src/cli.ts` (formatErrorLog + security-audit-errors.log writer)
- `solutions/sample-health-check/src/index.ts` (PipelineError + error collection in checkReposHealth)
- `solutions/sample-health-check/src/cli.ts` (formatErrorLog + health-check-errors.log writer)
- `solutions/create-remediation-issues/src/types.ts` (PipelineError + errors field on RemediationResult)
- `solutions/create-remediation-issues/src/index.ts` (error collection in dedup + create loops)
- `solutions/create-remediation-issues/src/cli.ts` (formatErrorLog + remediation-issues-errors.log writer)
- `solutions/pr-feedback-aggregator/src/types.ts` (PipelineError + errors field on AggregatedReport)
- `solutions/pr-feedback-aggregator/src/index.ts` (error collection in generateReport)
- `solutions/pr-feedback-aggregator/src/cli.ts` (formatErrorLog + pr-feedback-errors.log writer)
- `scripts/run-pipeline.mjs` (error log summary after all steps)

