# gh-cleanup

Small CLI tooling to audit and clean GitHub repositories using the shared
`github-rest` client in this workspace. Commands default to dry-run; destructive
actions require explicit confirmation and are gated behind `--yes`/`--force`
flags and, where applicable, `--apply`.

Quick overview
- Purpose: audit, categorize, and (optionally) clean repositories owned by the
  authenticated account.
- Safe-by-default: all destructive commands are dry-run unless you pass the
  appropriate confirmation flags.
- Integration: commonly invoked from `scripts/run-all.sh` which orchestrates the
  pipeline across commands (see repository root).

Common flags
- `--out=<path>`: write JSON or Markdown output to a file.
- `--output=json|md`: choose output format (where supported).
- `--yes`: perform destructive operations (still prompts unless `--force`).
- `--force`: skip typed confirmation prompts — use carefully in automation.

Commands

- `remove-forks`
  - List (and optionally delete) forked repositories owned by the authenticated user.
  - Flags: `--yes`, `--force`, `--out=<path>`, `--no-audit` (omit permissions).

- `archive-stale-repos`
  - Archive repositories with no activity older than `N` days (default 365).
  - Flags: `--older-than-days=<n>`, `--yes`, `--force`, `--allow-forks`, `--out=<path>`.

- `delete-empty-repos`
  - Detect repositories with `size === 0` and optionally delete them.
  - Flags: `--yes`, `--force`, `--allow-forks`, `--out=<path>`, `--no-audit`.

- `categorize-repos`
  - Heuristic categorization (library, cli, infra, docs, sample, etc.).
  - Flags: `--fetch` (languages + README), `--output=json|md`, `--out=<path>`, `--rules=<path>`.
  - Output: JSON or Markdown catalog; default rules are in `src/config/categorization.rules.ts`.

- `summary`
  - Produce counts for forks, stale repos, empty repos, and an active repo table.
  - Flags: `--older-than-days=<n>`, `--allow-forks`, `--verify` (fetch commits/PRs), `--output=json|md`, `--out=<path>`, `--summary-out=<path>`.
  - Note: the summary now includes public/private totals and per-category public/private splits.

- `describe-repo` / `describe-repos`
  - Generate short/long descriptions, suggested topics, and related links using an LLM.
  - Use `describe-repo` for a single repo and `describe-repos` for batch JSON inputs.
  - Flags:
    - `--openai-key=` or set `OPENAI_API_KEY` / `AZURE_OPENAI_API_KEY` in env.
    - `--openai-model=`, `--openai-temp=`, `--openai-endpoint=` — provider overrides.
    - `--prompt=/path/to/prompt.md` — override the prompt file. If omitted the CLI searches
      upward for `.github/LLM_DESCRIBE_REPO_PROMPT.md`.
    - `--apply` — apply suggested description/topics to repositories (forwarded by `run-all.sh` when invoked with `--apply`).
    - `--out=<path.json|path.md>` — aggregated output with `ai` and `applied` annotations.
    - `--debug` — enable debug recording of prompt & response JSON to disk.
    - `--debug-dir=<path>` — directory to write debug files (implies `--debug`).

  - Input JSON shapes (plural): accepts an array of strings or objects, or a top-level object
    with `items|repos|repositories` fields. Objects may contain `full_name`, or `owner`+`name`.

Output annotations
- The describe step writes structured output where each item includes:
  - `ai`: the model-generated object (short/long descriptions, topics, links).
  - `applied`: boolean flags indicating which fields were actually patched on the repo.

Prompt & key behavior
- The CLI prefers `--openai-key` flag, then `OPENAI_API_KEY` / `AZURE_OPENAI_API_KEY` env vars.
- Prompt resolution: if `--prompt` is not provided the CLI searches upward from the
  current working directory for `.github/LLM_DESCRIBE_REPO_PROMPT.md` and errors if none is found.

Integration with pipeline
- `scripts/run-all.sh` orchestrates the end-to-end flow and will conditionally run the
  describe step when `OPENAI_API_KEY` is set. Passing `--apply` to the runner forwards
  `--apply` to `describe-repos` so suggested changes can be applied during automated runs.

Prerequisites
- `GH_TOKEN` in environment (or `.env` file at repo root) for GitHub operations.
- Node >= 22.

Important token note
- For destructive operations (deleting repositories) a token with `delete_repo` or
  equivalent admin permissions is required. Fine-grained tokens may not allow deletion.

Developer notes
- Implementation lives under `packages/gh-cleanup/src`. Shared helpers:
  - `describe-common.ts` — LLM prompt resolution and sanitization.
  - `describe-validator.ts` — validates model output shape.
  - `repo-utils.ts` / `report.ts` — utilities for fetching repo metadata and producing Markdown.
- `github-rest` in `packages/github-rest` is the low-level client used by these commands.

Quick help

```bash
# general CLI help
npm run start -w gh-cleanup -- --help

# describe repos dry-run (requires OPENAI key in env)
npm run start -w gh-cleanup -- describe-repos --repos=generated/active.json --out=generated/descriptions.json

# run full pipeline and apply changes (use with extreme caution)
./scripts/run-all.sh --apply
```

Rules file shape (example)
```json
{
  "category": "cli",
  "confidence": 0.85,
  "topicsContains": ["cli"],
  "readmeContains": ["cli"],
  "languagesContains": ["go", "shell"]
}
```

Generated Markdown
- Outputs from `categorize-repos` and `summary` include a `generated_at` ISO timestamp
  in YAML frontmatter and the `summary` file now includes per-category public/private counts.

```
npm run start -w gh-cleanup -- describe-repo --repo=owner/repo
```
