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

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
