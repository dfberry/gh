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
