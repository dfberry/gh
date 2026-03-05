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
