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

### 2026-07-21 — Dry-Run Markdown Enhancement Pattern

**Task:** Enhanced all three pipeline dry-run markdown reports to show "what would happen" details instead of bare summary counts.

**Pattern established — every dry-run markdown must include:**
1. `> 🔒 **DRY RUN** — No changes were made.` blockquote near the top
2. A "What Would Happen" section with detailed planned actions (issue bodies, PR titles, template previews)
3. A "How to Apply" section at the bottom with the exact command

**Files changed:**
- `solutions/create-remediation-issues/src/cli.ts` — `generateRemediationSummary()` now renders full issue details (body preview, labels, severity table) in dry-run, plus how-to-apply footer
- `solutions/pr-feedback-aggregator/src/types.ts` — Added `dryRun?: boolean` to `AggregatedReport`, added `PRInfo` type and `prs?` to `RepoFeedbackSummary` for per-PR metadata
- `solutions/pr-feedback-aggregator/src/index.ts` — `generateReport()` now populates `dryRun` flag and per-PR data; `generateMarkdownSummary()` shows "What Would Be Analyzed" table with PR numbers/titles/comment counts in dry-run
- `solutions/sample-auto-fix/src/types.ts` — Added `plans?: FixPlan[]` to `AutoFixResult` (populated in dry-run only)
- `solutions/sample-auto-fix/src/index.ts` — `autoFixFindings()` includes plans in result when dry-run; `generateMarkdownReport()` shows fix plans with categories, branch names, PR titles, and template content previews (first 5 lines)

**Key design decision:** Data for rich dry-run reports was already available in all three solutions — the issue was the markdown generators discarded it. Fix was to thread that data through to the markdown layer (adding `plans` to auto-fix result, `prs` to per-repo summary, `dryRun` flag to report types).

**Verification:**
- Build: ✅ All packages compile cleanly
- Tests: ✅ All existing tests pass (auto-fix: 47/47)
- Pipeline: ✅ Full dry-run pipeline verified clean
- Commit: c5d3376 — "feat: enhance dry-run markdown with actionable what-would-happen details"

### 2026-07-21 — Pipeline Tee Logging & Output Directory Pre-creation

**Task:** Two enhancements to `scripts/run-pipeline.mjs`:
1. **Tee-like logging** — All stdout/stderr output now mirrors to `./generated/pipeline-{ISO-timestamp}.log` while still appearing on the console. Implemented by patching `process.stdout.write`/`process.stderr.write` plus converting `run()` from `execSync` to async `spawn` with piped stdio.
2. **Output directory pre-creation** — Added `STEP_OUTPUT_DIRS` array and `mkdir({recursive: true})` loop before Step 1 so ALL six step directories exist before any step runs. Fixes the Step 6 `sample-auto-fix` crash and prevents similar issues for other steps.

**Key patterns:**
- `createWriteStream` from `node:fs` (streaming, not sync — project-safe)
- `spawn` from `child_process` with `['inherit', 'pipe', 'pipe']` stdio config for real-time streaming + capture
- `process.on('exit', ...)` handler for best-effort log flush on `process.exit(1)` error paths
- Log stream properly closed with `await new Promise(r => logStream.end(r))` on the happy path

**Files:** `scripts/run-pipeline.mjs` (65 insertions, 16 deletions)

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

### 2026-03-07 — sample-auto-fix Endpoints & Integration COMPLETE — ALL SMART GOALS DONE

**Status:** ✅ ALL ENDPOINTS BUILT & VERIFIED (85/85 tests)

**Endpoints delivered:**
- git.ts: getRef, createRef, deleteRef (10 tests)
- contents.ts extended: createOrUpdateFile, deleteFile, encodeContent (18 tests)
- repos.ts extended: getDefaultBranchSHA, findPRByBranch (7 tests)
- Total: 35 new tests across 3 modules + 50 prior tests = 85/85 passing

**Cross-agent integration:**
- **Wash** completed sample-auto-fix solution (47 tests) using all Kaylee endpoints
- **Coordinator** integrated sample-auto-fix into pipeline Step 6
- **All 6 SMART Goal solutions now complete and integrated**

