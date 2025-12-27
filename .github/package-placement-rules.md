Package Placement Rules

When deciding which package a shared function should live in, follow these rules:

- If the function directly interacts with GitHub HTTP APIs (uses `GitHubClient`, calls `client.get|post|patch|rawRequest`, or manages GitHub API endpoints/paths), place it in `packages/github-rest` and expose it as part of the REST helpers.
- If the function operates on `Repository` or other typed GitHub models and performs data enrichment or filtering that will be useful across multiple tools, prefer `packages/github-rest` (e.g., `fetchRepoMetadata`, `isRepoEmpty`, `getRepoLastUpdated`).
- If the function is UI/output, file I/O, or CLI orchestration (printing, formatting, emitting files, ensuring local directories), keep it in the consuming package (e.g., `packages/gh-cleanup`).
- If the logic is domain-specific (categorization rules, scoring algorithms, report formatting), keep it in the package that owns that feature unless it clearly benefits multiple packages.
- Prefer splitting helpers: move network/data-fetching helpers into `github-rest` and keep high-level domain logic (like scoring or combining data into categories) in the feature package.

Examples / Placement — two lists

github-rest (core REST & repo-model helpers)
- Functions that call the GitHub HTTP API (`GitHubClient`, `client.get|post|patch|rawRequest`, `client.rawRequest`).
- Helpers that operate on typed `Repository` models and provide generic enrichment/filtering for callers (e.g., `fetchRepoMetadata`, `getCommitsCount`, `getPullsCount`, `getRepoLastUpdated`, `isRepoEmpty`, `findEmptyRepos`, `enrichReposMetadata`).
- New per-repo fetch helpers (examples): `getRepoLanguages(client, owner, repo)`, `getRepoReadme(client, owner, repo)`, `fetchRepoMetadataExtensions(client, owner, repo)`.

Higher-level / Calling packages (feature + presentation)
- Presentation, formatting, and file I/O: `toMarkdownTable`, `addGeneratedTimestamp`, `emitOutput`, `ensureDirForFile`.
- Domain-specific logic and rules: `scoreCategory`, `matchesRule`, `loadRules`, `bundledRules` (categorization logic and rule files).
- Orchestration and CLI: `categorizeReposWithMetadata` orchestration, command runners, `availableCommands`, `runCommand`, and interactive helpers like `requireTypedConfirmation`.

When moving code
- Do not add long-lived deprecated shims. Update all consumers to import the new helpers from `packages/github-rest` directly. If a very short-lived compatibility shim is required for a single coordinated PR, document its removal and remove it immediately after the migration.
- Add unit tests for moved helpers in `packages/github-rest` (mock `GitHubClient` / `globalThis.fetch`).
- Update imports across the repo to use the new locations; update `package.json` exports and `tsconfig` paths if necessary.
- Create a migration note / `CHANGELOG` entry documenting the moved helpers and required import changes.
