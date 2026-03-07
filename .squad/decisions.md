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

**Status:** In Progress (actions.ts, contents.ts done; alerts.ts, security.ts next)

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

### 13. Enforce Strict Types in github-rest (Mal — 2026-03-06)

**Status:** Accepted

**Context:** During code review of `sample-health-check`, found widespread `as any` casts forced by lack of return types in `github-rest`.

**Decision:**
1. `github-rest` must export complete types for all entities it returns (`Repository`, `WorkflowRun`, `CommunityProfile`, etc.)
2. Solutions must not use `as any` for API responses — if a field is missing, the type must be updated
3. Endpoints must explicitly return typed Promises (e.g., `Promise<Repository>`), not `Promise<any>`

**Consequences:**
- **Immediate:** sample-health-check rejected until types are fixed
- **Long-term:** Cleaner, safer code in solutions; less runtime debugging of "undefined" fields
- **Action:** Zoe assigned to add types to actions.ts + contents.ts; Kaylee removes as-any casts from sample-health-check

**Implementation Status:**
- ✅ Zoe completed: 6 new interfaces (Workflow, WorkflowRun, WorkflowsResponse, WorkflowRunsResponse, ContentItem, ContentFile)
- ✅ Kaylee completed: removed 8 `as any` casts from sample-health-check; created 3 local bridge interfaces for still-untyped endpoints
- ⏳ Next phase: types for alerts.ts, security.ts (per Decision #8 roadmap)

---

### 14. Local Type Bridges for Untyped github-rest Returns (Kaylee — 2026-03-06)

**Status:** Accepted

**Context:** While eliminating `as any` casts, three github-rest endpoints return `unknown`: `listDependabotAlerts`, `getAutomatedSecurityFixes`, `getBranchProtection`. Additionally, `Repository` type is missing fields like `description` and `open_issues_count`.

**Decision:**

**Short term:** Solutions create minimal local interfaces (`DependabotAlert`, `AutomatedSecurityFixesResponse`, `RepoData`) that type only the fields they access. Eliminates `as any` without blocking on github-rest type completeness.

**Medium term (tech debt):** Replace local types once github-rest endpoints get proper return types (Decision #8). When complete, solutions delete local interfaces and import from github-rest directly.

**Implications:**
- All new solutions should follow this pattern: create local minimal interfaces rather than using `as any` for untyped returns
- When github-rest adds types for alerts/security endpoints, grep across solutions and replace local bridges
- Add `description` and `open_issues_count` to `Repository` type (non-breaking) to eliminate RepoData bridges

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


### 15. Code Review Gate Process Automation (User Directive — 2026-03-06)

**Captured from:** Copilot implementation directive

**Decision:** Code reviews and fixes must be part of the team's standard process — automatic after every implementation batch, not on-demand. Review gate now runs automatically after implementation phases, with lead review, lockout routing, and re-review loops until approved.

**Impact:** 
- Standardizes code quality gates as part of workflow
- Removes on-demand overhead
- Establishes consistent review expectations across all implementation work

---

### 16. Architecture Decision: create-remediation-issues Solution (Mal — 2026-03-06)

**Status:** Implemented

**Context:** Phase 3 solution that converts findings from security-audit-repos and sample-health-check into actionable GitHub Issues, closing the automation feedback loop.

**Key Architectural Decisions:**

1. **Solutions must not depend on sibling solutions** — Input report types defined locally in `src/types.ts` as structural copies of upstream shapes. No `file:` references between `solutions/*` directories. Solutions depend on packages, not on each other.

2. **Deterministic title-based deduplication** — Title format `[remediation] {source}: {owner}/{repo} — {signal_title}` is the dedup anchor. Before creating, list open issues with `remediation` label and match title prefix + `finding.signal` key. Simple, no external state needed.

3. **Per-repo issue creation by default** — Issues land in the repo they describe. `--target-repo` flag enables central tracking repo for orgs that prefer a single board. Per-repo keeps issues close to the code that needs fixing.

4. **8-label strategy** — `remediation` (all), `security`/`health` (source), `severity:{critical,high,medium,low}` (priority), `automated` (provenance). Labels provisioned idempotently via `ensureLabels()`.

5. **Three-file separation** — `findings.ts` (pure extraction, no API), `templates.ts` (pure string formatting), `labels.ts` (constants + provisioning). Orchestration in `index.ts`. Same pattern as health-check's checks/scoring split.

6. **Two-mode operation** — `--dry-run` outputs a JSON preview of what would be created (including dedup skip reasons). Live run outputs same structure with `issueUrl`/`issueNumber` for created issues.

7. **1 issue per unique signal per repo** — No mega-issues. A repo with 3 distinct problems gets 3 focused, actionable issues. Keeps triage clean.

**Upstream dependencies:**
- `github-rest/issues.ts` — fully implemented: `createIssue`, `listIssues`, `updateIssue`, `addLabelsToIssue`, `createLabel`, `listLabels`
- `security-audit-repos` — `SecurityAuditReport` shape with per-repo `RepoSecurityAudit` (score, alert counts, branch protection)
- `sample-health-check` — `HealthCheckReport` shape with per-repo `RepoHealthCheck` (score, grade, checks[], dimensions)

**Scope boundaries (v1 does NOT):**
- Close issues when findings resolve (v2)
- Assign issues (v2 — `--assignee` flag)
- Update existing issues with comments on re-run (v2)
- Create PRs — that's `sample-auto-fix` (P2)

**API budget:** ~4 calls per finding (dedup + create + label ops). For 10 repos × 3 findings = ~40 calls. No rate limit concern.

**Files affected:** `solutions/create-remediation-issues/src/index.ts`, `cli.ts`, `types.ts`, `README.md`

---

### 17. Test Contracts: create-remediation-issues (Zoe — 2026-03-06)

**Status:** Implemented (75 tests)

**Context:** Wrote test-first suite for `create-remediation-issues` solution. The tests define the behavioral contracts that implementation must satisfy.

**Decisions Embedded in Tests:**

1. **Severity classification:**
   - Critical dependabot alerts + secret scanning → `critical` severity
   - High dependabot + code scanning → `high` severity
   - Missing branch protection → `medium` severity
   - Automated security fixes disabled → `low` severity

2. **Default thresholds:**
   - Security score threshold: 70 (repos below this get issues)
   - Health grade threshold: 'D' (repos with D or F get issues; A/B/C are fine)

3. **Deduplication strategy:**
   - Match by exact title against open issues only
   - Closed issues are not duplicates (re-create allowed)
   - On API error during dedup check, treat as no duplicates (create anyway)

4. **Labeling convention:**
   - All issues: `automated-remediation` label
   - Security issues: additional `security` label
   - Health issues: additional `health` label
   - Extra labels passable via `--extra-labels`

5. **Issue title format:** `[Source] owner/repo: Description`

6. **Input architecture:** Solutions consume JSON files, not module imports. Types defined locally in `types.ts` mirroring upstream output shapes.

**Test Coverage (75 total):**
- index.test.ts: 61 tests (findings analysis, deduplication, formatting, orchestration, edge cases)
- cli.test.ts: 14 tests (argument parsing, file I/O, option passthrough)

**Test Status:** ✅ 75/75 passing

---

### 18. Implementation Decision: create-remediation-issues (Wash — 2026-03-06)

**Status:** Implemented

**Context:** Built full `solutions/create-remediation-issues/` solution from test contracts. All 75 tests passing.

**Key Decisions:**

1. **Two-Tier Threshold Model** — Signal-based findings (dependabot alerts, code/secret scanning, branch protection, auto-fix) fire for **every repo** regardless of security score threshold. Score-based findings only fire when `score < threshold` AND no signal-based findings exist for that repo.
   - **Rationale:** Avoids noisy duplicates. If a repo has 5 critical dependabot alerts AND a low score, the specific alerts are more actionable than a generic "low score" issue. The score-based finding acts as a catch-all for repos that are unhealthy but don't trigger any specific signal.

2. **Exact Title Deduplication** — Deduplication matches by exact title string against open issues with the `automated-remediation` label. Closed issues are ignored. API errors fail-open (create the issue anyway rather than silently skip).
   - **Rationale:** Title format is deterministic (`[{Source}] owner/repo: description`), making exact matching reliable. Fail-open is safer than fail-closed — an extra issue is better than a missed one.

3. **Severity Mapping (Tests > Spec)** — Several severity values in the implementation differ from Mal's architecture doc because the test contracts (written by Zoe) specify different values:

   | Finding | Mal Spec | Tests/Implementation |
   |---------|----------|---------------------|
   | Branch protection disabled | high | **medium** |
   | Auto security fixes disabled | medium | **low** |
   | Health grade F | critical | **high** |
   | High dependabot threshold | > 3 | **>= 3** |

   **Team note:** Tests are the source of truth. If Mal wants to adjust severities, Zoe's tests should be updated first.

4. **CLI Client Construction** — CLI uses `new GitHubClient({ token })` rather than the `createGitHubClient()` factory. This ensures the client is always a real object (important for test mock compatibility where factory functions return undefined).

**Build Status:** ✅ Clean, zero errors. All 75 tests passing.

**Files created/modified:**
- `solutions/create-remediation-issues/src/index.ts` (432 lines, all functions)
- `solutions/create-remediation-issues/src/cli.ts` (74 lines, CLI orchestration)
- `solutions/create-remediation-issues/src/types.ts` (type contracts)
- `solutions/create-remediation-issues/src/index.test.ts` (61 tests)
- `solutions/create-remediation-issues/src/cli.test.ts` (14 tests)
- `solutions/create-remediation-issues/README.md` (docs)
- `solutions/create-remediation-issues/package.json` (dependencies)
- `solutions/create-remediation-issues/tsconfig.json` (project reference)
- `solutions/create-remediation-issues/sample.env` (token example)

---

### 19. validateToken() Preflight Method on GitHubClient (Kaylee — 2026-03-06)

**Status:** Implemented

**Context:** The pipeline needs a preflight check before running all 4 solutions so it can fail fast with a clear message instead of crashing mid-run on a bad or missing token.

**Decision:** Added alidateToken() as a method on GitHubClient rather than a standalone function. It never throws — always returns a TokenValidationResult object with alid, login, scopes, rror, and suggestion fields.

**Design Choices:**
1. **Never-throw contract:** Callers can safely use const result = await client.validateToken() without try/catch.
2. **Token presence checked first:** If 	his.token is falsy, return immediately without hitting API.
3. **Reuses existing methods:** Internally calls getAuthenticatedUser() and getTokenScopes().
4. **Scopes included in success result:** Enables pipeline to warn about missing scopes without a separate call.

**Impact:** No breaking changes — additive only. Available to all consumers of GitHubClient immediately.

---

### 20. Retry-with-Backoff & 403 Rate Limit Detection (Kaylee — 2026-03-06)

**Status:** Implemented

**Decision:**
1. **Detect 403 rate limits as RateLimitError** — Check for either x-ratelimit-remaining: 0 header OR "rate limit" in body message.
2. **Automatic retry with backoff in awRequest()** — Rate limit errors wait for esetAt, server errors use exponential backoff with jitter. Non-retryable errors thrown immediately.
3. **Default retry options** — { attempts: 3, factor: 2, minTimeoutMs: 1000, maxTimeoutMs: 60000 }.

**Impact:** All solutions get automatic retry for free. Public API surface unchanged.

---

### 21. Surface API Body Messages in All GitHubError Throws (Kaylee — 2026-03-06)

**Status:** Implemented

**Decision:** All GitHubError and RateLimitError throws extract the body's message field. Format: GitHub API error {status}: {body message}.

**Impact:** Pipeline logs show real failure reasons. checkRepoAccess() added as structured accessor returning RepoAccessResult.

---

### 22. Pipeline Repo Accessibility Pre-Check (Wash — 2026-03-09)

**Status:** Implemented

**Decision:** Added pre-check in pipeline Preflight Step 2 that probes each repo with client.checkRepoAccess() before running solutions.

**Behaviors:**
- **Partial access:** Write filtered ccessible-repos.json, continue with accessible repos only
- **No access:** Abort with actionable error messages
- **Graceful fallback:** Skip check with warning if method unavailable

**Impact:** No solution source code modified — only pipeline script.

---

### 23. Actionable Rate Limit Error Messages (Wash — 2026-03-09)

**Status:** Implemented

**Decision:**
1. Solutions check rror.name === 'RateLimitError' and extract reset time, remaining calls, limit
2. Pipeline preflight displays rate limit info with three tiers: info, warning (<100 remaining), hard gate (0 remaining)

---

### 24. Pipeline Error Logging Pattern (Wash — 2026-03-09)

**Status:** Implemented

**Decision:** Each solution's core function collects errors into optional rrors?: PipelineError[] field. CLI writes {step}-errors.log files. Pipeline checks for logs after all steps.

**Key Details:**
- Error categories: auth, not_found, rate_limit, api_error, unknown
- Fail-open: Errors logged but don't stop pipeline
- Error log format: Plain text for quick human scanning
- All 4 solutions affected; 286 tests pass (backward-compatible)

---

### 25. Pipeline Preflight Token Validation is Non-Blocking (Wash — 2026-03-09)

**Status:** Implemented

**Decision:** Preflight token check is **informational only** — warns on invalid tokens but does NOT exit.

**Rationale:** Per-step error logs already capture failures. Early exit would lose diagnostic output. Preflight gives heads-up without changing error-logging contract.

---

### 26. Verbose Logging Pattern for Solutions (Wash — 2026-03-08)

**Status:** Implemented

**Decision:** All solutions support --verbose flag gating progress logging with if (verbose) console.log(...).

**Pattern:**
1. Add erbose?: boolean to options type
2. Gate logging in core functions
3. Show input/output paths and summaries in CLI

**Style:** 2-space indentation, ✓ for success, ⚠ for warnings, '='.repeat(60) for tables.

---

### 27. Architecture Decision: pr-feedback-aggregator Solution (Mal — 2026-03-06)

**Status:** Implemented

**Context:** Phase 3 solution identifying recurring reviewer feedback themes and aggregating into actionable recommendations.

**Data Flow:** GitHub API → fetch PR comments → clean bots → extract patterns (LLM) → aggregate globally → generate recommendations

**Types:**
- FeedbackComment — author, body, created_at, pr_number, repo
- FeedbackPattern — theme, category, frequency, confidence, examples, recommendation
- FeedbackAggregationReport — metadata, global_patterns[], per_repo[], recommendations_summary

**CLI:** --input <file>, --out <dir>, --max-prs, --since, --dry-run, --verbose, --no-markdown

---

### 28. Test Contracts: pr-feedback-aggregator (Zoe — 2026-03-06)

**Status:** Implemented (70 tests)

**Decisions:**
1. **Bot filtering:** Users ending with [bot] filtered before LLM analysis
2. **Comment truncation:** Bodies >10000 chars truncated
3. **LLM response:** { patterns: FeedbackPattern[] } contract; malformed JSON → empty array
4. **Deduplication:** Same theme merged by summing frequencies, sorted by frequency
5. **Dry-run:** Comments fetched but LLM skipped
6. **CLI validation:** --max-prs positive integer, --since parseable date
7. **Token required:** GITHUB_TOKEN must be set

---

### 29. Pipeline Quality Review — Ready for Merge (Mal — 2026-03-07)

**Status:** Approved

**Key Findings:**
- ✅ All 4 solutions produce correct outputs
- ✅ Preflight gating works (token + repo access)
- ✅ Error logs captured for diagnostics
- ✅ Edge cases handled (0 repos, partial access, invalid token)

**Verdict:** ✅ **APPROVE — Ready for PR merge to main**

**Post-merge tasks:**
1. Error log cleanup to pipeline preamble
2. Update repo README with pipeline usage examples
3. Document dry-run behavior
4. Run pipeline with --apply in staging

---
