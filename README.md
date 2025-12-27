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
  generate a markdown table with columns: Name, Description, Topics, License,
  Stars, Last Updated, Link, Category, Status. Support sorting, filtering, and
  an option to output a minimal frontmatter header for inclusion in the
  dfberry site.