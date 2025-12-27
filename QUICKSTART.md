# Quickstart — gh-sdk

This quickstart lists simple prerequisites and commands to get the examples running (including creating a token usable by the scripts).

## Prerequisites

Open this repo in GitHub Codespaces or in a local Docker devcontainer so all prerequisites are already available. Or verify the following are installed:

- Node.js 22+ and npm
- GitHub CLI (`gh`) on PATH
- An account that is admin on the repositories you want to manage

## Create / obtain a token
Option A — use `gh` (recommended):

```bash
gh auth login -h github.com -s repo  # follow interactive prompts to authenticate the admin account
gh auth status     # confirm you're logged in
# the helper script below will call `gh auth token` and write it to the env-file
```

Option B — create a PAT via GitHub web UI:

1. Settings → Developer settings → Personal access tokens → Generate token (classic) or Fine‑grained token
2. For classic tokens: grant `repo` (full control) and any admin/delete scopes. For fine-grained tokens: grant repository Admin/Administration where deletion is allowed.
3. Save the token and write it to the repo-root `.env` file (preferred):

```bash
printf 'GH_TOKEN=%s\n' "PASTE_TOKEN_HERE" > .env
```

## Helper: obtain token and run an example
Use the included helper which uses the `gh` CLI to capture your token and run an example:

- Script: [packages/gh/scripts/gh-prepare-and-run.mjs](packages/gh/scripts/gh-prepare-and-run.mjs#L1)

```bash
cd packages/gh
node ./scripts/gh-prepare-and-run.mjs            # writes repo-root .env (or packages/gh/examples/.env fallback) and runs the default example
# or run the npm helper
npm run examples:create-and-run --prefix packages/gh
```

## Examples (safe first: dry-runs)
- List active repos:

```bash
cd packages/gh
node ./examples/list-active-repos.mjs
```

- Count active repos and write JSON to `generated/`:

```bash
node ./scripts/count-repos.mjs --out-dir=../../generated --json
```

- Preview empty repos (dry-run):

```bash
node ./examples/delete-empty-repos.mjs
```

- Actually delete empty repos (destructive):

```bash
node ./examples/delete-empty-repos.mjs --yes
# use --force to skip the interactive `delete` confirmation
```

## Generated outputs
- Default generated directory: `generated/` at repo root. The indexer and categorizer write JSON there (see `packages/gh/scripts/index-all-repos.mjs`).
- The repo table generator writes `generated/dfberry-repos.md` when run:

```bash
node /workspace/scripts/generate-repo-table.mjs
```

## Safety notes
 - Deleting repositories is irreversible. Always run dry-runs, verify the repo-root `.env` (or `packages/gh/examples/.env`) contains a token for an admin account, and verify `.permissions.admin` via the API before deleting.
- For verification commands see the README and the helper scripts in [packages/gh/scripts](packages/gh/scripts/index-all-repos.mjs#L1).

## Where to look in this repo
- Examples: [packages/gh/examples](packages/gh/examples#L1)
- Scripts: [packages/gh/scripts](packages/gh/scripts#L1)
- Helpers: [packages/gh/scripts/gh-prepare-and-run.mjs](packages/gh/scripts/gh-prepare-and-run.mjs#L1)
