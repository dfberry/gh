
## Monorepo overview

This repository is a small monorepo with two primary packages and supporting docs:

- `packages/github-rest`: a lightweight GitHub REST client and reusable helpers (endpoints, pagination, permissions). See `packages/github-rest/README.md` for usage and exported helpers.
- `packages/gh-cleanup`: CLI tools that implement repository-cleanup features (commands: `remove-forks`, `archive-stale-repos`, `delete-empty-repos`, `categorize-repos`, `summary`). See `packages/gh-cleanup/README.md` for CLI options and examples.

Docs and artifacts
- `generated/` contains example or generated markdown outputs (e.g., catalogs and summaries) produced by the CLI for site consumption.
- GitHub token instructions are in [./docs/GET-GITHUB-TOKEN.md](./docs/GET-GITHUB-TOKEN.md).
- Copilot instructions are in [./.github/copilot-instructions.md](./.github/copilot-instructions.md)

## Functional specification

This section describes the key functionality for the repository-cleanup
tooling and the expected behaviors for each tool. It's a concise spec to guide
implementation, testing, and safe operation.

- **Remove forks**: Identify repositories that are forks and are owned by the
  authenticated user. Provide a dry-run listing with metadata (name,
  full_name, parent, last_push, size, topics). Support an interactive or
  non-interactive deletion mode. Safety: default to dry-run; require
  `--yes` to perform deletions and `--force` to skip the final typed
  confirmation.

- **Archive old repositories**: Find repositories with no code or issue activity
  for a configurable threshold (default 365 days). Provide options to
  filter by org/user, exclude forks or archived repos, and produce a report
  before archiving. Safety: default to dry-run; require `--yes` to PATCH the
  repo to archived=true.

- **Remove empty repositories**: Detect repos that are effectively empty using
  three checks: `size === 0` in repo metadata, no commits (commits API
  returns 409 or empty), and no open pull requests. Provide a dry-run list and
  optionally delete. Safety: default dry-run; `--yes` plus interactive
  confirmation or `--force` to skip typing the confirmation string.

- **Categorize remaining repositories**: Run lightweight analysis per-repo to
  assign categories (e.g., library, cli, infra, docs, sample). Use heuristics
  such as language, topics, README presence, package manifests, and last
  activity. Emit structured output linking repositories to category tags and
  confidence scores.

- **Generate Markdown table for dfberry.github.io**: From categorized results,
  generate a markdown table with columns: Name, Description, Topics, Language,
  Category, Last Updated, Link. (Note: `stars` are collected by the tooling
  but not currently rendered in the default table; `License` is not included.)
  Support sorting, filtering, and
  an option to output a minimal frontmatter header for inclusion in the
  dfberry site.

- **Summary command**: a `summary` command/feature produces aggregated
  summaries of repositories (counts, categories, and other high-level metrics)
  used by the CLI and reporting tools.

- **Empty-repo detection details**: The empty-repo checks include additional
  heuristics beyond `size === 0` — the code also verifies there are no commits
  or pull requests (the commits API may return a `409` for empty repos which
  is treated as empty), and the presence of a wiki (if detectable) will cause
  a repo to be considered non-empty.

## Example commands

Run one example command per main feature (uses the npm wrapper to run the package CLI):

- Remove forks (dry-run):

  ```bash
  npm run start -w gh-cleanup -- remove-forks
  ```

- Archive stale repositories (dry-run, older than 365 days):

  ```bash
  npm run start -w gh-cleanup -- archive-stale-repos
  ```

- Delete empty repositories (dry-run):

  ```bash
  npm run start -w gh-cleanup -- delete-empty-repos
  ```

- Categorize repositories (fetch languages + README and output Markdown):

  ```bash
  npm run start -w gh-cleanup -- categorize-repos --fetch --output=md --out=generated/catalog.md
  ```

- Summary (quick counts, write full summary Markdown):

  ```bash
  npm run start -w gh-cleanup -- summary --summary-out=generated/summary.md
  ```

