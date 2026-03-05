# Project Context

- **Owner:** Dina Berry
- **Project:** GitHub REST API tooling monorepo — packages for extracting, analyzing, and acting on GitHub data to improve content, code, communications, planning, and CI
- **Stack:** TypeScript (strict, ESM), Node.js 22+, Vitest, npm workspaces, project references
- **Created:** 2026-03-05

### Repo Structure

- `packages/github-rest` — Shared GitHub REST client, pagination, permissions helpers
- `packages/gh-cleanup` — CLI for repo management (gather, evaluate, change pipeline + individual commands)
- `packages/llm-completion` — LLM integration for AI-driven descriptions and analysis
- `solutions/get-pr-comments` — Extract PR comments for analysis
- `solutions/get-user-comments` — Extract user comment history
- `solutions/move-between-repos` — Move content between repositories
- `solutions/get-instruction-from-pr-comments` — Extract actionable instructions from PR feedback
- Philosophy: DRY — build primitives once in packages, compose into end-to-end solutions

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
