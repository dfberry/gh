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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- Decisions merged from inbox monthly
