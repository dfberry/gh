# Project Context

- **Owner:** Dina Berry
- **Project:** GitHub REST API tooling monorepo — packages for extracting, analyzing, and acting on GitHub data to improve content, code, communications, planning, and CI
- **Stack:** TypeScript (strict, ESM), Node.js 22+, Vitest, npm workspaces, project references
- **Created:** 2026-03-05

### Repo Structure

- `packages/github-rest` — Shared GitHub REST client, pagination, permissions helpers
- `packages/gh-cleanup` — CLI for repo management (gather, evaluate, change pipeline + individual commands)
- `packages/llm-completion` — LLM integration for AI-driven descriptions and analysis
- `solutions/get-pr-comments` — Extract PR comments for analysis
- `solutions/get-user-comments` — Extract user comment history
- `solutions/move-between-repos` — Move content between repositories
- `solutions/get-instruction-from-pr-comments` — Extract actionable instructions from PR feedback
- Philosophy: DRY — build primitives once in packages, compose into end-to-end solutions

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-03-05 — SMART Goal Strategy Analysis

**Architecture gaps found:**
- `alerts.ts` (dependabot, code-scanning, secret-scanning, security advisories) is **implemented but not exported** from `packages/github-rest/src/index.ts`
- `contents.ts` (getRootContents) is **implemented but not exported**
- `orgs.ts` (getUserOrganizations) is **implemented but not exported**
- No `issues.ts` endpoint exists — need `createIssue`, `listIssues`, `updateIssue`, `addLabelsToIssue` for automated work item creation
- Solution pattern: each solution has `src/index.ts` (library), `src/cli.ts` (CLI), optional `prompts/` dir, deps on `github-rest` and/or `llm-completion` via `file:` references

**Key decisions:**
- Proposed 6 new solutions to accelerate SMART goal #1.2 (reduce security/operational issues by 25%)
- Priority order: security-audit-repos → sample-health-check → create-remediation-issues → pr-feedback-aggregator → azure-best-practices-check → sample-auto-fix
- First step before any solution: fix `github-rest` exports and add `issues.ts` endpoint
- Measurement strategy: run security-audit monthly, store baselines in `generated/security-audit/`, track reduction percentage

**User preferences (Dina):**
- Two explicit focus areas: "PR comments → Instruction file" at scale, and "Analyze state of sample → automate changes"
- SMART goal emphasizes Azure MCP Best Practices integration as a detection tool
- Goal timeline: prototype by end of Jan 2025, fully operational Q1 2026
- Decision doc written to `.squad/decisions/inbox/mal-smart-goal-strategy.md`

### 2026-03-05 — Cross-Agent Context (Wash & Kaylee)

**From Wash (Solutions Dev):**
- Solution composition pattern: `src/index.ts` (exported function) + `src/cli.ts` (CLI) + optional `prompts/` directory
- Bot filtering & importance scoring from `get-instruction-from-pr-comments` should be extracted as reusable skill
- All 5 new solutions blocked by github-rest changes: must add `issues.ts`, extend `alerts.ts`, need `git.ts` for auto-fix
- File structure convention: output files `{owner}-{repo}-{context}.{ext}`, dependencies via `file:` references

**From Kaylee (Core Dev):**
- **CRITICAL BUG:** `permissions.ts:16` — `getBranchProtection` calls itself infinitely; must fix to delegate to `security.getBranchProtection`
- Current inventory: 40+ functions; needed: ~45 additional functions across 4 new modules (issues, commits, trees, environments) + extensions to alerts/security/repos
- LLM enhancements needed: structured analyzers (code security, remediation generation, prioritization), system prompt support
- CLI command patterns: 5 new commands following gather/evaluate/change pattern
- `getContents` in repos.ts doesn't auto-decode base64 — needs `getDecodedFileContent` helper

### 2026-03-07 — ALL 6 SMART GOAL SOLUTIONS COMPLETE & PIPELINE INTEGRATED

**Status:** ✅ ALL SMART GOALS DELIVERED (P0-P2 complete)

**Infrastructure delivered:**
1. security-audit-repos (P0) — baseline security posture analysis
2. sample-health-check (P0) — multi-repo health scoring
3. create-remediation-issues (P1) — automated issue creation
4. pr-feedback-aggregator (P1) — cross-PR pattern aggregation
5. azure-best-practices-check (P2) — Azure MCP best practices validation
6. sample-auto-fix (P2) — automated PR-based remediation

