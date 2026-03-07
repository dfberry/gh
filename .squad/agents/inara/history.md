# Project Context

- **Owner:** Dina Berry
- **Project:** GitHub REST API tooling monorepo — packages for extracting, analyzing, and acting on GitHub data to improve content, code, communications, planning, and CI
- **Stack:** TypeScript (strict, ESM), Node.js 22+, Vitest, npm workspaces, project references
- **Created:** 2026-03-05

### Content & Documentation

- LLM prompt template: `.github/LLM_DESCRIBE_REPO_PROMPT.md`
- Generated site content goes to `generated/` for `dfberry.github.io`
- `describe-repo` / `describe-repos` commands generate AI-driven descriptions and topics
- Supports `--apply` to PATCH repo descriptions/topics on GitHub
- OpenAI/Azure OpenAI via `packages/llm-completion` with debug flags (`--debug`, `--debug-dir`)
- `scripts/run-all.sh` orchestrates the full pipeline including content generation

---

## 2026-03-06 — Solutions Pipeline Documentation (README.md)

**Task:** Documented full detect → score → remediate pipeline  
**Section:** "Solutions Pipeline" (README.md lines 28–96)  
**Status:** ✅ Complete  
**Content:**
- Prerequisites (Node 22+, .env, build steps)
- Three-solution breakdown:
  - Security Audit: deductive 0–100 scoring
  - Sample Health Check: 7-dimension comprehensive analysis (A–F grades)
  - Create Remediation Issues: actionable issue generation with deduplication
- Full pipeline example with dry-run and creation flows
- Test coverage callout (226+ tests)
- Usage examples for each tool

**Notes:** Coordinates with Kaylee's npm script additions. Emphasizes end-to-end pipeline and reliability via test count.

## 2026-03-07 — ALL 6 SMART GOAL SOLUTIONS COMPLETE — DOCUMENTATION UPDATE NEEDED

**Status:** ✅ SMART Goal infrastructure complete; documentation update pending

**Completed solutions (all with test coverage, pipeline integration):**
1. security-audit-repos (P0) — baseline security audit with measurement framework
2. sample-health-check (P0) — multi-repo health scoring (7 dimensions, A–F grades)
3. create-remediation-issues (P1) — automated issue creation with deduplication
4. pr-feedback-aggregator (P1) — cross-PR pattern analysis (v2 pending)
5. azure-best-practices-check (P2) — Azure MCP best practices validation (v2 pending)
6. sample-auto-fix (P2) — automated PR-based remediation with 6-layer safety model (NEW)

**Documentation updates needed (for Inara):**
- Update README.md "Solutions Pipeline" section to include sample-auto-fix (Step 6)
- Add sample-auto-fix usage examples and safety disclaimers
- Update test coverage callout (226 → 250+ tests)
- Document all 6 solutions in priority order (P0-P2)
- Update `.github/` solution overview docs

**Test infrastructure:**
- Total: 250+ tests across 6 solutions, all passing
- github-rest: 85+ tests (endpoints + exports)
- Pattern consistency: Pure functions tested first, mocked endpoints, realistic mock data

**Next:** Documentation updates, smoke testing, rate limit monitoring, v2 planning

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
