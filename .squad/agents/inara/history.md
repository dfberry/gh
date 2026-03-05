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

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
