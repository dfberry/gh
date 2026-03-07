# Monorepo overview

This repository is a small monorepo with two primary packages and supporting docs:

- packages/github-rest: a lightweight GitHub REST client and reusable helpers (endpoints, pagination, permissions). See [packages/github-rest/README.md](packages/github-rest/README.md) for usage and exported helpers.
- packages/gh-cleanup: CLI tools that implement repository-cleanup features (commands: remove-forks, archive-stale-repos, delete-empty-repos, categorize-repos, summary, evaluate-actions). See [packages/gh-cleanup/README.md](packages/gh-cleanup/README.md) for CLI options and examples.

Docs and artifacts
- `generated/` contains example or generated markdown outputs (e.g., catalogs and summaries) produced by the CLI for site consumption. These are intended as the site/content inputs for `dfberry.github.io` or similar static sites. To place the `generated` folder at the root of the repo, use `../../generated`.
- `docs/GET-GITHUB-TOKEN.md` documents how to create a GitHub token with the right scopes for dry-run and destructive operations (delete/archive/update). Use this when preparing CI or local runs.
 - `scripts/` holds utility scripts used by maintainers — notably `scripts/run-all.sh` which runs the full pipeline (summary, categorize, delete-empty, remove-forks, archive-stale, describe-repos) in a safe, mostly dry-run flow and forwards `--apply` for destructive steps. When invoked via the npm wrapper scripts (`npm run run-all*`) the wrapper will create `./generated` and capture stdout/stderr to `./generated/run-all*.log` files.
- `.github/` contains repository-maintenance artifacts and CI/workflow definitions:
	- `.github/LLM_DESCRIBE_REPO_PROMPT.md`: the default LLM prompt template used by the `describe-repo`/`describe-repos` commands. The CLI will search upward for this file when `--prompt` isn't provided.
	- `.github/describe-files.json`: metadata used by repository tooling to enumerate or validate files that should be present in packages or the monorepo (used by CI or publishing scripts).
	- `.github/package-placement-rules.md`: guidance on where code/packages belong in the monorepo (helps contributors place new packages consistently).
	- `.github/copilot-instructions.md`: project-specific Copilot / AI assistant guidance for consistent code suggestions, testing, and style rules.
	- `.github/ISSUE_TEMPLATE/`: issue templates to help contributors file useful issues (e.g., `outdated-actions.md` documents reporting of outdated GH Actions).
	- `.github/workflows/`: GitHub Actions workflows for CI, release, and site publishing. Examples in this repo include:
		- `describe-repo.yml`: a workflow that can run the `describe-repos` command in CI (useful for scheduled content generation or audits).
		- `gh-sdk-ci.yml`: CI for the `github-rest` package.
		- `update-site.yml`: a workflow that pushes generated site artifacts (from `generated/`) to a target repo using a deployment token.

- Other support files:
	- `README.replace.md`, `docs/` and `generated/` contain content and scripts used to assemble the static site content; treat them as source assets for publishing.

If you want, I can also add short links from `packages/gh-cleanup/README.md` to the `.github/LLM_DESCRIBE_REPO_PROMPT.md` and the `scripts/run-all.sh` examples so users discover them faster.

## Solutions Pipeline

The **six solutions** work together in an orchestrated pipeline for automated GitHub repository health analysis and remediation:

1. **security-audit-repos** — Security vulnerability scanning (P0)
2. **sample-health-check** — Repository health scoring across 7 dimensions (P0)
3. **create-remediation-issues** — Auto-create GitHub issues for findings (P1)
4. **pr-feedback-aggregator** — Aggregate PR review patterns + LLM analysis (P1)
5. **azure-best-practices-check** — Azure SDK/IaC/CI/config/security scoring (P2)
6. **sample-auto-fix** — Automated remediation: creates branches, writes fixes, opens PRs (P2)

### Quick start

```bash
# Build everything
npm ci && npm run build

# Run the full 6-step pipeline (dry-run by default)
node scripts/run-pipeline.mjs

# Or via npm script:
npm run pipeline

# Apply destructive operations (creates issues + PRs)
npm run pipeline:apply
```

All output goes to `generated/{solution-name}/` with timestamped JSON reports.

### Prerequisites

- Node.js >= 22
- A `.env` file at the repository root with `GITHUB_TOKEN` or `GH_TOKEN` set
- For pr-feedback-aggregator: also requires `OPENAI_API_KEY` or compatible LLM endpoint in `.env`
- Run `npm ci && npm run build` to install dependencies and compile TypeScript

### The six solutions

