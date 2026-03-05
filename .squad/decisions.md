# Squad Decisions

## Active Decisions

### 1. SMART Goal Solution Strategy (Mal — 2026-03-05)

**Scope:** 6 proposed solutions to accelerate "Reduce repo-related security and operational issues by 25%"

**Solutions (Priority Ordered):**
1. **security-audit-repos** (P0) — Unified security posture scanner; establishes baseline for measurement
2. **sample-health-check** (P0) — Comprehensive health analyzer; addresses "analyze state of sample"
3. **create-remediation-issues** (P1) — Automated work item creator; closes automation loop
4. **pr-feedback-aggregator** (P1) — Cross-PR pattern analyzer; scales PR→instructions at scale
5. **azure-best-practices-check** (P2) — Azure MCP best practices validator
6. **sample-auto-fix** (P2) — Automated remediation with PR creation

**Key Gaps in github-rest:**
- `alerts.ts` implemented but not exported
- `contents.ts` implemented but not exported
- `orgs.ts` implemented but not exported
- **No `issues.ts` endpoint** — must create: createIssue, listIssues, updateIssue, addLabelsToIssue, createLabel, listLabels

**Measurement Framework:**
- Monthly security-audit runs → store in `generated/security-audit/{timestamp}.json`
- Tracked signals: Dependabot critical+high, code-scanning alerts, secret-scanning alerts, repos without branch protection, failed CI, missing security configs
- Success metric: `(baseline_issues - current_issues) / baseline_issues >= 0.25`

**Phase Timeline:**
- Phase 1 (Week 1-2): Fix github-rest exports + add issues.ts + build security-audit-repos
- Phase 2 (Week 3-4): sample-health-check
- Phase 3 (Week 5-6): create-remediation-issues + pr-feedback-aggregator + azure-best-practices-check
- Phase 4 (Week 7-8): sample-auto-fix (full automation)

---

### 2. Solution Design Patterns & Composition (Wash — 2026-03-05)

**Pattern Anatomy:** Every solution follows `src/index.ts` (exported function) + `src/cli.ts` (CLI entry) + optional `prompts/` directory. Dependencies use `file:` references.

**Reusable Skills Identified:**
- Bot filtering & importance scoring (from `get-instruction-from-pr-comments`) — extract for reuse
- LLM prompt composition with structured input/output
- Clone + branch + PR creation pattern (from `move-between-repos`)

**Blocking Dependencies:**
1. github-rest package must export alerts/contents/orgs and add `issues.ts`
2. Need `git.ts` endpoint for sample-auto-fix (refs/branches API)
3. Need LLM structured analyzers for sample-health-check
4. Need file update helpers for auto-fix (contents API write support)

**Data Flow Design:** All 5 solutions use composition of github-rest endpoints + llm-completion calls. Output files follow `{owner}-{repo}-{context}.{ext}` naming convention.

---

### 3. Technical Audit & Gap Analysis (Kaylee — 2026-03-05)

**Current Inventory:** 40+ functions across 10 endpoint modules in github-rest:
- repos.ts (15) | actions.ts (3) | alerts.ts (5) | security.ts (4) | permissions.ts (7) | pull-requests.ts (1) | user-pr-comments.ts (1) | user.ts (3) | orgs.ts (1) | core infrastructure

**CRITICAL BUG FOUND:**
- **File:** `packages/github-rest/src/endpoints/permissions.ts:16`
- **Issue:** `getBranchProtection` calls itself recursively instead of delegating to `security.getBranchProtection`
- **Impact:** Infinite stack overflow on any use
- **Fix:** Change to `return security.getBranchProtection(client, owner, repo, branch);`

**Missing Endpoints (~45 functions):**

| Module | Functions | Purpose |
|--------|-----------|---------|
| **issues.ts** (NEW) | createIssue, listIssues, updateIssue, addLabelsToIssue, createLabel, listLabels | Auto-create work items |
| **commits.ts** (NEW) | listCommits, getCommit, compareCommits | Change analysis |
| **trees.ts** (NEW) | getTree (recursive) | Recursive repo scanning |
| **environments.ts** (NEW) | listEnvironments, getEnvironment | CI/CD security |
| **alerts.ts** (extend) | getCodeScanningAlert, getDependabotAlert, getSecretScanningAlert, updateSecretScanningAlert, listCodeScanningAnalyses | Alert detail + state |
| **security.ts** (extend) | enableVulnerabilityAlerts, disableVulnerabilityAlerts, enableAutomatedSecurityFixes, disableAutomatedSecurityFixes | Security automation |
| **repos.ts** (extend) | getDecodedFileContent (helper), getCommunityProfile | Content + security posture |

