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
- All solutions compose from `packages/github-rest` and `packages/llm-completion`
- Philosophy: DRY — solutions are thin orchestrations, heavy lifting in packages

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

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
