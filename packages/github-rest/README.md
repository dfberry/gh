# github-rest

Minimal, centralized GitHub REST client used as a DRY foundation for higher
level tooling. It provides a typed `GitHubClient`, small endpoint wrappers
(`repos`) and a pagination helper. Designed to be minimal and extended over
time.

See `packages/github-rest/src` for the implementation and `packages/gh` for a
consumer that will be migrated to use this client.