**Technical achievements:**
- Designed comprehensive architecture documents for all 6 solutions
- Fixed github-rest bugs (recursive getBranchProtection, circular imports)
- Created issues.ts endpoint module (7 functions, 18 tests)
- Extended github-rest with 35+ endpoint functions (85/85 tests)
- Approved sample-auto-fix architecture with 6-layer safety model
- Coordinated multi-agent delivery with zero cross-cutting issues

**Test coverage:** 250+ tests across all solutions, all passing
**Code quality:** Zero build errors, all ESM conventions followed

**Next phase:** Smoke testing, rate limit monitoring, template refinement, v2 feature planning

### 2026-03-05 — Code Review: security-audit-repos Solution

**Status:** APPROVE with nits

**Scope:** Full architectural review for DRY compliance, package boundaries, pattern consistency, type hygiene, ESM compliance.

**Key findings:**
- ✅ Package boundary discipline solid — uses `github-rest` namespace imports correctly
- ✅ ESM compliance clean — `fs/promises`, `.js` extensions, no sync FS
- ✅ 25/25 tests passing with proper module-level mocking
- ⚠️ DRY violation: `repos.getRepo()` + manual `default_branch` extraction when `repos.getDefaultBranch()` already exists
- ⚠️ Three `as any` casts — one fixable via DRY fix, two from upstream missing return types in github-rest
- ⚠️ Token env var inconsistency — only `GITHUB_TOKEN`, should also check `GH_TOKEN`
- Tech debt tracked: github-rest `alerts.ts`/`security.ts` endpoints lack typed returns

**Architecture note:** `repos.getDefaultBranch()` at `packages/github-rest/src/endpoints/repos.ts:6` is the canonical way to fetch default branch. Solutions must not duplicate this logic.

### 2026-03-06 — Squad Guard Allowlist Policy

**Context:** The `squad-main-guard.yml` workflow blocked ALL `.squad/` files from `main`, breaking Squad's memory-sharing mechanism. Team knowledge (decisions, history, charters, skills) couldn't flow between feature branches through main.

**Changes made:**
1. **Guard workflow** — Switched from "block all `.squad/`" to allowlist: only four noisy runtime dirs are blocked (`orchestration-log/`, `log/`, `decisions/inbox/`, `sessions/`). All other `.squad/` files pass through to main.
2. **`.gitignore`** — Added `.squad/decisions/inbox/` and `.squad/sessions/` to existing ignore rules. Two-layer defense: gitignore + guard.
3. **Error messages** — Updated guard failure output to distinguish blocked runtime state from allowed knowledge files.

**Key architectural insight:** Squad's `merge=union` driver in `.gitattributes` only works if knowledge files actually reach main. Blocking everything defeats the shared-memory design. The correct boundary is knowledge vs. noise, not "all squad files."

**Files allowed on main:** `team.md`, `routing.md`, `ceremonies.md`, `decisions.md`, `agents/*/charter.md`, `agents/*/history.md`, `casting/`, `skills/`, `templates/`, `identity/`, `config.json`, `plugins/`
**Files blocked:** `orchestration-log/`, `log/`, `decisions/inbox/`, `sessions/`

### 2026-03-06 — Architecture Design: sample-health-check

**Status:** Architecture decision written to `.squad/decisions/inbox/mal-sample-health-check.md`

**Key architectural decisions:**

1. **7 health dimensions, 100-point additive scoring** — Unlike security-audit (starts at 100, subtracts), health-check starts at 0 and awards points. Positive framing: "what does this repo do well?" vs "what's broken?"

2. **Minimal github-rest additions** — Only 2 new endpoints needed:
   - `repos.getCommunityProfile()` — single API call returns LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, README presence. Huge efficiency win.
   - `actions.getLatestWorkflowRun()` — convenience wrapper over existing `listWorkflowRuns` with `per_page=1`.

3. **Separation of concerns** — `checks.ts` (pure functions, no API calls), `scoring.ts` (weight constants + grading), `index.ts` (orchestration). Each testable in isolation.

4. **No overlap with security-audit-repos** — Health-check skips code scanning, secret scanning, security advisories. Shares branch protection + Dependabot (viewed through different lenses: security posture vs maintenance freshness).

