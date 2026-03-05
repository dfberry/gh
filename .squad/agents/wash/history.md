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

### 2026-03-06 — sample-health-check Phase 2 Complete

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

