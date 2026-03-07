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

**✅ 2026-03-07 — azure-best-practices-check (P2) Architecture Decision APPROVED**
- Mal finalized architecture: Solution only (`solutions/azure-best-practices-check`), no new package
- 15 checks across 5 dimensions (azure-sdk, iac, config, ci-cd, security)
- Additive scoring (0→100), letter grades (A/B/C/D/F)
- v1 independent; v2 feeds into create-remediation-issues
- All github-rest endpoints exist; zero blockers
- Ready for Wash (scaffolding) + Zoe (test-first rules/scoring)
- See `.squad/decisions.md` Decision #30 for full architecture details


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

### 2026-03-09 — Pipeline Preflight Token Validation

**Status:** ✅ COMPLETE (preflight check runs before all 4 pipeline steps)

**Problem:** When GITHUB_TOKEN is invalid/expired, all 4 pipeline steps run and fail with 401s. Users have to dig through error logs to figure out it was a token issue all along.

**Solution delivery:**
- Added `preflight()` async function to `scripts/run-pipeline.mjs` that uses Kaylee's new `GitHubClient.validateToken()` method
- Runs immediately after `applyMode` declaration, before Step 1
- On success: prints `✅ GitHub token valid (authenticated as @{login})`
- On failure: prints the error, fix suggestion, and continues (informational, not blocking)
- Reads both `GITHUB_TOKEN` and `GH_TOKEN` env vars (covers both conventions in the project)

**Design choices:**
- **Non-blocking:** Preflight warns but does NOT exit. Pipeline continues so error logs are still generated for each step (existing behavior preserved)
- **Import path:** `../packages/github-rest/dist/index.js` — relative to `scripts/` directory, not repo root. ESM resolution is relative to the importing file.
- **Token precedence:** `GITHUB_TOKEN || GH_TOKEN` — checks GITHUB_TOKEN first (more common), falls back to GH_TOKEN (which is what GitHubClient constructor uses by default)
- **Depends on Kaylee's work:** Uses `validateToken()` which returns structured `{ valid, login, scopes, error, suggestion }` — clean contract, no try/catch needed in pipeline

**Key file modified:**
- `scripts/run-pipeline.mjs` (import + preflight function + call before Step 1)

### 2026-03-09 — Actionable Rate Limit Error Messages

**Status:** ✅ COMPLETE (all 4 solutions + pipeline preflight now show when rate limit resets)

**Problem:** Rate limit error messages just said "Wait a few minutes or use a token with higher limits" — repeating the error without actionable info. Users couldn't tell WHEN the limit resets.

**Solution delivery:**
- Updated `categorizePipelineError()` in all 4 solutions to check `error.name === 'RateLimitError'` first
- When the error IS a `RateLimitError` (from github-rest), extracts `resetAt`, `remaining`, `limit` fields parsed from response headers
- Error messages now show: `GitHub API rate limit exceeded (0/5000 calls remaining)`
- Suggestions now show: `Rate limit resets at 10:45:23 PM (in ~12 minutes). Wait for reset or use a different token.`
- Falls back to generic message when error is a plain 403/rate-limit string match (no parsed fields)
- Pipeline preflight (`buildReport`) now shows rate limit status after Kaylee added `rateLimit` to `TokenValidationResult`
- Preflight gates: remaining=0 → hard exit; remaining<100 → warning; otherwise → info line

**Design choices:**
- **Name-based duck typing:** Uses `error.name === 'RateLimitError'` instead of `instanceof` import to avoid coupling solutions to the class directly. Cast to typed shape for field access.
- **Graceful fallback:** The existing 403/rate-limit string matching remains as a fallback for errors that don't come through as RateLimitError (e.g., re-thrown plain Errors).
- **Preflight hard gate at 0:** Pipeline `process.exit(1)` when remaining=0 since all 4 steps would fail anyway.

**Key files modified:**
- `solutions/security-audit-repos/src/index.ts` (categorizePipelineError with RateLimitError check)
- `solutions/sample-health-check/src/index.ts` (same pattern)
- `solutions/create-remediation-issues/src/index.ts` (same pattern)
- `solutions/pr-feedback-aggregator/src/index.ts` (same pattern)
- `scripts/run-pipeline.mjs` (buildReport + preflight with rate limit display and hard gate)

**All 338 tests pass** (52 github-rest + 25 security-audit + 116 health-check + 75 remediation + 70 pr-feedback), build clean.

### 2026-03-09 — Pipeline Repo Accessibility Pre-Check

**Status:** ✅ COMPLETE (pipeline now checks repo access before running solutions)

**Problem:** Microsoft enterprise policy 403s blocked the PAT on Azure-Samples repos. All 4 solutions ran and failed on the same blocked repos, wasting time and producing confusing errors.

**Solution delivery:**
- Added `checkRepoAccess()` function to `scripts/run-pipeline.mjs` as Preflight Step 2 (after token validation)
- For each repo in `active-sample-repos.json`, calls `client.checkRepoAccess(owner, repo)` and displays ✅/❌ results
- Writes structured JSON log to `generated/preflight/{timestamp}-repo-access.json`
- If some repos blocked: writes filtered `accessible-repos.json`, pipeline continues on accessible repos only
- If ALL repos blocked: pipeline aborts with clear message
- If `checkRepoAccess` method not yet available: skips pre-check with warning (safe for parallel dev with Kaylee)