**SMART Goal #1.2 Infrastructure Ready:**
1. security-audit-repos (P0) — baseline security posture ✅
2. sample-health-check (P0) — multi-repo health analysis ✅
3. create-remediation-issues (P1) — automated issue creation ✅
4. pr-feedback-aggregator (P1) — cross-PR pattern analysis ✅
5. azure-best-practices-check (P2) — best practices validation ✅
6. sample-auto-fix (P2) — automated PR-based remediation ✅

**Total test coverage across all solutions:** 250+ tests, all passing, zero build errors

**Next:** Integration testing, smoke runs, rate limit monitoring, v2 planning
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


## Learnings

### 2026-03-07 — Built Git Endpoints + Contents Write Support for sample-auto-fix (P2 SMART Goal #6)

**Context:** Mal's architecture decision for sample-auto-fix requires new GitHub REST endpoints to create branches, commit files, and open PRs for automated remediation workflows. This is the highest-risk solution in the monorepo because it performs write operations on target repos at scale.

**What I built:**

**1. NEW MODULE: packages/github-rest/src/endpoints/git.ts**
- getRef(client, owner, repo, ref) — GET /repos/{owner}/{repo}/git/ref/{ref}
- createRef(client, owner, repo, ref, sha) — POST /repos/{owner}/{repo}/git/refs
- deleteRef(client, owner, repo, ref) — DELETE /repos/{owner}/{repo}/git/refs/{ref}
- Interface: GitRef with ref, node_id, url, object.sha/type/url
- Smart ref path handling: strips 'refs/' prefix for GET/DELETE, requires full 'refs/heads/...' for POST
- Full test coverage in git.test.ts: 10 tests covering success, error propagation (404/409/422)

**2. EXTENDED: packages/github-rest/src/endpoints/contents.ts**
- encodeContent(content: string) — Helper to base64-encode strings for GitHub API
- createOrUpdateFile(client, owner, repo, path, options) — PUT /repos/{owner}/{repo}/contents/{path}
  - Options: message (required), content (auto-encoded), branch?, sha? (for updates)
- deleteFile(client, owner, repo, path, options) — DELETE /repos/{owner}/{repo}/contents/{path}
  - Options: message, sha (required), branch?
- New interfaces: FileCommitResult, GitUser (for commit author/committer)
- Added 18 tests to contents.test.ts covering creates, updates, deletes, nested paths, error handling

**3. EXTENDED: packages/github-rest/src/endpoints/repos.ts**
- getDefaultBranchSHA(client, owner, repo) — Convenience wrapper to get HEAD SHA of default branch
  - Fetches repo metadata, extracts default branch name, queries git ref, returns SHA
- findPRByBranch(client, owner, repo, headBranch) — Check if PR exists for a branch
  - Returns PR number or null; uses listPullRequests with head filter
- Added 7 tests to repos.test.ts covering success cases, fallbacks, custom branches, error propagation

**4. UPDATED: packages/github-rest/src/index.ts**
- Added export * as git from './endpoints/git.js'
- Exported new functions: getDefaultBranchSHA, findPRByBranch, encodeContent, createOrUpdateFile, deleteFile, getRef, createRef, deleteRef
- Exported new types: FileCommitResult, GitUser, GitRef

**Build & Test:** ✅ npm run build zero errors, ✅ 85/85 tests pass (up from 67)

**Key patterns followed:**
- Client-first parameter convention: (client, owner, repo, ...args)
- Error propagation: Let GitHub errors bubble up naturally (404/409/422)
- TypeScript strict: Explicit types for all parameters and return values
- Consistent naming: get*, create*, delete* verbs
- Test coverage: Mock client with vi.fn(), test success + all error paths
- Import discipline: import type for types, .js extensions for ESM

**Why this matters:** These endpoints unblock Mal's sample-auto-fix implementation. The write operations (createRef, createOrUpdateFile) are the foundation for automated PR creation workflows. The convenience wrappers (getDefaultBranchSHA, findPRByBranch) reduce boilerplate in command modules and centralize common patterns.

