# Project Context

- **Owner:** Dina Berry
- **Project:** GitHub REST API tooling monorepo — packages for extracting, analyzing, and acting on GitHub data to improve content, code, communications, planning, and CI
- **Stack:** TypeScript (strict, ESM), Node.js 22+, Vitest, npm workspaces, project references
- **Created:** 2026-03-05

### Team (Firefly cast)

- Mal (Lead), Kaylee (Core Dev), Wash (Solutions Dev), Zoe (Tester), Inara (Content Engineer)

## Core Context

Agent Scribe initialized and ready for work.

## Recent Updates

📌 Team initialized on 2026-03-05
📌 Team hired on 2026-03-05: Mal (Lead), Kaylee (Core Dev), Wash (Solutions Dev), Zoe (Tester), Inara (Content Engineer) — Firefly universe

## Learnings

- Monorepo uses npm workspaces with `packages/*` and `solutions/*`
- Build: `npm run build` (runs `tsc -b`), Test: `npm run test` (all workspaces)
- DRY philosophy: build primitives in packages, compose in solutions
