# Squad Team

> GitHub REST API tooling monorepo — extract, analyze, and act on GitHub data to improve content, code, communications, planning, and CI.

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Mal | Lead / Architect | `.squad/agents/mal/charter.md` | 🟢 Active |
| Kaylee | Core Dev | `.squad/agents/kaylee/charter.md` | 🟢 Active |
| Wash | Solutions Dev | `.squad/agents/wash/charter.md` | 🟢 Active |
| Zoe | Tester / QA | `.squad/agents/zoe/charter.md` | 🟢 Active |
| Inara | Content Engineer | `.squad/agents/inara/charter.md` | 🟢 Active |
| Scribe | Session Logger | `.squad/agents/scribe/charter.md` | 🟢 Active |
| Ralph | Work Monitor | — | 🔄 Monitor |

## Project Context

- **User:** Dina Berry
- **Project:** GitHub REST API tooling monorepo
- **Stack:** TypeScript (strict, ESM), Node.js 22+, Vitest, npm workspaces, project references
- **Packages:** `github-rest` (REST client), `gh-cleanup` (CLI), `llm-completion` (LLM integration)
- **Solutions:** `get-pr-comments`, `get-user-comments`, `move-between-repos`, `get-instruction-from-pr-comments`
- **Philosophy:** DRY — build primitives once in packages, compose into end-to-end solutions
- **Created:** 2026-03-05
- **Universe:** Firefly
