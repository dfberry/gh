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

---

## 2026-03-06 — NPM Script Registration (create-remediation-issues)

**Task:** Added `create-remediation-issues` script to root package.json  
**Pattern:** `"create-remediation-issues": "node --env-file \"./.env\" solutions/create-remediation-issues/dist/cli.js"`  
**Line:** 43  
**Status:** ✅ Complete  
**Notes:** Follows --env-file convention established by security-audit and sample-health-check scripts. Enables root CLI invocation.

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

### 2026-03-05 — Health-Check Endpoint Audit

**Scope:** Full audit of `packages/github-rest` endpoint inventory against `sample-health-check` requirements across 7 categories.

**Key findings:**
- 5 of 7 categories are fully covered by existing endpoints (repo metadata, CI/CD, dependency alerts, activity signals, branch protection)
- 2 categories need small additions: community health (missing `getCommunityProfile`) and file existence (missing `fileExists` + `getDecodedFileContent`)
- Only 3 P0 functions needed before Wash can fully compose the health-check: `getCommunityProfile`, `fileExists`, `getDecodedFileContent` — all trivial wrappers
- `repos.ts` is the largest module (25+ functions); community profile could go there or in a new `community.ts`
- The `contents.ts` module is minimal (only `getRootContents`) — good candidate for `fileExists` and `getDecodedFileContent`
- `listReleases()` works for health-check but lacks pagination params — tech debt, not blocking
- `getRepo()` already returns `license` field — dedicated `getLicense()` endpoint is P2 nice-to-have

**Output:** Wrote `.squad/decisions/inbox/kaylee-health-check-audit.md` with full gap analysis, code samples, priority rankings, and phased recommendation for Wash.

### 2026-03-05 — P0 Health-Check Endpoints Implemented

**Scope:** Added 4 new endpoint functions to `packages/github-rest` to unblock `sample-health-check` solution.

**New Functions:**
1. **`getCommunityProfile(client, owner, repo)`** in `repos.ts` — wraps `GET /repos/{owner}/{repo}/community/profile`, returns typed `CommunityProfile` interface with `health_percentage`, `files` (code_of_conduct, contributing, license, readme, etc.)
2. **`fileExists(client, owner, repo, path)`** in `contents.ts` — convenience wrapper around `getContents()`, returns `boolean` (404 → false, content → true, other errors → throw)
3. **`getDecodedFileContent(client, owner, repo, path)`** in `contents.ts` — decodes base64 file content to UTF-8 string (404 → null, success → string, errors → throw)
4. **`getLatestWorkflowRun(client, owner, repo, workflowId)`** in `actions.ts` — uses `listWorkflowRuns` with per_page=1, returns single run or null

**Also fixed:** `actions.ts` was using value import (`import { GitHubClient }`) instead of type import — changed to `import type { GitHubClient }` to match project convention.

**Exports added to `index.ts`:** `getCommunityProfile`, `CommunityProfile`, `CommunityProfileFiles`, `fileExists`, `getDecodedFileContent`, `getLatestWorkflowRun` — all as named exports plus namespace access through existing `repos`, `contents`, `actions` namespaces.

**Tests written (17 new, 52 total):**
- `repos.test.ts` — 3 tests: community profile success, perfect health score, error propagation
- `contents.test.ts` — 9 tests: fileExists (true, 404→false, non-404 throw, nested paths) + getDecodedFileContent (decode, 404→null, empty content→null, non-404 throw, default encoding fallback)
- `actions.test.ts` — 5 tests: latest run success, no runs→null, missing workflow_runs→null, numeric IDs, error propagation

**Build & Test:** ✅ `npm run build` zero errors, ✅ 52/52 tests pass

**Key files touched:**
- `packages/github-rest/src/endpoints/repos.ts` (added `CommunityProfile` types + `getCommunityProfile`)
- `packages/github-rest/src/endpoints/contents.ts` (added `fileExists` + `getDecodedFileContent`)
- `packages/github-rest/src/endpoints/actions.ts` (added `getLatestWorkflowRun`, fixed import type)
- `packages/github-rest/src/index.ts` (new exports)
- 3 new test files

### 2026-03-05 — Cross-Agent Context (Wash & Zoe)

**From Wash (Solutions Dev):**
- Built full `sample-health-check` solution orchestrating your 4 new endpoints + 8 existing endpoints
- 25 pure check functions across 7 dimensions (Documentation, Hygiene, CI/CD, Dependencies, Activity, Branch Protection, Azure-Specific)
- Graceful degradation via Promise.allSettled; missing features don't fail checks
- Follows security-audit-repos pattern (CLI, dual output format, continue-on-error)
- Ready for production health-check baseline audits

**From Zoe (Tester):**
- Wrote 116 tests for sample-health-check before implementation (test-first pattern)
- All tests use module-level mocking of github-rest, so parallel work unblocked
- 116/116 tests now pass with Wash's implementation
- Your 4 endpoints mocked during tests; live runs will work when endpoints merge