| Step | Solution | Purpose | Output |
|------|----------|---------|--------|
| 1 | **Security Audit** | Scan security posture (Dependabot, code scanning, secrets, branch protection) — scores 0-100 | `security-audit/{timestamp}-audit.{json,md}` |
| 2 | **Sample Health Check** | Multi-dimension health analysis (Documentation, CI/CD, Dependencies, Activity, Hygiene, Azure, Branch Protection) — grades A–F | `sample-health-check/{timestamp}-health.{json,md}` |
| 3 | **Create Remediation Issues** | Extract actionable findings from steps 1–2 and create GitHub Issues with deduplication | `remediation-issues/{timestamp}-issues.json` |
| 4 | **PR Feedback Aggregator** | Fetch PR comments, identify patterns via LLM, generate actionable recommendations | `pr-feedback-aggregator/{timestamp}-feedback.json` |
| 5 | **Azure Best Practices** | Score Azure patterns: SDK usage, IaC/Bicep, CI/CD config, security — 15 rules across 5 dimensions | `azure-best-practices/{timestamp}-check.json` |
| 6 | **Sample Auto-Fix** | Create branches and PRs with auto-fixes for security, health, and Azure findings — includes 6-layer safety model | `sample-auto-fix/{timestamp}-fixes.json` |

For detailed documentation, see [docs/PIPELINE.md](docs/PIPELINE.md).

The six solutions include 300+ tests ensuring reliable operation across varied repository configurations.

## Functional specification

This section describes the key functionality for the repository-cleanup tooling and the expected behaviors for each tool. It's a concise spec to guide implementation, testing, and safe operation.

- **Remove forks**: Identify repositories that are forks and are owned by the authenticated user. Provide a dry-run listing with metadata (name, full_name, parent, last_push, size, topics). Support an interactive or non-interactive deletion mode. Safety: default to dry-run; require `--yes` to perform deletions and `--force` to skip the final typed confirmation.

- **Archive old repositories**: Find repositories with no code or issue activity for a configurable threshold (default 365 days). Provide options to filter by org/user, exclude forks or archived repos, and produce a report before archiving. Safety: default to dry-run; require `--yes` to PATCH the repo to archived=true.

- **Remove empty repositories**: Detect repos that are effectively empty using three checks: `size === 0` in repo metadata, no commits (commits API returns 409 or empty), and no open pull requests. Provide a dry-run list and optionally delete. Safety: default dry-run; `--yes` plus interactive confirmation or `--force` to skip typing the confirmation string.

- **Categorize remaining repositories**: Run lightweight analysis per-repo to assign categories (e.g., library, cli, infra, docs, sample). Use heuristics such as language, topics, README presence, package manifests, and last activity. Emit structured output linking repositories to category tags and confidence scores.

- **Generate repository descriptions & topics (LLM):** Use a configured LLM chat model with a prompt template to generate a short and long description, suggested topics, and useful links for a repository. This is implemented via the `describe-repo` and `describe-repos` commands. The action defaults to dry-run; provide `--apply` to PATCH repository descriptions and update topics. Supported flags include `--openai-key=`, `--prompt=`, and `--out=`.

- **Generate Markdown table for dfberry.github.io**: From categorized results, generate a markdown table with columns: Name, Description, Topics, Language, Category, Last Updated, Link.

- **Summary command**: a `summary` command/feature produces aggregated summaries of repositories (counts, categories, and other high-level metrics) used by the CLI and reporting tools.

## Example commands

Run one example command per main feature (uses the npm wrapper to run the package CLI):

- Summary (initial active list + summary Markdown — matches `scripts/run-all.sh` step 1):

```bash
npm run start -w gh-cleanup -- summary --output=md --out=../../generated/initial-active.md --summary-out=../../generated/initial-summary.md
```

- Switches used:
	- `--output=md`: output format for the active list (`md` or `json`).
	- `--out=...`: destination file for the active list output.
	- `--summary-out=...`: write the full summary Markdown including counts and the active table.
	- `--older-than-days=<n>`: change stale cutoff (default 365).
	- `--allow-forks`: include forks when computing stale/empty/archived sets.
	- `--verify`: perform extra metadata checks (slower) to verify stale/empty status.

- Categorize repositories (fetch languages + README and output Markdown — matches `scripts/run-all.sh` step 2):

```bash
npm run start -w gh-cleanup -- categorize-repos --fetch --output=md --out=../../generated/catalog.md
```

- Switches used:
	- `--fetch`: fetch repository languages and README to improve categorization.
	- `--output=md|json`: choose Markdown or JSON output.
	- `--out=...`: destination file for the catalog output.
	- `--rules=path`: optional rules file to override default categorization heuristics.

- Delete empty repositories (dry-run or apply — matches `scripts/run-all.sh` step 3):