**LLM Enhancements Needed:**
- Structured analyzers: analyzeCodeSecurity, generateRemediation, prioritizeFindings
- System prompt support: callOpenAIWithSystem(systemPrompt, userPrompt, cfg)
- Batch-aware calling for multi-request workflows

**CLI Command Templates:** Proposed 5 new commands following existing gather/evaluate/change pattern:
- gather-security-alerts
- evaluate-security-posture
- evaluate-code-security
- change-create-security-issues
- change-enable-security-features

---

### 4. Phase 1 github-rest Fixes (Kaylee — 2026-03-05)

**Status:** Implemented

**Context:** Phase 1 of the SMART goal rollout was blocked by three issues in `packages/github-rest`.

**Changes:**
1. **Fixed `getBranchProtection` recursive bomb** — Was calling itself infinitely. Now calls GitHub API directly via `client.get(/repos/{owner}/{repo}/branches/{branch}/protection)`. Removed unused `security` import.
2. **Fixed `orgs.ts` circular import** — Changed `'src/index.js'` to `'../core/client.js'` and used `import type`. Matches established convention across all endpoint modules.
3. **Created `issues.ts` endpoint module** — 7 functions: `createIssue`, `listIssues`, `getIssue`, `updateIssue`, `addLabelsToIssue`, `createLabel`, `listLabels`. Full TypeScript interfaces: `GitHubIssue`, `GitHubLabel`, `CreateIssueOptions`, `UpdateIssueOptions`, `ListIssuesOptions`. Follows existing patterns (import type from `../core/client.js`, named exports, `.js` ESM extensions).
4. **Exported missing modules from `index.ts`** — Added: `export * as alerts from ...`, `export * as contents from ...`, `export * as orgs from ...`, `export * as issues from ...`

**Build Verified:** `npm run build` passes with zero errors.

**Impact:** All five planned solutions can now import alerts, contents, orgs, and issues from github-rest. The `getBranchProtection` function is safe to call.

---

### 5. Phase 1 Test Infrastructure for github-rest (Zoe — 2026-03-05)

**Status:** Implemented

**Context:** `packages/github-rest` had zero tests and no test infrastructure. Phase 1 fixes (permissions bug, issues.ts module, index exports) all need test coverage.

**Decisions:**
1. **Vitest added as devDependency** to `packages/github-rest` with `vitest.config.ts` and updated scripts (`test`, `test:watch`).
2. **Mock pattern established:** A `createMockClient()` factory returning `vi.fn()` stubs for all `GitHubClient` methods. This is the canonical pattern for all future endpoint tests.
3. **Test files colocated:** `permissions.test.ts`, `issues.test.ts` next to source; `index.test.ts` at package root `src/`.
4. **35 tests total** covering success, error propagation, parameter passing, and export validation:
   - `permissions.test.ts`: 6 tests (getBranchProtection fix, branch encoding, error propagation, module mocking)
   - `issues.test.ts`: 18 tests (all 7 functions, success paths, error cases)
   - `index.test.ts`: 11 tests (namespace export validation, function availability)

**Key Learnings:**
- Branch encoding: `feature/test` → `feature%2Ftest` in URLs (safety measure for branch names with `/`)
- Namespace exports require `export * as foo from ...` + typeof checks in tests
- Module graph for permissions: permissions → repos + security (requires mocking)
- Canonical mock shape: all `GitHubClient` methods as `vi.fn()` with proper cast as `GitHubClient`

**Test Results:** ✅ 35/35 tests pass

**Implications:**
- All future endpoint modules should follow the same mock pattern
- `npm run test` in `packages/github-rest` now runs real tests
- CI should be updated to include this package in test runs

---

### 6. security-audit-repos Implementation Pattern (Wash — 2026-03-05)

**Status:** Implemented

**Context:** Built the P0 solution from SMART goal strategy to establish measurement baseline.

**Architectural Decisions:**

1. **Graceful Degradation Pattern** — Use `Promise.allSettled` for parallel endpoint calls instead of `Promise.all`
   - Allows capture of "not enabled" status (404s) rather than failing entire audit
   - Continues processing other signals even if one endpoint fails
   - Distinguishes "feature disabled" vs "API error"

2. **Weighted Security Scoring** — Start at 100 points, subtract penalties:
   - Critical Dependabot: -20 (highest impact)
   - Secret scanning: -15 (immediate risk)
   - High Dependabot: -10
   - Code scanning: -10
   - Branch protection missing: -25 (fundamental control)
   - Auto-fix disabled: -10
   - Medium Dependabot: -5
   - Score floor at 0 (prevents negatives)

3. **Dual Output Formats** — Support JSON (structured data) + Markdown (human-readable) in one run
   - JSON enables programmatic analysis, trend tracking, CI integration
   - Markdown provides immediate human review and prioritization
   - Both generated from same audit data — no duplication