### 2026-03-06 — Eliminated All `as any` Casts in sample-health-check

**Context:** Mal's review rejected sample-health-check due to `as any` casts in production code. Zoe had just added proper types to github-rest (`WorkflowsResponse`, `WorkflowRunsResponse`, `WorkflowRun`, `Workflow`, `ContentItem`, `ContentFile`, `CommunityProfile`). Wash (original author) was locked out per lockout rules.

**Changes to `solutions/sample-health-check/src/index.ts`:**
- Added `import type { CommunityProfile, ContentItem, WorkflowsResponse, WorkflowRun }` from github-rest
- Created 3 local interfaces for shapes not yet typed in github-rest: `RepoData` (extends Repository fields), `DependabotAlert` (severity counting), `AutomatedSecurityFixesResponse` (enabled flag)
- Replaced 8 `as any` casts with proper types:
  - `repoDataResult.value as any` → `as RepoData`
  - `communityProfileResult.value as any` → `as CommunityProfile`
  - `metadataResult.value as any` → removed cast (TypeScript infers `RepoMetadata` from Promise.allSettled tuple)
  - `rootContentsResult.value as any[]` / `(f: any)` → removed casts (TypeScript infers `ContentItem[]`)
  - `workflowsResult.value as any` → `as WorkflowsResponse`
  - `dependabotResult.value as any[]` → `as DependabotAlert[]`
  - `autoFixResult.value as any` → `as AutomatedSecurityFixesResponse`
  - `(run as any).conclusion` → `run.conclusion` (WorkflowRun already has `conclusion` field)

**Also fixed in github-rest (build-blocking):**
- `contents.ts:84` — `Buffer.from` encoding param cast to `BufferEncoding` (pre-existing type error)
- `tsconfig.json` — added `composite: true` (required by project references from sample-health-check)

**Build & Test:** ✅ `npm run build` zero errors, ✅ 116/116 tests pass

**Key files touched:**
- `solutions/sample-health-check/src/index.ts` (type fixes)
- `packages/github-rest/src/endpoints/contents.ts` (BufferEncoding cast)
- `packages/github-rest/tsconfig.json` (composite: true)

### 2026-03-06 — Added `validateToken()` Preflight Check to GitHubClient

**Scope:** New method on `GitHubClient` for pipeline preflight token validation.

**What was added:**
1. **`TokenValidationResult` interface** in `client.ts` — `{ valid, login?, scopes?, error?, suggestion? }`
2. **`validateToken()` method** on `GitHubClient` — never throws, returns structured result:
   - No token → `{ valid: false, error: 'No token provided', suggestion: '...' }`
   - 401 → `{ valid: false, error: 'Token is invalid or expired', suggestion: '...' }`
   - 403 → `{ valid: false, error: 'Token is rate-limited or blocked', suggestion: '...' }`
   - Success → `{ valid: true, login, scopes }`
   - Unexpected error → `{ valid: false, error: message, suggestion: '...' }`
3. **`TokenValidationResult` exported** from `index.ts` via `export type`

**Design decisions:**
- Checks for empty/missing token BEFORE making any API call (fast fail, no wasted request)
- Uses existing `getAuthenticatedUser()` + `getTokenScopes()` internally — no new endpoints
- Catches `GitHubError` specifically to map status codes to friendly messages
- Returns scopes so pipeline can optionally warn about missing permissions