Dry-run:
```bash
npm run start -w gh-cleanup -- delete-empty-repos --out=../../generated/delete-empty.json
```

Apply (destructive):
```bash
npm run start -w gh-cleanup -- delete-empty-repos --yes --out=../../generated/delete-empty.json
```

- Switches used:
	- `--yes`: perform the destructive action (delete) instead of a dry-run.
	- `--force`: skip interactive typed confirmation.
	- `--allow-forks`: include forks in the scan.
	- `--out=...`: write the plan or results to a file.
	- `--no-audit`: omit permission details from the output.

- Remove forks (dry-run or apply — matches `scripts/run-all.sh` step 4):

Dry-run:
```bash
npm run start -w gh-cleanup -- remove-forks --out=../../generated/remove-forks.json
```

Apply (destructive):
```bash
npm run start -w gh-cleanup -- remove-forks --yes --out=../../generated/remove-forks.json
```

- Switches used:
	- `--yes`: actually delete matched forked repos.
	- `--force`: skip interactive confirmation.
	- `--out=...`: write dry-run or action details to a file.
	- `--no-audit`: omit permission/audit details.

- Archive stale repositories (dry-run or apply — matches `scripts/run-all.sh` step 5):

Dry-run (default cutoff 365 days):
```bash
npm run start -w gh-cleanup -- archive-stale-repos --out=../../generated/stale.json
```

Apply (archive matched repos):
```bash
npm run start -w gh-cleanup -- archive-stale-repos --older-than-days=365 --yes --out=../../generated/stale.json
```

- Switches used:
	- `--older-than-days=<n>`: threshold for inactivity (days).
	- `--yes`: perform the archival PATCH.
	- `--allow-forks`: include forks.
	- `--out=...`: write the list of matched repos.

- Produce active list JSON (used by the run-all pipeline before describing repos):

```bash
npm run start -w gh-cleanup -- summary --output=json --out=../../generated/active.json
```

- Switches used:
	- `--output=json`: produce machine-readable JSON instead of Markdown.
	- `--out=...`: destination JSON file.

- Describe repositories (LLM-driven, matches `scripts/run-all.sh` describe step):

Dry-run against active JSON:
```bash
npm run start -w gh-cleanup -- describe-repos --repos=../../generated/active.json --out=../../generated/descriptions.json
```

Apply LLM suggestions to repos (if you want descriptions/topics applied to GitHub):
```bash
npm run start -w gh-cleanup -- describe-repos --repos=../../generated/active.json --out=../../generated/descriptions.json --apply
```

Switches used:
	- `--repos=FILE` (alias `--input=FILE`): input JSON file with the active list (array or object shapes supported).
	- `--out=FILE`: write aggregated AI outputs (JSON or `.md` inferred by extension).
	- `--prompt=PATH`: override the prompt template file (otherwise searches upward for `.github/LLM_DESCRIBE_REPO_PROMPT.md`).
	- `--openai-key=KEY`: supply OpenAI key; otherwise `OPENAI_API_KEY` env var is used.
	- `--apply`: PATCH repository description and update topics on GitHub (destructive; requires `GH_TOKEN` with repo permissions).

	- Evaluate GitHub Actions workflows (dry-run):
	```bash
	npm run start -w gh-cleanup -- evaluate-actions --out=../../generated/actions.json
	```

Debugging LLM calls
- The describe commands support optional debug flags to record prompts and provider responses for inspection:
	- `--debug`: enable debug recording.
	- `--debug-dir=<path>`: directory to write debug files (input prompt and full response JSON).
	- These map to the `LLMConfig.debug` settings passed to the LLM client; callers may also enable debugging programmatically.

## Command signature convention (developer note)

Commands follow a small, consistent calling convention to support both standalone CLI usage and orchestrated group runs.

- CLI: creates a single `GitHubClient` and calls the top-level `runCommand(name, argv, client?)` helper. The CLI is the single place that should call `getGitHubClient()` for grouped runs.
- `runCommand` (top-level command dispatcher): forwards the optional `client` to the command module wrapper. It may be invoked without a `client` for standalone testing.
- Wrapper (module CLI entry): accepts `(argv: string[], client?: GitHubClient)` — parses `argv` into `args` and may validate flags. The wrapper should forward the `client` into the implementation call.
- Implementation (`runCommand` inside the module): accepts `(client?: GitHubClient, args: ParsedArgs)` — contains the command logic and should handle a missing `client` when appropriate (for read-only or test modes).

Flow example:

1. CLI creates a single `client` and calls: `await runCommand(cmd, childArgv, client)`.
2. The dispatcher forwards the `client` and calls the module wrapper: `await module.wrapper(childArgv, client)`.
3. The wrapper parses `childArgv` to `args` and calls the module's implementation: `await runCommand(client, args)`.