4. **Error Handling Philosophy** — Continue-on-error at repo level, fail-fast at solution level
   - Invalid repo names: skip with warning, continue batch
   - Missing permissions: capture what's available, mark as "not enabled"
   - Network errors: fail entire run (auth likely invalid)

**Outcomes:**
- Unblocks Phase 1 measurement baseline establishment
- Monthly audit tracking for "25% reduction" metric
- Reusable patterns: Promise.allSettled, weighted scoring, dual-format output

**Files Created:**
- `solutions/security-audit-repos/src/index.ts` (library API)
- `solutions/security-audit-repos/src/cli.ts` (CLI entry point)
- `solutions/security-audit-repos/README.md` (docs)
- `solutions/security-audit-repos/package.json`, `tsconfig.json`, `sample.env`

**Next Steps:**
1. Run first baseline audit on production repos
2. Store output in `generated/security-audit/{timestamp}-audit.json`
3. Add CI job for monthly automated runs
4. Use baseline to measure Phase 2-4 improvements

---

### 7. Solution Test Patterns — Test-First for security-audit-repos (Zoe — 2026-03-05)

**Status:** Implemented

**Context:** Built comprehensive test suite **before** implementation completed using test-first approach.

**Pattern: Test-First for Solution Packages**

When building solution packages that compose github-rest endpoints, write tests first to:
1. Define API contract (function signatures, types, return shapes)
2. Document expected behavior through test cases
3. Establish scoring/aggregation logic requirements
4. Identify edge cases early

**Mock Strategy:**
- **Module-level mocking:** Use `vi.mock('github-rest')` to mock entire imported modules
- **Different from endpoint tests:** Endpoint tests mock `GitHubClient` methods; solution tests mock endpoint modules
- **Realistic responses:** Mock return values match actual GitHub API response shapes

**Test Coverage — 25 Tests Total:**
- **Single repo audit** (6 tests): success, 404 handling, perfect score, error cases, invalid names, metadata failure
- **Scoring algorithm** (9 tests): each penalty type, cumulative deductions, score floor enforcement
- **Multi-repo aggregation** (5 tests): multiple repos, averages, empty list, single repo edge case, sort order
- **Summary generation** (3 tests): string output, key metrics, empty report
- **Type contracts** (2 tests): interface validation, export checks

**Key Test Patterns:**
- Defined precise penalty values as test cases (contract documentation)
- 404 error handling tests for disabled features
- Score floor tests (excessive alerts)
- Mixed feature availability across repos

**Result:** 25/25 tests passing

**Implications:**
- All future solution packages should follow this pattern
- Test files define contracts before implementation begins
- Tests serve as documentation of expected behavior
- Can run tests while implementation in progress

---

### 8. github-rest Endpoint Return Types (Mal — 2026-03-05)

**Status:** Proposed

**Context:** During code review of `solutions/security-audit-repos/`, found three `as any` casts forced by lack of return types on `github-rest` endpoint functions:
- `alerts.listDependabotAlerts()` returns `any`
- `alerts.listCodeScanningAlerts()` returns `any`
- `alerts.listSecretScanningAlerts()` returns `any`
- `alerts.listRepositorySecurityAdvisories()` returns `any`
- `security.getAutomatedSecurityFixes()` returns `any`
- `security.getBranchProtection()` returns `any`

This forces every consumer to either cast with `as any` or work blind. It accumulates with each new solution.

**Decision:**
1. All `alerts.ts` functions must define return types: `DependabotAlert[]`, `CodeScanningAlert[]`, `SecretScanningAlert[]`, `SecurityAdvisory[]`
2. All `security.ts` functions must define return types: `BranchProtectionRule`, `AutomatedSecurityFixes`, etc.
3. Types defined in `packages/github-rest/src/types/` and re-exported from package index
4. Non-breaking change — adding return types narrows `any` to specific types

**Priority:** Medium — track alongside Phase 2. Not blocking Phase 1 but accumulating tech debt.

**Impact:** All current solutions benefit immediately; future solutions won't need `as any` casts; tests become more precise.

---

### 9. Token Env Var Standardization (Kaylee — 2026-03-05)

**Status:** Implemented

**Context:** Mal's code review flagged that `security-audit-repos` only checked `GITHUB_TOKEN`, while other solutions check both `GH_TOKEN` and `GITHUB_TOKEN`.

**Decision:** Standardize on `GITHUB_TOKEN || GH_TOKEN` (GITHUB_TOKEN primary, GH_TOKEN fallback) for all solution CLI entry points.

**Rationale:** `GITHUB_TOKEN` is the GitHub Actions default. `GH_TOKEN` is the GitHub CLI default. Supporting both reduces developer friction and matches the pattern already used in `get-pr-comments`, `get-user-comments`, and `move-between-repos`.