5. **Community Profile API** — `GET /repos/{owner}/{repo}/community/profile` is the single most valuable endpoint for health checking. One call replaces 5-6 individual file existence checks. Must be added to `github-rest`.

**Implementation dependencies:**
- Kaylee: 2 new github-rest endpoints (blocking)
- Wash: solution implementation (checks.ts → scoring.ts → index.ts → cli.ts)
- Zoe: test suite (test-first, same pattern as security-audit-repos)
- Mal: code review gate

**API budget:** ~8-10 calls per repo. No rate limit concern for current repo set.

### 2026-03-06 — Code Review: sample-health-check Fixes

**Status:** APPROVE

**Scope:** Re-review of type safety fixes in `github-rest` and `sample-health-check`.

**Findings:**
- ✅ `sample-health-check` now has 0 `as any` casts.
- ✅ `actions.ts` and `contents.ts` in `github-rest` are fully typed.
- ✅ Tests pass (52 in github-rest, 116 in sample-health-check).
- ⚠️ `repos.ts` still contains 6 `as any` casts and `Repository` type is missing standard fields (`description`, `open_issues_count`). This tech debt is tracked for future cleanup but does not block this release.

### 2026-03-06 — Architecture Design: create-remediation-issues (P1)

**Status:** Architecture decision written to `.squad/decisions/inbox/mal-create-remediation-issues.md`

**Key architectural decisions:**

1. **Solutions must not depend on sibling solutions** — Input report types are defined locally in `src/types.ts` as structural copies of upstream shapes. No `file:` references between `solutions/*` directories. Solutions depend on packages, not on each other.

2. **Deterministic title-based deduplication** — Title format `[remediation] {source}: {owner}/{repo} — {signal_title}` is the dedup anchor. Before creating, list open issues with `remediation` label and match title prefix + `finding.signal` key. Simple, no external state needed.

3. **Per-repo issue creation by default** — Issues land in the repo they describe. `--target-repo` flag enables central tracking repo for orgs that prefer a single board. Per-repo keeps issues close to the code that needs fixing.

4. **8-label strategy** — `remediation` (all), `security`/`health` (source), `severity:{critical,high,medium,low}` (priority), `automated` (provenance). Labels are provisioned idempotently via `ensureLabels()`.

5. **Three-file separation** — `findings.ts` (pure extraction, no API), `templates.ts` (pure string formatting), `labels.ts` (constants + provisioning). Orchestration in `index.ts`. Same pattern as health-check's checks/scoring split.

6. **Two-mode operation** — `--dry-run` outputs a JSON preview of what would be created (including dedup skip reasons). Live run outputs same structure with `issueUrl`/`issueNumber` for created issues.

7. **1 issue per unique signal per repo** — No mega-issues. A repo with 3 distinct problems gets 3 focused, actionable issues. Keeps triage clean.

**Upstream dependencies:**
- `github-rest/issues.ts` — fully implemented: `createIssue`, `listIssues`, `createLabel`, `listLabels`, `updateIssue`, `addLabelsToIssue`
- `security-audit-repos` — `SecurityAuditReport` shape with per-repo `RepoSecurityAudit` (score, alert counts, branch protection)
- `sample-health-check` — `HealthCheckReport` shape with per-repo `RepoHealthCheck` (score, grade, checks[], dimensions)

**Scope boundaries (v1 does NOT):**
- Close issues when findings resolve (v2)
- Assign issues (v2 — `--assignee` flag)
- Update existing issues with comments on re-run (v2)
- Create PRs — that's `sample-auto-fix` (P2)

**API budget:** ~4 calls per finding (dedup + create + label ops). For 10 repos × 3 findings = ~40 calls. No rate limit concern.

### 2026-03-06 — Architecture Design: pr-feedback-aggregator (P1)

**Status:** Architecture decision written to `.squad/decisions/inbox/mal-pr-feedback-aggregator.md`

**Key architectural decisions:**

1. **Data flow:** GitHub API → fetch PR comments → extract themes (LLM) → aggregate across repos → output report + markdown

2. **Three-function core design** (`src/index.ts`):
   - `fetchPRFeedback()` — Per-PR comment gather + bot filtering (pure, testable)
   - `extractPatternsFromComments()` — LLM theme extraction (per repo)
   - `aggregatePatterns()` — Cross-repo deduplication + ranking
   - Main entry point: `aggregatePRFeedback()` orchestrates all three

