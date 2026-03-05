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

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-03-05 — Code Review: security-audit-repos Solution

**Reviewer:** Mal (Lead)  
**Outcome:** APPROVED WITH NITS

**Major findings:**
- **M1 (DRY):** Manual `repos.getRepo()` call to extract only `default_branch` field — should extract `getDefaultBranch(client, owner, repo)` helper to github-rest
- **M2 (Tech Debt):** `alerts.listDependabotAlerts()`, `alerts.listCodeScanningAlerts()`, `alerts.listSecretScanningAlerts()`, `security.getAutomatedSecurityFixes()` return `any` — forces `as any` casts in solution. Decision filed to add return types to alerts/security modules

**Minor findings:**
- **m1:** Token env var inconsistency — standardize on `GITHUB_TOKEN` across all solutions (Kaylee fixing)
- **m2:** `unknown[]` types in interfaces — replace with specific types (DependabotAlert[], CodeScanningAlert[], etc.)

**Handoff:**
- Kaylee fixing M1 (getDefaultBranch extraction) and m1 (token standardization) — background task
- Wash's solution ready for production baseline audit runs
- Scribe merged decision inbox and updated cross-agent history

### 2026-03-05 — Solution Design Deep Dive

**Solution pattern anatomy:** Every solution follows `src/index.ts` (exported pipeline function) + `src/cli.ts` (CLI entry point using `process.argv` or `parseArgs`). Dependencies use `file:` references to monorepo packages. Output files named `{owner}-{repo}-{context}.{ext}`.

**Package API surface inventory:**
- `github-rest` exports: `alerts` (dependabot, code-scanning, secret-scanning, advisories), `security` (branch protection, collaborators, secrets, auto-fix), `repos` (CRUD, metadata, PR management, stale detection), `contents` (root file listing), `actions` (workflows, runs), `pullRequests` (comments), `user` (auth, profile), `permissions` (repo permissions), `prcomments` (user PR comments)
- `llm-completion` exports: `callOpenAI(prompt, config, opts)` — supports retry, debug file writing, configurable model/temperature/maxTokens
- **Missing from github-rest:** `issues.ts` (create/list issues), `git.ts` (refs/branches API), recursive file tree walker, file update via Contents API

**Key file paths:**
- `packages/github-rest/src/endpoints/` — all API helpers
- `packages/github-rest/src/index.ts` — package exports (must add new modules here)
- `packages/llm-completion/src/llm.ts` — LLM implementation with 3-minute timeout, 3 retries
- `solutions/get-instruction-from-pr-comments/src/index.ts` — most sophisticated solution: bot filtering, importance scoring, comment cleaning, LLM prompt construction
- `solutions/get-instruction-from-pr-comments/prompts/` — system.txt and user.txt prompt templates
- `active-sample-repos.json` — list of repos to target for scanning solutions

**Architecture decision:** All 5 proposed solutions need `issues.ts` in `github-rest` — build that first to unblock everything. The `auto-fix-samples` solution additionally needs `git.ts` (refs API) and contents update helpers.

**Bot filtering pattern:** `get-instruction-from-pr-comments` has a reusable bot detection system (known bot list + pattern matching) and importance scoring algorithm. These should be extracted to a shared utility when building the compliance checker.

### 2026-03-05 — security-audit-repos Solution (P0 Baseline)

**Created:** First P0 solution from SMART goal strategy — unified security posture scanner establishing measurement baseline.