**Build & Test:** ✅ `npm run build` zero errors, ✅ 52/52 existing tests pass (no new tests — Zoe's domain)

**Key files touched:**
- `packages/github-rest/src/core/client.ts` (interface + method)
- `packages/github-rest/src/index.ts` (type export)

### 2026-03-06 — Added `getRateLimit()` + Enriched `validateToken()` with Rate Limit Info

**Scope:** New `getRateLimit()` method on `GitHubClient` and enriched `TokenValidationResult` to include rate limit data for actionable preflight messages.

**What was added:**
1. **`RateLimitInfo` interface** in `client.ts` — `{ limit, remaining, resetAt: Date, used }`
2. **`getRateLimit()` method** on `GitHubClient` — calls `GET /rate_limit` (doesn't count against limits), parses `resources.core`, converts unix timestamp to `Date`. Never throws — returns `undefined` on failure.
3. **`TokenValidationResult.rateLimit?`** — optional `RateLimitInfo` field added to the existing interface.
4. **`validateToken()` updated** — after successful user + scopes fetch, also calls `getRateLimit()` and includes result. If `getRateLimit()` fails, validation still returns valid (rate limit is optional enrichment).
5. **`RateLimitInfo` exported** from `index.ts` via `export type` alongside `TokenValidationResult`.

**Design decisions:**
- `getRateLimit()` returns `Promise<RateLimitInfo | undefined>` (not `Promise<RateLimitInfo>`) — never throws, swallows errors gracefully
- `GET /rate_limit` is special: it does NOT count against the rate limit, safe for preflight
- `resetAt` is a `Date` object (not unix timestamp) for easy formatting like "Resets at 10:45 PM (in 12 min)"
- Rate limit failure in `validateToken()` does not invalidate the token — it's enrichment only

**Build & Test:** ✅ `npm run build` zero errors, ✅ 52/52 existing tests pass (no new tests per task instructions)

**Key files touched:**
- `packages/github-rest/src/core/client.ts` (new interface + method + enriched validateToken)
- `packages/github-rest/src/index.ts` (added `RateLimitInfo` type export)

### 2026-03-06 — Retry-with-Backoff & 403 Rate Limit Detection in GitHubClient

**Scope:** Three changes to `packages/github-rest/src/core/client.ts` to properly detect GitHub 403 rate limits and add automatic retry with backoff.

**Change 1 — Fix 403 rate limit detection:**
- GitHub's primary rate limit returns 403 with `x-ratelimit-remaining: 0`, not 429. These were thrown as generic `GitHubError`, bypassing all rate-limit handling in solutions.
- Also detects secondary rate limits: 403 responses with `"rate limit"` in the JSON body message field.
- Both now correctly throw `RateLimitError` instead of `GitHubError`.

**Change 2 — Retry-with-backoff in rawRequest:**
- Extracted single-attempt fetch logic into private `_singleRequest()` method.
- `rawRequest()` is now a retry wrapper that calls `_singleRequest` in a loop.
- Rate limit errors (429/403): waits for `resetAt` from headers, capped at `maxTimeoutMs` (default 60s).
- Server errors (5xx): exponential backoff with ±20% jitter.
- Non-retryable errors (401, 404, etc.): thrown immediately, no retry.
- Console logs retry attempts with emoji prefix for visibility.

**Change 3 — Default retry options:**
- Constructor now defaults `retry` to `{ attempts: 3, factor: 2, minTimeoutMs: 1000, maxTimeoutMs: 60000 }`.
- Users can disable by passing `retry: { attempts: 1 }`.

**Design decisions:**
- `_singleRequest` is private — public API surface unchanged.
- `get()`, `post()`, `patch()`, `del()` all benefit via `request()` → `rawRequest()` chain.
- Existing tests unaffected: all 52 github-rest tests and all 399 repo-wide tests pass.

**Build & Test:** ✅ `npm run build` zero errors, ✅ 399/399 tests pass

**Key files touched:**
- `packages/github-rest/src/core/client.ts` (all 3 changes)

### 2026-03-06 — Surfaced API Body Messages in All GitHubError Throws + Added checkRepoAccess()

**Context:** User hit a 403 from Microsoft enterprise policy blocking classic PATs with lifetime > 90 days on Azure-Samples org. Error body had the real explanation, but `_singleRequest()` threw `GitHubError('GitHub API error 403')` — completely hiding the body's `message` field.

**Change 1 — Include body message in ALL error throws:**
- In `_singleRequest()`, extract `apiMsg` from the body's `message` field before all three throw sites.
- Generic `GitHubError` now throws: `GitHub API error 403: The 'Microsoft Open Source' enterprise forbids access via...`
- `RateLimitError` for 429/5xx now includes body message if present.
- `RateLimitError` for 403 rate limits: keeps `GitHub API rate limit exceeded` prefix but appends body message.
- Pattern: `apiMsg ? \`GitHub API error ${status}: ${apiMsg}\` : \`GitHub API error ${status}\``

**Change 2 — Added `checkRepoAccess(owner, repo)` method:**
- New `RepoAccessResult` interface: `{ accessible, owner, repo, error?, suggestion? }`
- Never throws — returns structured result with actionable suggestions:
  - 404 → "Repository not found" + check name/access hint
  - 403 with "enterprise" in body → exact body message + "Adjust PAT lifetime or use fine-grained token"
  - 403 generic → body message or "Access forbidden" + check permissions hint
  - Other errors → `HTTP {status}: {message}`
- Uses `this.get()` internally — retry loop correctly doesn't retry 403/404 (only RateLimitErrors are retried)

**Change 3 — Exported `RepoAccessResult` from index.ts:**
- Added `RepoAccessResult` to the `export type` line alongside `TokenValidationResult` and `RateLimitInfo`.

**Test impact:** Zero — all 399 tests pass. Existing endpoint tests mock at the `client.get()` level, not at `fetch`, so the error message changes in `_singleRequest()` don't affect them.

**Build & Test:** ✅ `npm run build` zero errors, ✅ 399/399 tests pass

**Key files touched:**
- `packages/github-rest/src/core/client.ts` (error messages + RepoAccessResult + checkRepoAccess)
- `packages/github-rest/src/index.ts` (RepoAccessResult export)