This keeps a single `getGitHubClient()` call for grouped runs while preserving the ability to run commands standalone without a client.


## Generate repo descriptions and topics

You can generate short descriptions and topic lists for repositories using an LLM-driven CLI command implemented in [packages/gh-cleanup/src/commands/describe-repo.ts](packages/gh-cleanup/src/commands/describe-repo.ts). The LLM prompt template is at [./.github/LLM_DESCRIBE_REPO_PROMPT.md](.github/LLM_DESCRIBE_REPO_PROMPT.md).

Prerequisites:

- A `.env` file at the repository root or equivalent environment variables set. Example `samples.env` snippet:

```ini
GH_TOKEN=
GH_USER=YOUR_GITHUB_USER_NAME
OPENAI_API_KEY=
OPENAI_ENDPOINT=https://RESOURCE-NAME.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=API_VERSION
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TEMPERATURE=0.2
```

Variable descriptions:

- `GH_TOKEN` / `GITHUB_TOKEN`: a GitHub personal access token (PAT) used by the CLI to read and modify repositories. For destructive operations (delete/archive/update topics) the token must have appropriate repo/admin scopes; for read-only operations a token with `repo` or read scopes is sufficient.
- `GH_USER`: your GitHub username. Used for readability in outputs and to filter owned repositories in summaries.
- `OPENAI_API_KEY`: API key for OpenAI (or compatible) services used by the LLM-driven `describe-*` commands. If omitted you can pass `--openai-key=` on the CLI.
- `OPENAI_ENDPOINT`: (optional) full endpoint URL for Azure OpenAI or other hosted endpoints when not using the default OpenAI API base. Example value is the Azure-style chat completions endpoint with deployment and api-version.
- `OPENAI_MODEL`: (optional) the model/deployment identifier to use for generation (e.g., `gpt-4.1-mini`). When omitted a sensible default is used by the LLM client.
- `OPENAI_TEMPERATURE`: (optional) sampling temperature for LLM completions (0-1 scale). Lower values produce more deterministic results; higher values increase creativity.

Debugging LLM calls
- The describe commands support optional debug flags to record prompts and provider responses for inspection:
	- `--debug`: enable debug recording.

	## CI / Build recommendations

	This repository uses a TypeScript project-reference build. Recommended workflow:

	- Node: >=22 (CI uses Node 22).
	- npm: >=7 (recommended for workspace behavior and `npm ci`).

	Local/CI build commands:

	```bash
	npm ci
	npm run build
	```

	`npm run build` executes `tsc -b` from the repository root to perform an incremental project-reference build across packages. Ensure `package-lock.json` is committed and CI runs `npm ci` for deterministic installs.

	If you plan to publish packages, build outputs are emitted to each package's `dist/` directory and packages export their compiled entry points from `dist/`.
	- `--debug-dir=<path>`: directory to write debug files (input prompt and full response JSON).
	- These map to the `LLMConfig.debug` settings passed to the LLM client; callers may also enable debugging programmatically.

Notes:

- When running commands that modify repositories (e.g., `--yes`, `--apply`), ensure `GH_TOKEN` has the necessary permissions and consider running a dry-run first.
- `OPENAI_ENDPOINT` and `OPENAI_MODEL` are primarily for Azure OpenAI customers; the CLI will fall back to the public OpenAI API unless overridden.

## Updating `package-lock.json`

- This repository uses npm workspaces with a single root `package-lock.json` that records all workspace dependencies.
- When you add, remove, or change dependencies in any workspace `package.json`, update the lockfile at the repository root by running:

```bash
npm install
git add package-lock.json
git commit -m "Update package-lock.json"
```

- In CI the workflow runs `npm ci` at the repository root. If a PR changes `package.json` without updating `package-lock.json` the build will fail with a clear message. Run `npm install` locally to update the lockfile and push the change to fix the CI failure.


Single repo (dry-run):

```bash
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

## Run all scripts

Using the `run-all.sh` script

- The `scripts/run-all.sh` helper will run the describe step only when an OpenAI key is available in the environment (`OPENAI_API_KEY`).
- If you run `scripts/run-all.sh --apply` the script forwards `--apply` to the `describe-repos` command so the LLM-generated descriptions/topics will be applied to each repository. Without `--apply` the describe step runs in dry-run mode and will not modify repositories.

Example (run-all dry-run):

```bash
./scripts/run-all.sh
```

Example (apply changes and allow the describe step to write updates):

```bash
./scripts/run-all.sh --apply
```

## Common switches

These switches are used across the CLI commands (examples above and `scripts/run-all.sh`):

