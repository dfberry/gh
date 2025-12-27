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
	- Flags: `--yes` (perform deletion), `--force` (skip typed `YES` confirmation)
	- Example:
		```bash
		# dry-run (default)
		npm run start -w gh-cleanup -- remove-forks

		# actually delete (interactive confirmation)
		npm run start -w gh-cleanup -- remove-forks --yes
		```

- `archive-stale-repos`
	- Description: Find repositories with no activity older than N days and
		optionally archive them. Forks are excluded by default.
	- Flags: `--older-than-days=<n>` (default 365), `--yes`, `--force`,
		`--allow-forks` (include forks)
	- Example:
		```bash
		# dry-run: list repos older than 365 days
		npm run start -w gh-cleanup -- archive-stale-repos --yes

		# archive repos older than 730 days
		npm run start -w gh-cleanup -- archive-stale-repos --older-than-days=730 --yes
		```

- `delete-empty-repos`
	- Description: Detect repositories with `size === 0`, confirm no commits
		and no pull requests, and optionally delete them. Forks are excluded by
		default.
	- Flags: `--yes`, `--force`, `--allow-forks`
	- Example:
		```bash
		# dry-run
		node packages/gh-cleanup/src/bin/cli.ts delete-empty-repos

		# delete matched repos
		node packages/gh-cleanup/src/bin/cli.ts delete-empty-repos --yes
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
		node packages/gh-cleanup/src/bin/cli.ts categorize-repos

		# fetch languages/README and output Markdown file
		node packages/gh-cleanup/src/bin/cli.ts categorize-repos --fetch --output=md --out=generated/catalog.md
		```

	- `summary`
		- Description: Produce a quick summary of your repositories — counts of
			forks you own, stale repositories (no activity older than N days), and
			repositories with size === 0. Can optionally verify counts by fetching
			commit and pull request metadata (slower).
		- Flags: `--older-than-days=<n>` (default 365), `--allow-forks`, `--verify`
			(`--verify` will fetch commits/PRs for more accurate classification)
		- Example:
			```bash
			# quick summary (dry-run)
			npm run start -w gh-cleanup -- summary

			# include forks in calculations
			npm run start -w gh-cleanup -- summary --allow-forks

			# verify by fetching commits & PR counts (slower)
			npm run start -w gh-cleanup -- summary --verify

            # write markdown to file
            npm run start -w gh-cleanup -- summary --output=md --out=generated/active.md

            # write JSON instead
            npm run start -w gh-cleanup -- summary --output=json --out=generated/active.json
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
