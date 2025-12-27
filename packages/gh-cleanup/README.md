# gh-cleanup

Small CLI tooling to audit and clean GitHub repositories using the shared
`github-rest` client in this workspace.

This package provides several small CLI commands to audit and clean GitHub
repositories. All commands default to dry-run and will not perform destructive
actions unless `--yes` is provided. Use `--force` to skip typed confirmation
prompts (use carefully for automation).

Commands

- `remove-forks`
	- Description: List forked repositories owned by the authenticated user and
		optionally delete them.
	- Flags: `--yes` (perform deletion), `--force` (skip typed `YES` confirmation), `--out=<path>` (write JSON details), `--no-audit` (omit permissions from output)
	- Example:
		```bash
		# dry-run (default)
		npm run start -w gh-cleanup -- remove-forks

		# actually delete (interactive confirmation)
		npm run start -w gh-cleanup -- remove-forks --yes

		# save dry-run details to a file (including permissions)
		npm run start -w gh-cleanup -- remove-forks --out=generated/remove-forks.json

		# save dry-run details without permissions
		npm run start -w gh-cleanup -- remove-forks --out=generated/remove-forks-noaudit.json --no-audit
		```

- `archive-stale-repos`
	- Description: Find repositories with no activity older than N days and
		optionally archive them. Forks are excluded by default.
	- Flags: `--older-than-days=<n>` (default 365), `--yes`, `--force`,
		`--allow-forks` (include forks), `--out=<path>` (write JSON details)
	- Example:
		```bash
		# dry-run: list repos older than 365 days
		npm run start -w gh-cleanup -- archive-stale-repos --yes

		# archive repos older than 730 days
		npm run start -w gh-cleanup -- archive-stale-repos --older-than-days=730 --yes

		# save dry-run list to a file
		npm run start -w gh-cleanup -- archive-stale-repos --out=generated/stale.json
		```

- `delete-empty-repos`
	- Description: Detect repositories with `size === 0` (0 KB), confirm no commits
	and no pull requests, and optionally delete them. Forks are excluded by
	default.
	- Flags: `--yes`, `--force`, `--allow-forks`, `--out=<path>` (write JSON details), `--no-audit` (omit permissions from output)
	- Example:
		```bash
		# dry-run
		npm run start -w gh-cleanup -- delete-empty-repos

		# delete matched repos
		npm run start -w gh-cleanup -- delete-empty-repos --yes

		# save deletion plan to file (including permissions)
		npm run start -w gh-cleanup -- delete-empty-repos --out=generated/delete-empty.json

		# save deletion plan without permissions
		npm run start -w gh-cleanup -- delete-empty-repos --out=generated/delete-empty-noaudit.json --no-audit
		```

- `categorize-repos`
	- Description: Heuristic categorization (library, cli, infra, docs,
		sample, etc.) with optional metadata fetch (languages + README). Outputs
		JSON or Markdown.
	- Flags: `--fetch` (fetch languages + README), `--output=json|md`
		(default `json`), `--out=<path>` (write output)
	- Example:
		```bash
		# JSON to stdout (no extra fetches)
		npm run start -w gh-cleanup -- categorize-repos

		# fetch languages/README and output Markdown file
		npm run start -w gh-cleanup -- categorize-repos --fetch --output=md --out=generated/catalog.md
		```

	- Notes:
		- **Custom rules:** You can pass `--rules=/path/to/rules.json` to load a custom rules file. Rules follow the bundled shape (see below).
		- **Bundled rules:** Default heuristics live in `packages/gh-cleanup/src/config/categorization.rules.ts`.
		- **Output directories:** Parent directories for `--out` are created automatically.


	- `summary`
		- Description: Produce a quick summary of your repositories — counts of
		forks you own, stale repositories (no activity older than N days), and
		repositories with size === 0 (0 KB). Can optionally verify counts by fetching
		commit and pull request metadata (slower).
		- Flags: `--older-than-days=<n>` (default 365), `--allow-forks`, `--verify`, `--summary-out=<path>` (write full summary Markdown)
			(`--verify` will fetch commits/PRs for more accurate classification)
		- Example:
			```bash
			# quick summary (dry-run)
			npm run start -w gh-cleanup -- summary

			# include forks in calculations
			npm run start -w gh-cleanup -- summary --allow-forks

			# verify by fetching commits & PR counts (slower)
			npm run start -w gh-cleanup -- summary --verify

			# write markdown to file (active repos table)
			npm run start -w gh-cleanup -- summary --output=md --out=generated/active.md

			# write JSON instead
			npm run start -w gh-cleanup -- summary --output=json --out=generated/active.json

			# write a full summary Markdown file (counts + active repo table)
			npm run start -w gh-cleanup -- summary --summary-out=generated/summary.md
			```

Prerequisites

- Set `GH_TOKEN` in environment or place a `.env` at the repository root.
- Node >= 22

Important token note

- For destructive operations (deleting repositories) use a classic Personal
	Access Token (PAT) that includes the `delete_repo` permission. Fine-grained
	tokens or tokens missing `delete_repo` may not be allowed to remove
	repositories even if they include `repo` or other scopes. Additionally the
	token must have `admin` permission on each repository to perform deletions.

Safety

- All commands default to dry-run. To perform destructive actions pass
	`--yes` and type `YES` when prompted (unless using `--force`).
- Ensure the `GH_TOKEN` has the necessary scopes (repo/admin) for destructive
	operations.

Developer notes

- `github-rest` provides the low-level client under `packages/github-rest`.
- `gh-cleanup` implements CLI orchestration and reporting under
	`packages/gh-cleanup/src`.
- To run the CLI from source in development use `ts-node` or run the built
	`.js` output from `dist` after `npm run build` in the package directory.

Quick CLI help

You can print a concise help summary from the entrypoint:

```bash
# using npm run start wrapper
npm run start -w gh-cleanup -- --help

# or directly (after build)
node packages/gh-cleanup/dist/bin/cli.js --help
```

The help output lists available commands and common flags such as `--yes`, `--force`, `--out=<path>`, and `--output=json|md`.

Rules file shape (example)

The rules are an array of objects with optional match fields. Example minimal rule:

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

Markdown outputs produced by `categorize-repos` and `summary` include a `generated_at` ISO timestamp in the YAML frontmatter.
