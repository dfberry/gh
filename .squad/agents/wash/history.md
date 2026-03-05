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