**Applied to:** `solutions/security-audit-repos/src/cli.ts`

**Future:** New solutions should follow the same dual-check pattern in their CLI entry points.

---

### 10. Squad Guard Allowlist Policy (Mal — 2026-03-05)

**Status:** Implemented

**Context:** The `squad-main-guard.yml` workflow blocked ALL `.squad/` files from reaching `main`, breaking Squad's memory-sharing mechanism between feature branches.

**Decision:** Switch from block-all to allowlist approach:
- **ALLOW on main:** team.md, routing.md, ceremonies.md, decisions.md, agents/*/charter.md, agents/*/history.md, casting/, skills/, templates/, identity/, config.json, plugins/
- **BLOCK from main:** orchestration-log/, log/, decisions/inbox/, sessions/

**Implementation:** Two-layer defense — `.gitignore` prevents accidental commits of noisy files; guard workflow catches anything that slips through. Updated error messages to reflect new policy.

**Rationale:** Knowledge must flow between branches through main. The `merge=union` driver in `.gitattributes` was designed for this — it only works if knowledge files reach main.

---

### 11. Architecture Decision: sample-health-check Solution (Mal — Phase 2, 2026-03-06)

**Status:** Proposed

**Context:** `sample-health-check` (Phase 2) measures **overall repo health** — "is this sample repo well-maintained?" It complements `security-audit-repos` (Phase 1, which measures security posture).

**Solution Overview:**
- **7 health dimensions** with concrete checks: Documentation Quality, Repository Hygiene, CI/CD Presence, Dependency Freshness, Activity & Maintenance, Branch Protection, Azure Sample-Specific
- **100-point additive scoring model** (start at 0, award points for healthy signals)
- **Letter grades:** A (90-100), B (75-89), C (50-74), D (25-49), F (0-24)
- **Dual output:** JSON (structured) + Markdown (human-readable)

**GitHub REST API Endpoints Needed:**
- **Existing (ready to use):** `getRepo`, `getRepoReadme`, `getTopics`, `getDefaultBranch`, `listReleases`, `fetchRepoMetadata`, `getRootContents`, `listRepoWorkflows`, `listWorkflowRuns`, `listDependabotAlerts`, `getBranchProtection`, `getAutomatedSecurityFixes`
- **New endpoints required (Kaylee):**
  - `repos.getCommunityProfile()` — `GET /repos/{owner}/{repo}/community/profile` — returns LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, README presence in one call
  - `actions.getLatestWorkflowRun()` — convenience wrapper for most recent run status

**Implementation Order:**
1. Kaylee: Add 2 new endpoints to `github-rest` with tests
2. Wash/Zoe: Build `scoring.ts` + `checks.ts` (pure functions, test-first)
3. Wash: Build `index.ts` orchestration (composes github-rest calls + checks)
4. Wash: Build `cli.ts` (follows security-audit-repos pattern)
5. Zoe: Full test suite

**Decision:** Build `sample-health-check` following patterns above. Uses almost entirely existing github-rest endpoints (only 2 additions needed). Approved for implementation.

---

### 12. Health-Check Endpoint Audit Report (Kaylee — 2026-03-05)

**Status:** Completed

**Scope:** Audit `packages/github-rest` for `sample-health-check` solution readiness.

**Findings:**
- **Repository Metadata:** ✅ READY — all metadata needs covered (README, topics, description, language, default branch, visibility)
- **Community Health:** ❌ BLOCKED — missing `getCommunityProfile()` endpoint (single API call provides LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, README presence)
- **CI/CD Presence:** ✅ READY — `listRepoWorkflows`, `listWorkflowRuns`, `listAllRepoActionRuns` available
- **Dependency Health:** ✅ MOSTLY READY — Dependabot alerts covered; SBOM/dependency-graph is nice-to-have
- **Activity Signals:** ✅ MOSTLY READY — commits count, PR count, issues, releases available; detailed `listCommits()` is optional
- **Branch Protection:** ✅ READY — fully covered with no new endpoints needed
- **File Existence Checks:** ✅ USABLE BUT AWKWARD — `getContents()` works but needs try/catch wrappers; adding convenience helpers improves solution code

**Build Priority for Kaylee:**
- **P0 (blocking):** `getCommunityProfile()`, `fileExists()`, `getDecodedFileContent()`
- **P1 (nice-to-have):** `listCommits()`, `getDependencyGraphSBOM()`, `getLicense()`
- **Already available:** 40+ functions across 10 modules (no work needed)

**Estimated effort:** ~1 hour for P0 functions. Wash can start building health-check solution immediately using existing endpoints; Kaylee adds P0s in parallel.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- Decisions merged from inbox 2026-03-06 (Mal sample-health-check + Kaylee audit)
