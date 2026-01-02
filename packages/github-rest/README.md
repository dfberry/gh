# github-rest

Minimal, centralized GitHub REST client used as a DRY foundation for higher
level tooling. It provides a typed `GitHubClient`, small endpoint wrappers
(repos) and a pagination helper. Designed to be minimal and extended over
time.

## Goals

- Centralize request handling (auth, retries, JSON parsing) so callers remain simple and testable.
- Provide typed helpers for common operations (repos, readme, topics) while keeping the surface area small.

## Exports and helpers

- `createClient(opts)` — construct a `GitHubClient` with `token`, `baseUrl`, and optional retry/timeouts.
- `client.request` / `client.rawRequest` — low-level wrappers around `fetch` used by the higher-level endpoint modules.
- Endpoint helpers under `endpoints/` include `repos.getRepo()`, `repos.getReadme()`, `repos.getTopics()`, and related utilities.

## Usage example (programmatic)

```ts
import { createClient } from '@workspace/github-rest'
import * as repos from '@workspace/github-rest/src/endpoints/repos'

const client = createClient({ token: process.env.GH_TOKEN })
const repo = await repos.getRepo(client, 'octocat', 'hello-world')
console.log(repo.full_name, repo.private)
```

## CLI / consumer usage

Consumers (like `gh-cleanup`) call these helpers from command modules. Typical
runner commands in this repo call into `packages/gh-cleanup` which imports the
helpers and uses them to fetch repo metadata, readmes, and to apply updates.

## Authentication & tokens

Provide `GH_TOKEN` or pass a `token` when constructing `createClient`. For destructive operations ensure the token has the required scopes (for example `repo` or `delete_repo`).

## Testing

In tests mock `globalThis.fetch` (or use `vi.stubGlobal('fetch', ...)`) and return the expected HTTP responses. The package exposes low-level `rawRequest` to make it easy to verify request shapes in unit tests.

## Notes

Keep this package minimal — add helpers only when multiple consumers need the same behavior. Higher-level policies (prompt construction, LLM parsing, UI) belong in the consumer packages.

See `packages/github-rest/src` for implementation details and `packages/gh-cleanup` for canonical usage patterns.