3. **LLM Integration Strategy:**
   - Per-repo extraction: 1 LLM call per repo (batch all comments for that repo)
   - System prompt: "Identify recurring themes in reviewer feedback"
   - User prompt: Template with {N} comments from {M} PRs; return JSON patterns with theme, category, confidence, examples, recommendation
   - Optional cross-repo deduplication call (can be template-based string matching instead)

4. **CLI flags:** `--input`, `--out`, `--max-prs` (default 50), `--since`, `--dry-run`, `--verbose`, `--no-markdown`, `--model`

5. **Type hierarchy:**
   - `FeedbackComment` — Cleaned PR comment (author, body, created_at, pr_number, repo)
   - `FeedbackPattern` — Identified theme (theme, category, confidence 0-100, examples, recommendation)
   - `RepoFeedbackSummary` — Per-repo breakdown (total_prs_analyzed, patterns[])
   - `FeedbackAggregationReport` — Global report (global_patterns, per_repo[], recommendations_summary as markdown)

6. **Bot filtering:** Inherit pattern from `get-instruction-from-pr-comments` (known bot list + heuristics like [bot], -bot suffix)

7. **GitHub REST endpoints used:**
   - `pullRequests.listPullRequests(client, owner, repo, options)` — fetch recent PRs with limit + date filter
   - `pullRequests.getPullRequestComments(client, owner, repo, prNumber)` — returns `{ issueComments, reviewComments }`

8. **No upstream solution dependencies** — Input types (repo shape) defined locally in `src/types.ts`. This solution will NOT consume security-audit or health-check reports; it builds from raw PR comments.

**Scope boundaries (v1):**
- ✅ Comment fetch + LLM theme extraction + cross-repo aggregation
- ✅ Per-repo breakdown + global patterns + recommendations markdown
- ✅ Confidence scoring (0-100 from LLM)
- ✅ Date filtering (--since)
- ✅ Dry-run mode
- ❌ Historical trend tracking (v2)
- ❌ Per-author profiles (v2)
- ❌ Integration with create-remediation-issues (v3 — separate concern)

**API budget:** ~52 GitHub API calls per repo (1 list + 50 comment fetches) + 1 LLM call per repo. For 10 repos = ~520 GitHub calls + 10 LLM calls. Well within limits.

**Next steps:** Wash (Solutions Dev) will implement. Blocking on nothing — all github-rest endpoints already exist and exported.

### 2026-03-07 — Pipeline Architecture Review: Production-Ready

**Status:** ✅ APPROVE — Branch `diberry/pr-feedback-aggregator` ready for merge to main

**Scope:** Full architectural review of `scripts/run-pipeline.mjs` + outputs from 4-step pipeline (security-audit → health-check → create-remediation-issues → pr-feedback-aggregator)

**Key findings:**

1. **Preflight gating architecture is robust** — Two-layer defense:
   - Layer 1: Token validation (checks validity, scopes, rate limit) — hard gate, exits on failure
   - Layer 2: Repo access filtering (tests each repo, filters inaccessible) — graceful degradation, continues with accessible subset
   - Edge case handling: 0 accessible repos → clean exit with explanation; partial access → filtered `accessible-repos.json` passed to all solutions
   - Correctly blocked `Azure-Samples/azure-sdk-for-js-docs` (Microsoft org PAT lifetime policy violation)

2. **Solution outputs are architecturally correct:**
   - `security-audit`: Subtractive scoring (100 - penalties) — correct model for security posture
   - `sample-health-check`: Additive scoring (0 + earned points) — correct inverse model for health assessment
   - `create-remediation-issues`: Dry-run outputs console summary only (no JSON file) — intentional design, document in README
   - `pr-feedback-aggregator`: Dry-run skips LLM calls (0 patterns expected) — correct, avoids expensive external calls

3. **Data flow pattern validated:** Sequential dependencies with `findLatestJson()` discovery:
   - Preflight → filtered repo list
   - Security-audit → timestamped audit JSON
   - Health-check → timestamped health JSON
   - Create-remediation-issues consumes both
   - PR-feedback-aggregator runs independently
   - Pattern is fail-fast: any step failure exits immediately, no cascading failures

