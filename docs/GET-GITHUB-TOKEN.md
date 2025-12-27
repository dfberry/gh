# Quickstart — gh-sdk

This quickstart lists simple prerequisites and commands to get the examples running (including creating a token usable by the scripts).

## Prerequisites

Open this repo in GitHub Codespaces or in a local Docker devcontainer so all prerequisites are already available. Or verify the following are installed:

- Node.js 22+ and npm
- GitHub CLI (`gh`) on PATH
- An account that is admin on the repositories you want to manage

## Create / obtain a token

You must provide a Personal Access Token (PAT) with the correct permissions for gh-cleanup to list, inspect and (optionally) delete or archive repositories. There are two recommended approaches.

Option A — use `gh` (recommended):

```bash
gh auth login -h github.com -s repo    # follow interactive prompts to authenticate the admin account
gh auth status                         # confirm you're logged in
```

Option B — create a PAT via GitHub web UI (recommended when you need a token file):

1. Go to GitHub → Settings → Developer settings → Personal access tokens.
2. Choose one of the following:

	 - Classic token (simpler): grant these scopes:
		 - repo (full control of private repositories) — required to list and inspect repos
		 - delete_repo — required to delete repositories (needed for destructive commands)
		 - admin:org (only if you need to manage org-level settings; optional)
	 - Fine‑grained token (preferred for least privilege):
		 - Select the target repository(ies) (or all repositories if needed).
		 - Under Repository permissions grant **Administration** (or equivalent repository admin rights) so the token can archive/delete repos. Also ensure read/write access to repository contents if you need to read files (README/languages).
		 - If operating across an organization, ensure the token is approved by the org (if required) and the selected repositories are included.

3. Copy the token and store it securely. To use with the examples, save it to a repo-root `.env` file:

    ```bash
    printf 'GH_TOKEN=%s\n' "PASTE_TOKEN_HERE" > .env
    ```

Important notes:
- If you plan only to run dry-runs (no deletes/archives), a token with repo read access is sufficient, but destructive commands require the additional delete/admin permissions.
- For organization-owned repos you must be an admin of those repos or have the token scoped to admin rights on them.
- Avoid committing tokens to git. Use the `.env` file or environment variables.

## Verify token scopes

After creating the token, verify scopes and effective permissions:

- Using `gh`:

    ```bash
    gh auth status
    ```

- Using the included helper (recommended):
    ```bash
    # the project's helper will validate the token and required scopes before destructive actions
    npm run start -w gh-cleanup -- remove-forks --out=generated/remove-forks.json
    ```

The CLI will print token scopes and warn if required scopes are missing. Destructive commands will not run unless the token has required privileges and you confirm with `--yes`.