**Architecture:**
- Parallel endpoint calls with `Promise.allSettled` for resilience (404s when features disabled don't fail audit)
- Security scoring algorithm: start at 100, deduct weighted points (critical: -20, high: -10, secrets: -15, no branch protection: -25, etc.)
- Output: timestamped JSON reports + Markdown summaries sorted by priority (lowest scores first)
- Error handling: per-endpoint try/catch, graceful degradation when security features not enabled

**Key implementation patterns:**
- `auditRepo(client, owner, repo, options)` — single repo audit with granular error handling
- `auditRepos(client, repos[], options)` — batch processing with continue-on-error
- `generateAuditSummary(report)` — human-readable Markdown with severity breakdown
- CLI follows established pattern: `--input`, `--out`, `--format`, `--verbose` flags

**Endpoints used from github-rest:**
- `alerts.listDependabotAlerts` — severity categorization (critical/high/medium/low)
- `alerts.listCodeScanningAlerts` — enabled detection via 404 handling
- `alerts.listSecretScanningAlerts` — enabled detection via 404 handling
- `alerts.listRepositorySecurityAdvisories` — advisory count tracking
- `security.getBranchProtection` — default branch protection status (was fixed in Phase 1)
- `security.getAutomatedSecurityFixes` — auto-fix enablement check
- `repos.getRepo` — default branch detection

**Output schema:** `RepoSecurityAudit` per repo + `SecurityAuditReport` aggregate with summary stats (avgScore, totalAlerts, reposWithoutBranchProtection). Supports baseline measurement for 25% reduction metric.

**Files created:**
- `solutions/security-audit-repos/src/index.ts` — library functions (auditRepo, auditRepos, generateAuditSummary)
- `solutions/security-audit-repos/src/cli.ts` — CLI entry point with help text
- `solutions/security-audit-repos/package.json` — follows monorepo file: reference pattern
- `solutions/security-audit-repos/tsconfig.json` — extends base, composite: true, references github-rest
- `solutions/security-audit-repos/README.md` — comprehensive usage docs with examples
- `solutions/security-audit-repos/sample.env` — GITHUB_TOKEN template

**Build verified:** `npm install && npm run build` successful, dist/ contains compiled JS + type definitions.

### 2026-03-05 — Cross-Agent Context (Mal & Kaylee)

**From Mal (Lead):**
- Proposed 6 new solutions with detailed data flows and output schemas
- Phase 1 (Week 1-2): Fix github-rest exports + add issues.ts + build security-audit-repos baseline
- Phase 2 (Week 3-4): sample-health-check detection
- Phase 3 (Week 5-6): create-remediation-issues + pr-feedback-aggregator + azure-best-practices-check
- Phase 4 (Week 7-8): sample-auto-fix (full automation)
- Measurement framework: monthly security-audit runs, track 25% reduction: `(baseline_issues - current_issues) / baseline_issues >= 0.25`
- Key gaps: alerts/contents/orgs not exported from index.ts; no issues.ts endpoint exists

### 2026-03-05 — Cross-Agent Context (Mal & Kaylee)

**From Mal (Lead):**
- Proposed 6 new solutions with detailed data flows and output schemas
- Phase 1 (Week 1-2): Fix github-rest exports + add issues.ts + build security-audit-repos baseline
- Phase 2 (Week 3-4): sample-health-check detection
- Phase 3 (Week 5-6): create-remediation-issues + pr-feedback-aggregator + azure-best-practices-check
- Phase 4 (Week 7-8): sample-auto-fix (full automation)
- Measurement framework: monthly security-audit runs, track 25% reduction: `(baseline_issues - current_issues) / baseline_issues >= 0.25`
- Key gaps: alerts/contents/orgs not exported from index.ts; no issues.ts endpoint exists

**From Kaylee (Core Dev):**
- **CRITICAL BUG:** `permissions.ts:16` — `getBranchProtection` calls itself infinitely; must fix
- 40+ existing functions inventoried; ~45 more functions needed
- New modules required: issues.ts (6 functions), commits.ts (3), trees.ts (1), environments.ts (2)
- Extensions needed: alerts (5 detail getters), security (4 enable/disable), repos (2 helpers)
- LLM enhancements: structured analyzers, system prompt support, batch-aware calling
- 5 new CLI commands proposed following existing gather/evaluate/change pattern
- All 5 new solutions blocked until github-rest exports fixed and issues.ts added

### 2026-03-05 — security-audit-repos Complete with Tests

**Status:** ✅ PHASE 1 COMPLETE (P0 solution fully implemented and tested)

**Solution delivery:**
- Wash built `solutions/security-audit-repos/` with resilient Promise.allSettled pattern
- Zoe wrote 25 comprehensive test cases covering all functions, edge cases, scoring algorithm
- All 25 tests passing; build verified with zero errors
- P0 baseline scanner ready for production audit runs

**Implementation details from security-audit-repos:**
- **Graceful degradation:** Promise.allSettled for parallel endpoint calls (404 handling)
- **Weighted scoring:** 100 base, deductions: critical -20, high -10, medium -5, secrets -15, code scanning -10, no branch protection -25, no auto-fix -10
- **Dual output:** JSON (structured analysis) + Markdown (human-readable summary)
- **Error handling:** Continue-on-error at repo level, fail-fast at solution level

**Testing innovations:**
- **Test-first pattern:** Tests written before implementation defined contracts
- **Module-level mocking:** `vi.mock('github-rest')` for solution tests (differs from endpoint tests)
- **Clear penalty specifications:** Tests document exact scoring values and edge cases
- **404 handling tests:** Graceful degradation when features disabled (not_enabled state)

**Architectural learnings captured:**
- Weighted scoring can be extracted and reused for health checks
- Promise.allSettled enables resilient parallel API patterns
- Solution tests should mock endpoint modules, not GitHubClient methods
- Test-first unblocks parallel work between dev and QA

**Unblocks Phase 2-4:** All solutions can now compose from github-rest baseline (alerts, contents, orgs, issues all exported + fixed)

### 2026-03-06 — sample-health-check Solution (P0 Phase 2)

**Status:** ✅ IMPLEMENTED — 116/116 tests passing, build verified

**Architecture:**
- Three-layer separation: `checks.ts` (25 pure functions) → `scoring.ts` (weights, grades, dimensions) → `index.ts` (orchestration)
- Additive scoring: start at 0, award points for healthy signals, normalized to 0-100
- 7 dimensions: Documentation (25pts), CI/CD (20pts), Dependency Freshness (16pts), Activity (16pts), Hygiene (12pts), Azure-Specific (7pts), Branch Protection (5pts)
- Promise.allSettled for graceful degradation — when data unavailable, check fails (no points awarded)
- Guard pattern: 6 checks that would "false positive" on missing data are explicitly failed when data source is unavailable

**Key Design Decisions:**
- Normalized scoring (earned/possible * 100) instead of raw sum — handles weight drift gracefully
- Check functions take simple primitives (boolean, string, number), not complex API response objects — orchestration layer does all data extraction
- Dimension name `'azure'` (not `'azure_specific'`) for cleaner output
- Exact CLI pattern from security-audit-repos (--input, --out, --format, --verbose)

**Endpoints Used:**
- repos: getRepo, getDefaultBranch, getCommunityProfile (Kaylee), getRepoReadme, fetchRepoMetadata, listReleases
- actions: listRepoWorkflows, getLatestWorkflowRun (Kaylee)
- alerts: listDependabotAlerts
- security: getBranchProtection, getAutomatedSecurityFixes
- contents: getRootContents

**Files Created:**
- `solutions/sample-health-check/src/checks.ts` — 25 pure check functions
- `solutions/sample-health-check/src/scoring.ts` — HEALTH_WEIGHTS (100pts), calculateHealthScore, gradeFromScore, generateDimensionSummary
- `solutions/sample-health-check/src/index.ts` — checkRepoHealth, checkReposHealth, generateHealthSummary
- `solutions/sample-health-check/src/cli.ts` — CLI entry point
- `solutions/sample-health-check/README.md` — Full documentation
- `solutions/sample-health-check/sample.env`
- Root package.json: added `sample-health-check` script

**Parallel Work Integration:**
- Zoe's 116 tests (checks.test.ts: 74, scoring.test.ts: 24, index.test.ts: 18) all pass
- Kaylee's getCommunityProfile and getLatestWorkflowRun are called; build compiles because tests mock these
- When Kaylee's endpoints land in github-rest, live runs will work without code changes

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

