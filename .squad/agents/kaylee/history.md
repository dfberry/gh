# Project Context

- **Owner:** Dina Berry
- **Project:** GitHub REST API tooling monorepo — packages for extracting, analyzing, and acting on GitHub data to improve content, code, communications, planning, and CI
- **Stack:** TypeScript (strict, ESM), Node.js 22+, Vitest, npm workspaces, project references
- **Created:** 2026-03-05

### Key Packages

- `packages/github-rest` — Shared REST client with endpoint wrappers, pagination, permissions. This is the foundation package all other code depends on.
- `packages/gh-cleanup` — CLI with commands: gather, evaluate, change, remove-forks, archive-stale-repos, delete-empty-repos, categorize-repos, summary, describe-repo, describe-repos, evaluate-actions, branch-protection, collaborators, repo-secrets
- `packages/llm-completion` — LLM integration for AI-driven repo descriptions/topics
- Command convention: CLI → `runCommand(name, argv, client?)` → module wrapper `(argv, client?)` → implementation `(client?, args)`
- DRY: code built once in packages, composed in solutions

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-03-05 — Code Review Nits: Extract getDefaultBranch + Token Standardization

**From Mal's code review of security-audit-repos:**
- **M1 (DRY):** `security-audit-repos/src/index.ts` calls `repos.getRepo()` just to extract `default_branch` — should extract dedicated `getDefaultBranch(client, owner, repo)` helper and move to `packages/github-rest/src/endpoints/repos.ts`, then export from index
- **m1 (Token env var):** `solutions/security-audit-repos/sample.env` uses `GITHUB_TOKEN`; standardize across all solutions (this is the right choice, already established in gh-cleanup)

**Task Status:** IN_PROGRESS (Kaylee fixing M1 + m1)
- Extract `getDefaultBranch` from repos.ts pattern and add to index.ts exports
- Update security-audit-repos to use new helper
- Verify tests still pass

**Tech Debt Filed:**
- M2: alerts/security endpoint return types — proposed in `.squad/decisions.md` for Phase 2+ evaluation (Medium priority)

### 2026-03-05 — Deep Technical Audit for Security SMART Goal

**Audit scope:** Full read of `packages/github-rest/src/` (10 endpoint files, core client, types, pagination), `packages/llm-completion/src/` (1 module), and all `packages/gh-cleanup/src/commands/` (16 commands).

**Key findings:**
- `github-rest` already wraps 40+ functions across 10 endpoint files covering repos, actions, alerts, security, permissions, PRs, user, orgs.
- Security alerts (Dependabot, code-scanning, secret-scanning, advisories) already have LIST endpoints wrapped in `alerts.ts` — but no individual GET or PATCH.
- **BUG:** `permissions.ts:16` — `getBranchProtection` calls itself recursively instead of delegating to `security.getBranchProtection`. This is an infinite loop.
- No `issues.ts` endpoint module exists — cannot create/list/update issues, which is required for auto-creating work items.
- No `commits.ts` endpoint module — cannot list commits, get diffs, or compare branches for change analysis.
- No `trees.ts` — cannot recursively enumerate repo file trees for full scanning.
- `llm-completion` exports only `callOpenAI(prompt, cfg, opts)` — single user message, no system prompt, no structured output types. Security analysis needs system prompts and structured analyzers.
- `gh-cleanup` has strong patterns for gather→evaluate→change commands, with shared libs (`describe-common.ts`, `categorizer.ts`, `github-rest-wrapper.ts`). New security commands should follow the same `parseArgs / runCommand / writeOutput / xyzCommand` pattern.
- The `describe-repo` + `describe-common.ts` + `describe-validator.ts` pattern is the template for LLM-based analysis commands.
- `getContents` exists in `repos.ts` but does NOT auto-decode base64 content — a `getDecodedFileContent` helper is needed.

**Decision output:** Wrote `.squad/decisions/inbox/kaylee-api-capabilities.md` with full endpoint inventory, gap analysis, ~45 proposed functions, and priority rankings.

### 2026-03-05 — Cross-Agent Context (Mal & Wash)

**From Mal (Lead):**
- Proposed 6 new solutions in priority order: security-audit-repos (P0), sample-health-check (P0), create-remediation-issues (P1), pr-feedback-aggregator (P1), azure-best-practices-check (P2), sample-auto-fix (P2)
- Measurement framework: monthly security-audit runs; baseline and tracking in `generated/security-audit/{timestamp}.json`
- 4-phase rollout over 8 weeks: Phase 1 requires github-rest fixes and security-audit-repos as baseline
- Key blocking gaps: alerts/contents/orgs not exported; no issues.ts; no issue-labeling endpoint

**From Wash (Solutions Dev):**
- Solution composition pattern established: `src/index.ts` + `src/cli.ts` + optional `prompts/`
- Reusable skills to extract: bot filtering, importance scoring (from get-instruction-from-pr-comments)
- All 5 new solutions blocked by github-rest changes: must add issues.ts, extend alerts.ts, add git.ts for auto-fix
- Clone + branch + PR pattern from move-between-repos is template for sample-auto-fix
- Output file naming: `{owner}-{repo}-{context}.{ext}`; deps via `file:` references

### 2026-03-05 — Phase 1 Fixes: Unblock security-audit-repos

**Fix 1 — `permissions.ts:16` recursive bomb:**
- `getBranchProtection` was calling itself → infinite stack overflow. Fixed to call `client.get(/repos/{owner}/{repo}/branches/{branch}/protection)` directly.
- Removed unused `security` import since the fix makes the direct API call rather than delegating.

**Fix 2 — Missing exports in `index.ts`:**
- Added namespace exports: `alerts`, `contents`, `orgs` — all three modules were implemented but invisible to consumers.
- Also fixed `orgs.ts` import path: was `'src/index.js'` (broken circular), changed to `'../core/client.js'`.

**Fix 3 — New `issues.ts` endpoint module:**
- Created `packages/github-rest/src/endpoints/issues.ts` with 7 functions: `createIssue`, `listIssues`, `getIssue`, `updateIssue`, `addLabelsToIssue`, `createLabel`, `listLabels`.
- Full TypeScript interfaces: `GitHubIssue`, `GitHubLabel`, `CreateIssueOptions`, `UpdateIssueOptions`, `ListIssuesOptions`.
- Follows existing patterns: `import type` for client, `client.get/post/patch`, named exports only, `.js` ESM extensions.
- Added `export * as issues from './endpoints/issues.js'` to `index.ts`.

**Build verified:** `npm run build` passes with zero errors.

**Key files touched:**
- `packages/github-rest/src/endpoints/permissions.ts` (bug fix)
- `packages/github-rest/src/endpoints/orgs.ts` (import fix)
- `packages/github-rest/src/endpoints/issues.ts` (new)
- `packages/github-rest/src/index.ts` (4 new exports)

**Cross-Agent Update (Zoe — Tester):**
- Zoe wrote 35 comprehensive tests across 3 test files: `permissions.test.ts` (6 tests), `issues.test.ts` (18 tests), `index.test.ts` (11 tests)
- **All tests passing: 35/35 ✅**
- Vitest infrastructure bootstrapped with mock pattern for GitHubClient
- Key learnings: branch encoding (`feature/test` → `feature%2Ftest`), namespace exports require `export * as foo from ...` + typeof checks, module graph (permissions → repos + security) requires mock layering
- Canonical mock shape documented: all GitHubClient methods as `vi.fn()` cast as unknown as GitHubClient