4. **Error handling is production-grade:**
   - Hard gates: no token, invalid token, exhausted rate limit, 0 accessible repos → exit 1 with clear fix suggestions
   - Soft warnings: stale error logs → non-blocking (Wash will add cleanup step)
   - Graceful degradation: partial repo access → continue with subset, log blocked repos

5. **Stale error log issue is non-blocking:** Error logs from prior runs (14:40) don't affect current run (15:16). Solutions write fresh logs on each run. Wash is adding cleanup step as hygiene improvement, not a pipeline bug fix.

**Architecture patterns to carry forward:**

- **Two-phase preflight** (validate → filter) prevents wasted API calls to inaccessible resources
- **Timestamped artifact strategy** preserves full run history, enables trend analysis, no overwrite risk
- **Dry-run by default** enforces safe iteration (user must explicitly `--apply` for destructive ops)
- **Console + file output duality** satisfies human workflow (console summaries) and automation needs (JSON artifacts)
- **Sequential fail-fast** over partial success — pipeline integrity matters more than completion

**v2 enhancements identified:**

- Parallel execution: security-audit + health-check have no interdependencies (could halve runtime)
- Resume from checkpoint: re-run from failed step instead of full restart
- Diff mode: compare current run to prior baseline, show deltas
- Observability: per-step duration tracking, API quota remaining, artifact size alerts

**Decision written to:** `.squad/decisions/inbox/mal-pipeline-review.md`

### 2026-03-07 — Architecture Design: azure-best-practices-check (P2)

**Status:** Architecture decision written to `.squad/decisions/inbox/mal-azure-best-practices-architecture.md`

**Key architectural decisions:**

1. **Solution only, no new package** — Azure best practices rules are domain-specific to sample repos, not reusable primitives. Extract to package only if duplication emerges later. MCP tools cannot be called at runtime from Node.js CLI — rules must be embedded as static TypeScript.

2. **15 checks across 5 dimensions** — azure-sdk (package.json analysis), iac (Bicep/Terraform presence & patterns), config (azure.yaml, .env.example), ci-cd (federated auth, current actions), security (no connection strings in source, managed identity docs).

3. **Additive scoring (0→100), same model as health-check** — 5 dimensions with weight budgets totaling 100. Letter grades A/B/C/D/F. CheckResult includes `recommendation` field (new vs existing solutions) for actionable fix suggestions.

4. **Zero new github-rest endpoints** — All required file reading primitives exist: `contents.getDecodedFileContent()`, `contents.getRootContents()`, `contents.fileExists()`. Blocked on nothing.

5. **Independent in v1, feeds into remediation in v2** — Runs as Step 5 in pipeline (like pr-feedback-aggregator). v2 extends `create-remediation-issues` with `azureBestPracticesReport?` input and `analyzeAzureBPFindings()`.

6. **Rule source: embedded TypeScript** — Pure functions in `rules.ts`. MCP tools used by developers to research rules, not called at runtime. Maintenance = update rules when Azure best practices change.

7. **API budget: 5-9 calls per repo** — Root contents scan + package.json + IaC files + workflow files + README. ~50-90 calls for 10 repos. No rate limit concern.

**File structure:** `src/index.ts` (orchestrator) + `src/cli.ts` + `src/rules.ts` (15 pure check functions) + `src/scoring.ts` + `src/types.ts`

**Key patterns carried forward:**
- Solutions cannot call MCP tools at runtime — external knowledge must be baked in as static rules
- `contents.getDecodedFileContent()` is the workhorse for file-based analysis solutions
- CheckResult with `recommendation` field is a pattern worth adopting in health-check v2
- No cross-solution imports — report shapes defined locally in consuming solution's types.ts

### 2026-03-07 — Architecture Design: sample-auto-fix (P2 SMART Goal #6)

**Status:** Architecture decision written to `.squad/decisions/inbox/mal-sample-auto-fix-architecture.md`

**Key architectural decisions:**

1. **Capstone solution architecture** — sample-auto-fix is the final solution in the SMART Goal strategy, closing the automation loop: detect → track → **fix automatically**. Highest impact and highest risk because it performs destructive operations (branches, commits, PRs) on target repos at scale.

