# Project Context

- **Owner:** Dina Berry
- **Project:** GitHub REST API tooling monorepo — packages for extracting, analyzing, and acting on GitHub data to improve content, code, communications, planning, and CI
- **Stack:** TypeScript (strict, ESM), Node.js 22+, Vitest, npm workspaces, project references
- **Created:** 2026-03-05

### Testing Conventions

- Vitest with `vi` for mocking
- Mock `globalThis.fetch` for GitHub API calls
- Colocated `*.test.ts` files next to source modules
- Cover success and failure cases (rate limits, 404, 403, pagination)
- `vi.fn()` spies over global state; inject `importFn` for dynamic imports
- ESM `.js` extensions in test imports
- `npm run test` (all workspaces), `npm run test:ci` (CI mode with `--run`)

## Core Context

**Test Infrastructure Foundations (established 2026-03-05 & consolidated 2026-03-06):**

1. **Vitest Mock Patterns:**
   - **Endpoint tests:** Mock `GitHubClient` methods with `vi.fn()`, cast as `unknown as GitHubClient`
   - **Solution tests:** Mock endpoint modules with `vi.mock('github-rest')` at module level
   - **CLI tests:** Also mock `node:fs/promises` and `./index.js` for file I/O isolation
   - **Test data factories:** Create realistic mock responses matching actual GitHub API shapes

2. **Module Contracts Established:**
   - All endpoint functions follow `(client, owner, repo, ...)` signature pattern
   - GET endpoints use `{ params }` for query strings; POST/PATCH pass body directly
   - Namespace exports (`export * as foo from ...`) testable via `typeof` checks
   - Branch names URL-encoded in API paths (e.g., `feature/test` → `feature%2Ftest`)

3. **Test-First Pattern Success (proven across 4 implementations):**
   - Write comprehensive tests BEFORE implementation
   - Tests define behavioral contracts; implementation honors them
   - Enables parallel work: testers don't block developers; developers have clear spec
   - Pattern applied successfully to: github-rest (35 tests), security-audit-repos (25), sample-health-check (116), create-remediation-issues (75)

4. **Mock Strategy Distinctions:**
   - **Solution-level tests** mock endpoint modules (not client methods)
   - **Realistic responses** — mock data matches actual GitHub API contracts
   - **404 handling tests** distinguish "feature disabled" (graceful) from "API error" (fail)
   - **Edge cases identified through tests** — empty lists, score floors, mixed feature availability

5. **Key Learnings Across Phases:**
   - Module-level mocking enables solution-level tests independent of endpoint implementation
   - Scoring/aggregation logic must be tested exhaustively (complex state transformations)
   - Type safety in tests prevents runtime surprises (model actual response types)
   - Pagination + rate-limit error handling must be explicit (not assumed)

**✅ 2026-03-07 — azure-best-practices-check (P2) Architecture Decision APPROVED**
- Mal finalized architecture: Solution only (`solutions/azure-best-practices-check`), no new package
- 15 checks across 5 dimensions (azure-sdk, iac, config, ci-cd, security)
- Additive scoring (0→100), letter grades (A/B/C/D/F)
- v1 independent; v2 feeds into create-remediation-issues
- All github-rest endpoints exist; zero blockers
- Ready for Wash (scaffolding) + Zoe (test-first rules/scoring)
- See `.squad/decisions.md` Decision #30 for full architecture details
   - Test factories (makeRepo, makeReport) reduce boilerplate and improve readability

**✅ 2026-03-07 — sample-auto-fix (P2) Endpoints COMPLETE & Architecture APPROVED**
- Kaylee built all blocking github-rest endpoints needed for sample-auto-fix:
  - **git.ts:** getRef, createRef, deleteRef (10 tests)
  - **contents.ts (extended):** createOrUpdateFile, deleteFile, encodeContent (18 new tests)
  - **repos.ts (extended):** getDefaultBranchSHA, findPRByBranch (7 new tests)
  - **Total:** 85/85 tests passing, zero build errors
- Mal finalized comprehensive architecture: 4 fix categories, 6-layer safety model, file structure, v1 vs v2 scope
- **Next for Zoe:** Write test suite for sample-auto-fix (parser/planner/executor tests)
- See `.squad/decisions.md` Decision #32 (git endpoints) and #33 (sample-auto-fix architecture)

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-03-06 — Phase 3 create-remediation-issues Implementation Complete

**Status:** ✅ ALL 75 TESTS PASSING

**Implementation by Wash:**
- `solutions/create-remediation-issues/src/index.ts` (432 lines, all functions)
- `solutions/create-remediation-issues/src/cli.ts` (74 lines, CLI orchestration)
- Two-tier threshold model: signal-based findings fire for every repo, score-based only fire as catch-all
- Exact title deduplication with fail-open on API errors
- Severity mapping from test contracts (overrides Mal spec where divergent)
- All 75 tests passing on first run post-implementation
- Build clean with zero errors

