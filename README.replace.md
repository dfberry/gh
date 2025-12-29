# Monorepo overview

This repository is a small monorepo with two primary packages and supporting docs:

- packages/github-rest: a lightweight GitHub REST client and reusable helpers (endpoints, pagination, permissions). See [packages/github-rest/README.md](packages/github-rest/README.md) for usage and exported helpers.
- packages/gh-cleanup: CLI tools that implement repository-cleanup features (commands: remove-forks, archive-stale-repos, delete-empty-repos, categorize-repos, summary). See [packages/gh-cleanup/README.md](packages/gh-cleanup/README.md) for CLI options and examples.

Docs and artifacts
- `generated/` contains example or generated markdown outputs (e.g., catalogs and summaries) produced by the CLI for site consumption.
- GitHub token instructions are in [./docs/GET-GITHUB-TOKEN.md](./docs/GET-GITHUB-TOKEN.md).
- Copilot instructions are in [./.github/copilot-instructions.md](./.github/copilot-instructions.md)

## Functional specification

This section describes the key functionality for the repository-cleanup tooling and the expected behaviors for each tool. It's a concise spec to guide implementation, testing, and safe operation.

- **Remove forks**: Identify repositories that are forks and are owned by the authenticated user. Provide a dry-run listing with metadata (name, full_name, parent, last_push, size, topics). Support an interactive or non-interactive deletion mode. Safety: default to dry-run; require `--yes` to perform deletions and `--force` to skip the final typed confirmation.

- **Archive old repositories**: Find repositories with no code or issue activity for a configurable threshold (default 365 days). Provide options to filter by org/user, exclude forks or archived repos, and produce a report before archiving. Safety: default to dry-run; require `--yes` to PATCH the repo to archived=true.

- **Remove empty repositories**: Detect repos that are effectively empty using three checks: `size === 0` in repo metadata, no commits (commits API returns 409 or empty), and no open pull requests. Provide a dry-run list and optionally delete. Safety: default dry-run; `--yes` plus interactive confirmation or `--force` to skip typing the confirmation string.

- **Categorize remaining repositories**: Run lightweight analysis per-repo to assign categories (e.g., library, cli, infra, docs, sample). Use heuristics such as language, topics, README presence, package manifests, and last activity. Emit structured output linking repositories to category tags and confidence scores.

- **Generate Markdown table for dfberry.github.io**: From categorized results, generate a markdown table with columns: Name, Description, Topics, Language, Category, Last Updated, Link.

- **Summary command**: a `summary` command/feature produces aggregated summaries of repositories (counts, categories, and other high-level metrics) used by the CLI and reporting tools.

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

## Generate repo descriptions

You can generate short descriptions and topic lists for repositories using an LLM-driven CLI command implemented in [packages/gh-cleanup/src/commands/describe-repo.ts](packages/gh-cleanup/src/commands/describe-repo.ts). The LLM prompt template is at [./.github/LLM_DESCRIBE_REPO_PROMPT.md](.github/LLM_DESCRIBE_REPO_PROMPT.md).

Prerequisites:

- A GitHub token in `GH_TOKEN` or `GITHUB_TOKEN` with repo scope.
- An OpenAI API key in `OPENAI_API_KEY` (or pass `--openai-key=` to the command).

Single repo (dry-run):

```bash
export GH_TOKEN="ghp_..."
export OPENAI_API_KEY="sk-..."
npm run start -w gh-cleanup -- describe-repo --repo=owner/repo
```

Apply changes (update description & topics):

```bash
npm run start -w gh-cleanup -- describe-repo owner/repo --apply
```

Batch run against the active list

The active repository list is in [generated/active.md](generated/active.md). To run the command for every owner/repo found in that file (dry-run):

```bash
grep -Eo '[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' generated/active.md | sort -u | xargs -n1 -I{} npm run start -w gh-cleanup -- describe-repo --repo={} 
```

To apply changes for each repository, add `--apply` to the end of the command above.

Optional OpenAI CLI flags supported: `--openai-key=`, `--openai-model=`, `--openai-temp=`, `--openai-endpoint=`.

Output

The command prints validated JSON to stdout containing `short_description`, `long_description`, `topics`, and `links`. When run with `--apply` it will PATCH the repository description and update topics (up to 20).