**Key files touched:**
- packages/github-rest/src/endpoints/git.ts (NEW — 3 functions, 1 interface, 67 LOC)
- packages/github-rest/src/endpoints/git.test.ts (NEW — 10 tests, 157 LOC)
- packages/github-rest/src/endpoints/contents.ts (EXTENDED — +3 functions, +2 interfaces, +108 LOC)
- packages/github-rest/src/endpoints/contents.test.ts (EXTENDED — +18 tests, +228 LOC)
- packages/github-rest/src/endpoints/repos.ts (EXTENDED — +2 convenience wrappers, +44 LOC)
- packages/github-rest/src/endpoints/repos.test.ts (EXTENDED — +7 tests, +120 LOC)
- packages/github-rest/src/index.ts (UPDATED — exports for new modules/functions/types)

### 2026-03-07 — Pipeline Tee Logging & Output Directory Pre-creation

**Task:** Two enhancements to `scripts/run-pipeline.mjs` to fix pipeline reliability and observability.

**Changes:**
1. **Tee logging** — All stdout/stderr output (including child process output) now mirrors to `./generated/pipeline-{ISO-timestamp}.log` while preserving original console output. Implemented by:
   - Converting `run()` from `execSync` (blocking, no output capture) to async `spawn` with piped stdio (`['inherit', 'pipe', 'pipe']`)
   - Patching `process.stdout.write` and `process.stderr.write` to tee to log stream
   - Log stream properly closed on happy path; `process.on('exit')` handler for best-effort flush on error exits

2. **Output directory pre-creation** — All six step output directories now created before Step 1 runs using `mkdir({recursive: true})`. Fixes Step 6 crash (missing `./generated/sample-auto-fix/`) and prevents similar issues for other steps.

**Key patterns:**
- `createWriteStream` from `node:fs` (streaming, not sync — project-safe)
- `spawn` with `['inherit', 'pipe', 'pipe']` stdio config for real-time streaming + capture
- `process.on('exit', ...)` handler for error-path log flush
- `STEP_OUTPUT_DIRS` array documents all output paths; easy to extend

**Verification:**
- Full pipeline runs clean — all 6 steps pass
- Output properly tee'd to timestamped log file
- Windows path bugs resolved (auto-fix CLI entry point)
- Commit: 446d15d

**Files touched:**
- scripts/run-pipeline.mjs (65 insertions, 16 deletions)
- solutions/sample-auto-fix/src/cli.ts (Windows path fix)

### 2026-12-24 — Markdown Output for Preflight and Auto-Fix Stages

**Task:** Added human-readable markdown output for the two pipeline stages that were missing it: Preflight and Sample Auto-Fix (Stage 6). All other stages already produce both JSON + markdown.

**Changes made:**
1. **Preflight (scripts/run-pipeline.mjs):**
   - Added generatePreflightMarkdown(report) function — generates markdown from token validation data
   - Added generateRepoAccessMarkdown(report) function — generates markdown from repo access check results
   - Modified writePreflightLog() to write both JSON and markdown files
   - Modified repo access check to write both JSON and markdown files
   - Output files: {timestamp}-preflight.md and {timestamp}-repo-access.md

2. **Sample Auto-Fix (solutions/sample-auto-fix/):**
   - Added generateMarkdownReport(result: AutoFixResult) function in src/index.ts (exported)
   - Modified src/cli.ts to import and call generateMarkdownReport() alongside JSON write
   - Output file: uto-fix-{timestamp}.md

**Style consistency:**
- Followed existing markdown generator patterns from security-audit-repos, sample-health-check, and zure-best-practices-check
- Used # Title header, ============ separator lines, summary stats at top, per-repo breakdown sections
- Clean table formatting for repo access check

**Verification:**
- Build: ✅ 
pm --prefix solutions/sample-auto-fix run build — compiles cleanly
- Tests: ✅ All 47 tests pass (6 test files)
- Preflight markdown generation is inline in un-pipeline.mjs (no separate package)
- Auto-fix markdown generation is exported from index.ts for reuse/testing

**Key patterns:**
- TypeScript strict mode with template literals for markdown generation
- Async file writes using s/promises
- Additive-only change — existing JSON output preserved exactly as-is
- Named exports only (generateMarkdownReport exported from auto-fix)

**Files:**
- scripts/run-pipeline.mjs (+90 lines) — two markdown generators for preflight stages
- solutions/sample-auto-fix/src/index.ts (+59 lines) — markdown generator function
- solutions/sample-auto-fix/src/cli.ts (+5 lines) — import and invoke markdown generator

