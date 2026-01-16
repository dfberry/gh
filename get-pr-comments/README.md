# get-pr-comments

A CLI and library to fetch all comments for a GitHub pull request using github-rest.

## Usage (CLI)

CLI usage

```
get-pr-comments <owner> <repo> <prNumber>
```

NPM usage

```
npm run start -- dfberry gh 16
```

Requires a GitHub token in the `GH_TOKEN` or `GITHUB_TOKEN` environment variable.

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
