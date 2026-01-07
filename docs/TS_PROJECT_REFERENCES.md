# TypeScript Project-Reference Build (monorepo)

This repository uses TypeScript Project References and npm workspaces to build a multi-package monorepo.

Summary
- Root: `tsconfig.json` lists project `references` to each package (e.g. `packages/github-rest`, `packages/gh-cleanup`).
- Shared options: `tsconfig.base.json` contains common `compilerOptions` (strict, `composite`, `declarationMap`, `incremental`, etc.).
- Packages: each package `tsconfig.json` extends the base, sets `rootDir`, `outDir` (`dist/`), `tsBuildInfoFile`, and declares `references` to other dependent packages.

Build and CI
- Local build: run

```bash
npm ci
npm run build
```

  - `npm ci` installs dependencies deterministically.
  - `npm run build` runs `tsc -b` (composite build) from the repo root; TypeScript will compile referenced projects in dependency order and emit `.d.ts` and `.js` into each package `dist/` directory.

- CI guidance:
  - Use the root `tsc -b` build in CI so TypeScript respects project references and builds in the correct order.
  - Ensure `package-lock.json` is committed so `npm ci` is deterministic on CI.
  - Provide `NPM_TOKEN` (for publishing) and ensure Actions `GITHUB_TOKEN` has write/tag permissions if workflows push tags or commits.

Module resolution and paths
- Packages import each other by package name (e.g. `import { GitHubClient } from 'github-rest'`).
- During composite builds we use a combination of project references and `baseUrl`/`paths` in `tsconfig` to help `tsc` resolve bare imports to local `src` when needed.

Publishing
- Prebuild: the root `tsc -b` emits `dist/` artifacts; package `package.json` `exports` and `main` point to `dist/*` so published packages are consumable.
- Automation: this repo includes helper scripts and CI workflows to bump, tag, and publish packages; semantic-release or Changesets are recommended for more advanced per-package versioning in monorepos.

Troubleshooting
- If `tsc -b` reports "Cannot find module '...'": ensure package references are correct, `tsconfig.base.json` and per-package `baseUrl`/`paths` are set, and CI runs `npm ci` then `tsc -b` on the same commit.
- If `npm ci` fails: keep `package-lock.json` in sync with `package.json` (run `npm install` locally and commit the lockfile).

Further reading
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Nx article on managing TS packages: https://nx.dev/blog/managing-ts-packages-in-monorepos
 - Nx article on managing TS packages: https://nx.dev/blog/managing-ts-packages-in-monorepos

