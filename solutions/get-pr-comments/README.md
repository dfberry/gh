# get-pr-comments

A CLI and library to fetch all comments for a GitHub pull request using github-rest.

## Usage (CLI)

CLI usage

```bash
get-pr-comments <owner> <repo> <prNumber>
```

NPM usage

```bash
npm run start -- dfberry gh 16
```

## Authentication

Requires a GitHub token in the `GH_TOKEN` or `GITHUB_TOKEN` environment variable. This is required for:
- Private repositories
- Higher API rate limits

Set the token before running:

```bash
# Option 1: Export directly
export GH_TOKEN=your_github_token
npm run start -- owner repo 123

# Option 2: Source from .env file
source .env && npm run start -- owner repo 123

# Option 3: Use gh CLI to get token
gh auth login
export GH_TOKEN=$(gh auth token)
npm run start -- owner repo 123
```

**Note:** If no token is provided and the repository is private, the command will return empty arrays without an error message.

## Usage (Library)

```ts
import { fetchPRComments } from 'get-pr-comments';

const comments = await fetchPRComments('owner', 'repo', 123, 'ghp_...');
console.log(comments);
```

## Output

Returns an object:
- `issueComments`: Array of general comments on the PR
- `reviewComments`: Array of code review comments