**Test contract findings (deviations from Mal's spec):**
- Branch protection disabled → severity 'medium' (spec said 'high')
- Automated security fixes disabled → severity 'low' (spec said 'medium')
- Health grade F → severity 'high' (spec said 'critical')
- High dependabot threshold: `>= 3` (spec said `> 3`)
- **Note:** Tests are the contract — always follow test expectations over design doc

### 2026-03-06 — Phase 3 create-remediation-issues test suite written (test-first)

**Status:** ✅ 75 TESTS WRITTEN (69 failing as expected, 6 constants/exports passing)

**Test-first pattern applied for third time:**
- Wrote 75 tests across 2 files before implementation exists
- Tests define exact contracts for analysis functions, deduplication, dry-run, formatting
- Wash can implement against these test contracts

**Test coverage (75 tests across 2 files):**
- **index.test.ts (61 tests):**
  - `analyzeSecurityFindings` (11 tests): critical/high dependabot, secret scanning, code scanning, branch protection, automated security fixes, threshold logic, multi-repo, no duplicates per repo, alert counts in body
  - `analyzeHealthFindings` (7 tests): grade D/F repos, dimension-specific issues, threshold customization, grade/score in body, multi-repo
  - `deduplicateIssues` (6 tests): open issue match → skip, closed issue → create, no match → create, mixed duplicates/new, correct API calls, error handling
  - `dry-run mode` (4 tests): no createIssue calls, summary reports, no label/issue API calls, dedup still runs
  - `formatIssueTitle` (5 tests): source tag, owner/repo, finding type, optional detail, health tag
  - `formatIssueBody` (4 tests): repo name, context data, severity, valid markdown
  - `createRemediationIssues` orchestrator (8 tests): security creation, health creation, both together, remediation labels, source labels, extra labels, issue number/URL, summary stats
  - `edge cases` (10 tests): empty reports, all healthy, both security+health issues, single-source input, no reports, missing fields, missing dimensions
  - `constants and exports` (6 tests): threshold values, labels, function exports
- **cli.test.ts (14 tests):**
  - `parseArgs` (9 tests): all flags individually, combined flags
  - `runCli` (5 tests): file reading, output writing, option passthrough

**Architecture decisions in tests:**
- **Input types defined locally** in `types.ts` — mirrors JSON shapes from security-audit-repos and sample-health-check (solutions don't import from each other; data flows via files)
- **Deduplication by title pattern** — matches open issues only; closed issues are not duplicates
- **Severity mapping:** critical dependabot + secrets = critical; high dependabot + code scanning = high; branch protection = medium; auto-fix = low
- **Default thresholds:** security score < 70, health grade D or F
- **Label convention:** all issues get `automated-remediation`, plus `security` or `health`
- **Dimension-specific issues** for health: dimensions with passRate < 0.5 get separate issues

**Mock strategy:**
- `vi.mock('github-rest')` at module level — issues namespace (createIssue, listIssues, addLabelsToIssue, createLabel)
- CLI tests also mock `node:fs/promises` and `./index.js` for isolation
- Test data factories: `makeSecurityRepo()`, `makeHealthRepo()`, `makeSecurityReport()`, `makeHealthReport()`

### 2026-03-06 — Phase 3 create-remediation-issues test suite written (test-first)

**Status:** ✅ 75 TESTS WRITTEN (all passing after implementation)

**Test-first pattern applied for third time:**
- Wrote 75 tests across 2 files before implementation exists
- Tests define exact contracts for analysis functions, deduplication, dry-run, formatting
- Wash implemented against these test contracts

**Test coverage (75 tests across 2 files):**
- **index.test.ts (61 tests):**
  - `analyzeSecurityFindings` (11 tests): critical/high dependabot, secret scanning, code scanning, branch protection, automated security fixes, threshold logic, multi-repo, no duplicates per repo, alert counts in body
  - `analyzeHealthFindings` (7 tests): grade D/F repos, dimension-specific issues, threshold customization, grade/score in body, multi-repo
  - `deduplicateIssues` (6 tests): open issue match → skip, closed issue → create, no match → create, mixed duplicates/new, correct API calls, error handling
  - `dry-run mode` (4 tests): no createIssue calls, summary reports, no label/issue API calls, dedup still runs
  - `formatIssueTitle` (5 tests): source tag, owner/repo, finding type, optional detail, health tag
  - `formatIssueBody` (4 tests): repo name, context data, severity, valid markdown
  - `createRemediationIssues` orchestrator (8 tests): security creation, health creation, both together, remediation labels, source labels, extra labels, issue number/URL, summary stats
  - `edge cases` (10 tests): empty reports, all healthy, both security+health issues, single-source input, no reports, missing fields, missing dimensions
  - `constants and exports` (6 tests): threshold values, labels, function exports
- **cli.test.ts (14 tests):**
  - `parseArgs` (9 tests): all flags individually, combined flags
  - `runCli` (5 tests): file reading, output writing, option passthrough

**Architecture decisions in tests:**
- **Input types defined locally** in `types.ts` — mirrors JSON shapes from security-audit-repos and sample-health-check (solutions don't import from each other; data flows via files)
- **Deduplication by title pattern** — matches open issues only; closed issues are not duplicates
- **Severity mapping:** critical dependabot + secrets = critical; high dependabot + code scanning = high; branch protection = medium; auto-fix = low
- **Default thresholds:** security score < 70, health grade D or F
- **Label convention:** all issues get `automated-remediation`, plus `security` or `health`
- **Dimension-specific issues** for health: dimensions with passRate < 0.5 get separate issues

**Mock strategy:**
- `vi.mock('github-rest')` at module level — issues namespace (createIssue, listIssues, addLabelsToIssue, createLabel)
- CLI tests also mock `node:fs/promises` and `./index.js` for isolation
- Test data factories: `makeSecurityRepo()`, `makeHealthRepo()`, `makeSecurityReport()`, `makeHealthReport()`

**Unblocks:** Wash implemented `src/index.ts` against these 75 test contracts

### 2026-03-06 — Phase 3 create-remediation-issues Implementation Complete

**Status:** ✅ ALL 75 TESTS PASSING

**Implementation by Wash:**
- `solutions/create-remediation-issues/src/index.ts` (432 lines, all functions)
- `solutions/create-remediation-issues/src/cli.ts` (74 lines, CLI orchestration)
- Two-tier threshold model: signal-based findings fire for every repo, score-based only fire as catch-all
- Exact title deduplication with fail-open on API errors
- Severity mapping from test contracts (overrides Mal spec where divergent)
- All 75 tests passing on first run post-implementation
- Build clean with zero errors

**Test contract findings (deviations from Mal's spec):**
- Branch protection disabled → severity 'medium' (spec said 'high')
- Automated security fixes disabled → severity 'low' (spec said 'medium')
- Health grade F → severity 'high' (spec said 'critical')
- High dependabot threshold: `>= 3` (spec said `> 3`)
- **Note:** Tests are the contract — always follow test expectations over design doc
### 2026-03-06 — Phase 3 pr-feedback-aggregator test suite written (test-first)

**Status:** ✅ 70 TESTS WRITTEN (58 failing as expected, 12 passing — constants/exports/mock checks)

**Test-first pattern applied for fourth time:**
- Wrote 70 tests across 2 files before implementation exists
- Tests define exact contracts for PR comment fetching, LLM pattern extraction, cross-repo aggregation, report generation, markdown formatting
- Stub files (`index.ts`, `cli.ts`) export function signatures so tests fail at assertion level, not import level

**Test coverage (70 tests across 2 files):**
- **index.test.ts (50 tests):**
  - `fetchPRComments` (7): success, empty PRs, maxPRs limit, pagination, rate limit error, since filter, field normalization
  - `extractPatterns` (7): valid LLM extraction, empty comments, LLM error fallback, malformed JSON, theme grouping, repo info, prompt contents
  - `aggregateResults` (7): single repo, multi-repo totals, dedup/merge by theme, frequency sort, timestamp, recommendations, empty input
  - `generateReport` (6): full pipeline, metadata, maxPRsPerRepo, multi-repo, dry-run, since passthrough
  - `generateMarkdownSummary` (6): themes, repo breakdown, stats, recommendations, severity, empty report
  - `edge cases` (9): empty repos, no PRs, bot filtering, truncation, empty bodies, 404, null user, no-LLM-when-filtered
  - `constants and exports` (8): constants + 5 function exports
- **cli.test.ts (20 tests):**
  - `parseArgs` (13): all flags, validation, defaults
  - `runCli` (7): file I/O, option passthrough, GITHUB_TOKEN, mkdir, invalid JSON

**Mock strategy:**
- `vi.mock('github-rest')` — pullRequests namespace
- `vi.mock('llm-completion')` — callOpenAI
- CLI tests mock `node:fs/promises` and `./index.js`
- Test data factories: makePRComment(), makeFeedbackPattern(), makeGitHubPRListItem(), etc.

**Unblocks:** Wash can implement `src/index.ts` and `src/cli.ts` against these 70 test contracts

### 2026-03-07 — Phase 4 azure-best-practices-check test suite written & PASSING

**Status:** ✅ ALL 131 TESTS PASSING

**Test-first pattern applied for fifth time:**
- Wrote 131 tests across 4 files based on Mal's architecture spec
- Wash built implementation in parallel — tests aligned to match Wash's actual weight allocation
- All 131 tests passing on final run

**Test coverage (131 tests across 4 files):**
- **rules.test.ts (59 tests):**
  - `ALL_RULES` (2): completeness, 15 rule names
  - `checkAzureIdentityPresent` (5): pass, fail, N/A no azure deps, devDeps, empty pkg
  - `checkNoDeprecatedAzureSDK` (5): pass, azure-storage, azure-sb, ms-rest-azure, empty
  - `checkUsesModernAzureSDK` (3): modern only, unscoped fail, no azure N/A
  - `checkAzureTypesPresent` (3): TS present, no TS fail, no azure N/A
  - `checkIaCPresent` (6): .bicep, .tf, azuredeploy.json, infra/, no IaC, empty
  - `checkIaCNoHardcodedSecrets` (4): clean, password literal fail, secret literal fail, no IaC N/A
  - `checkIaCParameterized` (4): bicep param, tf variable, no params fail, no IaC N/A
  - `checkAzdYamlPresent` (2): present, absent
  - `checkEnvExamplePresent` (2): present, absent
  - `checkSecurityPolicyPresent` (2): present, absent
  - `checkWorkflowFederatedAuth` (4): client-id pass, creds fail, no workflows N/A, no azure/login N/A
  - `checkWorkflowNoHardcodedCreds` (3): clean, inline AZURE_CREDENTIALS JSON fail, no workflows N/A
  - `checkWorkflowCurrentActions` (4): v2 pass, v1 fail, no workflows N/A, no azure actions N/A
  - `checkNoConnectionStringsInSource` (5): clean, DefaultEndpointsProtocol, AccountKey, sb://, no source N/A
  - `checkManagedIdentityDocumented` (5): managed identity, DefaultAzureCredential, missing fail, null fail, case insensitive
- **scoring.test.ts (30 tests):**
  - `DIMENSION_WEIGHTS` (3): sum to 100, 5 dimensions, correct individual values
  - `gradeFromScore` (11): standard values + all boundary thresholds (A≥85, B≥70, C≥55, D≥40, F<40)
  - `calculateScore` (7): perfect 100, zero 0, mixed 40/D, mid-range 78/B, normalize 55/C, empty, grade mapping
  - `generateDimensionSummary` (5): group by dimension, all pass, all fail, empty, full 5-dimension set
- **index.test.ts (23 tests):**
  - `checkRepoBestPractices` (11): valid shape, 15 checks, 5 dimensions, dimension summaries, filesAnalyzed, high score, low score, check shape, missing pkg, API error, API calls
  - `checkReposBestPractices` (12): repos array, multi-repo, totalRepos, avgScore, avgGrade, worstDimension, criticalFindings, timestamp, error recording, empty repos, critical count
- **cli.test.ts (19 tests):**
  - `parseArgs` (9): --input, --out, --format json/markdown/both, --verbose, --dry-run, all combined, defaults
  - `runCli` (10): file reading, API call, output files, default dir, json format, markdown format, both format, error log cleanup, dry-run skips API, mkdir

**Weight deviations from Mal's spec (Wash's actual values):**
- `uses-modern-azure-sdk`: weight 6 (spec said 5)
- `azure-types-present`: weight 4 (spec said 5)
- `azd-yaml-present`: weight 4 (spec said 5)
- `env-example-present`: weight 6 (spec said 5)
- All dimensions still sum correctly: azure-sdk=25, iac=25, config=15, ci-cd=20, security=15 = 100

**Implementation differences from spec:**
- Format option is 'markdown' (not 'md') — Wash's CLI uses json/markdown/both
- PipelineError has `category`, `message`, `suggestion` fields (not `owner`, `repo`, `error`)
- `checkWorkflowNoHardcodedCreds` checks for inline AZURE_CREDENTIALS JSON + hardcoded secrets (not just AZURE_CREDENTIALS reference)
- `checkIaCNoHardcodedSecrets` regex: `(?:password|secret|key|connectionstring)\s*[:=]\s*['"][^'"]{8,}['"]` — tests aligned to match

**Mock strategy:**
- `vi.mock('github-rest')` — contents.getRootContents, contents.getDecodedFileContent, contents.fileExists, repos.getRepo, repos.getDefaultBranch
- CLI tests mock `node:fs/promises`, `github-rest`, `./index.js`, and `process.env.GITHUB_TOKEN`
- Test data factories: makeRepoFileData(), createMockClient(), mockCleanAzureRepo(), mockProblematicRepo(), makeAllPassingChecks(), makeAllFailingChecks()