2. **CRITICAL github-rest gaps (BLOCKING)** — sample-auto-fix requires 3 new/extended modules:
   - **NEW: `git.ts`** — getRef, createRef, deleteRef (branch creation/management)
   - **EXTEND: `contents.ts`** — createOrUpdateFile, deleteFile, encodeContent helper (file writes)
   - **EXTEND: `repos.ts`** — getDefaultBranchSHA, findPRByBranch (convenience wrappers for dedup)
   - Estimated effort: 4-6 hours (Kaylee, P0 blocking)

3. **v1 fix categories: security + Azure config only** — Start with safe, idempotent, low-conflict fixes:
   - Category 1 (P0): Missing security files (SECURITY.md, .env.example, dependabot.yml)
   - Category 2 (P1): Missing Azure config (azure.yaml, .azure/ structure)
   - **DEFER to v2:** CI/CD workflow updates (conflict risk), documentation improvements (complex merge logic), code-level fixes (requires AST + testing)

4. **Safety model: 6 layers of defense** — This solution writes to production repos; every guardrail must be in place:
   - **Dry-run by default** (explicit `--apply` required)
   - **Confirmation gate** (optional `--interactive` flag shows summary + prompt)
   - **Deduplication** (check for existing autofix/* PRs before creating)
   - **Fork detection** (never write to forks, skip with message)
   - **Per-repo error recovery** (partial success acceptable, don't fail entire pipeline)
   - **Rate limit awareness** (preflight check, abort if <100 remaining)

5. **Pipeline integration: Step 6** — Consumes 4 upstream reports (remediation-issues, security-audit, health-check, azure-best-practices) and outputs JSON with created PRs, skipped repos, errors. Inherits `--apply` flag from pipeline.

6. **File structure: parser → planner → executor separation** — Pure functions for parsing/planning (testable without mocks), orchestration layer for API calls (executor.ts with mocked github-rest in tests). Templates are static data in `templates/` directory (no logic, just strings with placeholders).

7. **API budget: ~8 calls per repo** — getRepo (fork check) + listPullRequests (dedup) + getRef (SHA) + createRef (branch) + 3× createOrUpdateFile (files) + createPullRequest (PR) = 8 calls × 50 repos = 400 calls. Well within 5000/hour limit.

8. **v2 enhancements deferred:**
   - Intelligent merge strategies (append to existing files vs overwrite)
   - LLM-assisted code fixes (hardcoded secrets, deprecated APIs)
   - Issue lifecycle management (auto-close issues when PR merges)
   - Batch processing optimizations (parallel repo processing)
   - Rollback support (delete branches, close PRs if fix breaks CI)

**Critical architectural insights:**

- **Git Data API is the missing primitive** — Until now, github-rest only had read operations (repos, alerts, contents.getFile). sample-auto-fix requires write operations (branch creation, file updates, PR creation). `git.ts` is the foundational module; without it, no automated remediation is possible.

- **Base64 encoding is GitHub API contract** — Contents API requires base64-encoded file content for writes. Must provide `encodeContent(string): string` helper to avoid repetitive Buffer conversions in solution code.

- **Deduplication by branch pattern is simpler than issue tracking** — Instead of tracking "did we already create an issue for this finding?", check "does an open PR from `autofix/{category}-*` already exist?". Leverages GitHub's native PR/branch state, no external database needed.

- **Fork detection is non-negotiable** — Auto-fixing forks would create PRs against user-owned repos we don't control. Even with dry-run, the conceptual violation is dangerous. Hard gate: if `repo.fork === true`, skip immediately.

- **Per-repo failure isolation prevents cascade failures** — If repo #5 hits a 403, don't abort the pipeline. Log the error, continue to repo #6. Final JSON includes `errors[]` array for manual review. Partial automation is better than zero automation.

- **Templates must be pure data, not functions** — Resist the temptation to make templates "smart" (e.g., LLM-generated content). v1 uses static string templates with placeholder substitution. If a template needs logic, that's a signal to defer to v2 or make it a separate category.

**Measurement strategy:**

- Track PRs created per run (goal: 10+ per run for 50-repo corpus)
- Track PR merge rate (goal: 70%+ merged within 7 days)
- Track categories (which fixes are most valuable? security files vs Azure config vs CI/CD?)
- Track errors (which error categories dominate? auth? rate limits? conflict detection?)

**Next steps:** Kaylee builds github-rest endpoints (P0 blocking). Wash implements solution after endpoints ready. Zoe writes tests. Mal reviews + smoke tests in staging repos. Target: End of week for v1 completion.
