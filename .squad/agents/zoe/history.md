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

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
