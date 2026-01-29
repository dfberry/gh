# get-pr-comments

A CLI and library to fetch all comments for a GitHub pull request using github-rest.

## Usage (CLI)

CLI usage

```bash
get-pr-comments <owner> <repo> <prNumber> [username]
```

- `owner`: Repository owner
- `repo`: Repository name
- `prNumber`: Pull request number
- `username` (optional): Filter comments by this GitHub username

NPM usage

```bash
# Get all comments
npm run start -- dfberry gh 16

# Filter comments by username
npm run start -- dfberry gh 16 copilot
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

// Get all comments
const allComments = await fetchPRComments('owner', 'repo', 123);
console.log(allComments);

// Filter comments by username
const userComments = await fetchPRComments('owner', 'repo', 123, 'username');
console.log(userComments);

// Filter comments by username with a token
const userCommentsAuth = await fetchPRComments('owner', 'repo', 123, 'username', 'ghp_...');
console.log(userCommentsAuth);
```

## Output

Returns an object:
- `issueComments`: Array of general comments on the PR
- `reviewComments`: Array of code review comments