**Design choices:**
- **Preflight returns client:** Changed `preflight()` to return the `GitHubClient` instance so it can be reused for repo access checks without creating a second client
- **Direct node commands:** Steps 1, 2, 4 now invoke node directly with `effectiveInput` path instead of `npm run` (which has hardcoded input paths in package.json)
- **Graceful fallback:** `typeof ghClient.checkRepoAccess !== 'function'` guard allows pipeline to work even before Kaylee merges the method
- **Step 3 (create-remediation-issues) unchanged:** It consumes outputs from steps 1 & 2, which already contain only accessible repos

**Key file modified:**
- `scripts/run-pipeline.mjs` (readFile import + preflight returns client + checkRepoAccess function + effectiveInput threading through steps 1/2/4)

### 2026-03-09 — Stale Error Log Cleanup

**Status:** ✅ COMPLETE (pipeline and all solution CLIs now clean up error logs from previous runs)

**Problem:** Error logs from previous pipeline runs persisted in `generated/` output directories and were incorrectly reported at the end of subsequent successful runs. Even though the current run had no errors, old `*-errors.log` files from rate-limited runs hours earlier remained and the pipeline's error scanner falsely reported them.

**Solution delivery:**
- Added `cleanupStaleErrorLogs()` function to `scripts/run-pipeline.mjs` that removes all `*-errors.log` files from the 4 output directories before running the 4 solution steps
- Added per-solution cleanup at the start of each CLI's run function: security-audit-repos, sample-health-check, create-remediation-issues, pr-feedback-aggregator
- Each solution now deletes its own error log before running (handles standalone CLI invocations outside the pipeline)

**Architecture decisions:**
- **Two-layer cleanup:** Pipeline cleans ALL error logs before starting (handles pipeline runs). Each solution CLI cleans its OWN error log before running (handles standalone runs). This ensures error logs always reflect the CURRENT run.
- **Silent unlink failures:** `try { await unlink(errorLogPath) } catch {}` — file not existing is the happy path, so we swallow errors silently
- **Early cleanup in CLIs:** Each solution cleans its error log immediately after ensuring the output directory exists and before making any API calls. This ensures a clean slate even if the run crashes mid-execution.
- **Consistent pattern:** All 4 solutions follow the same cleanup pattern (unlink error log → make API calls → write new error log if needed)

**Key files modified:**
- `scripts/run-pipeline.mjs` (added unlink import + cleanupStaleErrorLogs function before step 1)
- `solutions/security-audit-repos/src/cli.ts` (cleanup before auditRepos call)
- `solutions/sample-health-check/src/cli.ts` (cleanup before checkReposHealth call)
- `solutions/create-remediation-issues/src/cli.ts` (added unlink import + cleanup before createRemediationIssues call)
- `solutions/pr-feedback-aggregator/src/cli.ts` (added unlink import + cleanup before generateReport call)

**All 286 tests pass** (25 security-audit + 116 health-check + 75 remediation + 70 pr-feedback), build clean with zero errors.




### 2026-03-07 - Remediation output gap fixed

**Problem:** generated/remediation-issues/ was empty after pipeline runs. The CLI only wrote output when --out was explicitly provided, and the pipeline script never passed --out.

**Fix (Option B + pipeline):**
- cli.ts: Changed --out from file-path to directory semantics (matching security-audit and health-check pattern). Default output dir: generated/remediation-issues. Always writes timestamped json+md. Summary prints unconditionally. Added generateRemediationSummary() for MD output.
- run-pipeline.mjs: Added --out ./generated/remediation-issues to remediation step. Uses findLatestJson() after the step (consistent with other steps).
- cli.test.ts: Updated tests for directory-based --out; added test for default output behavior; added unlink to fs mock. 76 tests pass (61 index + 15 CLI).
### 2026-03-07 — azure-best-practices-check (P2) IMPLEMENTED

**Status:** ✅ COMPLETE — Full solution built and all 131 tests passing

**What was built:**
- `solutions/azure-best-practices-check/` — complete Azure best practices validator
- 15 pure-function check rules across 5 dimensions: azure-sdk (4), iac (3), config (3), ci-cd (3), security (2)
- Additive scoring engine (0→100) with letter grades (A≥85, B≥70, C≥55, D≥40, F<40)
- Orchestrator: fetches files via github-rest contents API (5-9 calls/repo), runs rules, aggregates report
- CLI: `--input`, `--out`, `--format json|markdown|both`, `--verbose`, `--dry-run`
- Dual output: timestamped `{ts}-azure-bp.json` + `{ts}-azure-bp.md`
- Error log cleanup + pipeline error categorization (same patterns as health-check/security-audit)

**Key implementation details:**
- PipelineError shape updated to match existing solutions (`repo`, `category`, `message`, `suggestion`)
- Zoe's pre-existing test stubs had `format: 'md'` and `PipelineError.error` — fixed to match actual interface
- CLI tests needed GITHUB_TOKEN env mock and `generateMarkdownReport` mock — added afterEach cleanup
- Workflow file discovery: uses `client.get()` to list `.github/workflows` directory, then fetches up to 3 YAML files
- IaC file discovery: checks root-level .bicep/.tf/azuredeploy.json, then falls back to infra/ directory

**Patterns confirmed:**
- `isMain` guard pattern for testable CLI modules
- `import type` for type-only imports throughout
- Sequential repo processing for rate-limit safety
- Promise.allSettled not needed here (single-path fetching, not parallel)