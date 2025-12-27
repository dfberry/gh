Plan: Move GitHub-related helpers from `gh-cleanup` into `github-rest`

Goal
- Consolidate network and GitHub-model helpers into `packages/github-rest` so other packages can reuse them and avoid duplicated calls to the API.

Scope / Candidates to move
- `packages/gh-cleanup/src/lib/repo-utils.ts`:
  - Network fetching portions (calls to `client.get` for `/languages` and `/readme`) should be factored into `github-rest` helpers such as `getRepoLanguages` and `getRepoReadme` or `fetchRepoContent`.
  - Keep categorization orchestration and result formatting (`scoreCategory` usage and mapping to `Categorized`) in `gh-cleanup`.
- `packages/gh-cleanup/src/lib/permissions.ts`:
  - This is already a thin shim delegating to `github-rest`; remove it and update imports to use `github-rest` directly. Don't keep a deprecated shim.

Deliverables
1. New helpers in `packages/github-rest/src/endpoints/*`:
   - `getRepoLanguages(client, owner, repo)` -> returns language object
   - `getRepoReadme(client, owner, repo)` -> returns decoded README text or `null`
   - `fetchRepoMetadataExtensions(client, owner, repo)` combining languages/readme
2. Update `packages/gh-cleanup/src/lib/repo-utils.ts` to call the new helpers instead of `client.get` directly.
3. Update `package.json` exports if necessary and document changes in the repo `CHANGELOG` or `README`.

Step-by-step plan
1. Add `getRepoLanguages` and `getRepoReadme` to `packages/github-rest/src/endpoints/repos.ts`.
   - Implement using `client.get` and decoding readme content (follow existing pattern in `gh-cleanup` for decoding base64).
   - Add unit tests mocking `GitHubClient` or `globalThis.fetch`.
2. Add a combined helper `fetchRepoContentExtensions` if desired.
3. Update `packages/gh-cleanup/src/lib/repo-utils.ts`:
   - Replace direct `client.get('/repos/.../languages')` and `client.get('/repos/.../readme')` calls with the new exported helpers.
   - Keep the transformation into `Categorized[]` inside `gh-cleanup`.
4. Remove `packages/gh-cleanup/src/lib/permissions.ts` and update all imports to reference `packages/github-rest` directly.
5. Run tests across the workspace, fix imports/tsconfig path issues, and update docs and `package.json` exports as needed.
6. Create a short migration note and update `.github/package-placement-rules.md` (already added) and this `plan.md`.

Risks & Notes
- Breaking changes to imports: this migration will change import locations and may break consumers. Plan a coordinated change (single PR) that updates imports across the repo and bump package versions accordingly.
- No deprecated shims: per scope, do not introduce long-lived deprecated shims. Update consumers to the new `github-rest` exports and remove the old `permissions.ts` shim immediately.
- Testing: add unit tests to `github-rest` for the new helpers and update `gh-cleanup` tests to mock or use the new helpers. Run workspace tests and type checks.
- Release considerations: update `CHANGELOG`/migration notes and publish new package versions for `github-rest` and `gh-cleanup` in lockstep, or use a single release that contains both changes to avoid breakage.

Next actions I can take for you
- Implement the `getRepoLanguages` and `getRepoReadme` helpers and tests in `github-rest`.
- Update `repo-utils.ts` to use those helpers and run tests.
- Remove `packages/gh-cleanup/src/lib/permissions.ts` and update all imports to `github-rest`.
- Create a migration note / changelog entry describing the new API locations and required import updates.

