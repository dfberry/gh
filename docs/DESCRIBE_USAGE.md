# Generate repo descriptions (describe-repo)

This document explains how to run the `gh-cleanup` `describe-repo` command to generate short descriptions and topics for repositories using the workspace LLM helper.

## Prerequisites

- Set a GitHub token in `GH_TOKEN` or `GITHUB_TOKEN` with repo scope.
- Set an OpenAI API key in `OPENAI_API_KEY` (or pass `--openai-key=` to the command).

## Single repo (dry-run)

```bash
export GH_TOKEN="ghp_..."
export OPENAI_API_KEY="sk-..."
npm run start -w gh-cleanup -- describe-repo --repo=owner/repo
```

## Apply changes (update description & topics)

```bash
npm run start -w gh-cleanup -- describe-repo --repo=owner/repo --apply
```

## Batch run against the active list

The active repository list is in [generated/active.md](../generated/active.md). To run the command for every owner/repo found in that file (dry-run):

```bash
grep -Eo '[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' generated/active.md | sort -u | xargs -n1 -I{} npm run start -w gh-cleanup -- describe-repo --repo={} 
```

To apply changes for each repository, add `--apply` to the end of the command above.

Optional OpenAI CLI flags supported: `--openai-key=`, `--openai-model=`, `--openai-temp=`, `--openai-endpoint=`.

## Notes

- The LLM prompt template used by the command is at [.github/LLM_DESCRIBE_REPO_PROMPT.md](../.github/LLM_DESCRIBE_REPO_PROMPT.md).
- The implementation is in [packages/gh-cleanup/src/commands/describe-repo.ts](../packages/gh-cleanup/src/commands/describe-repo.ts).
- The command prints validated JSON to stdout containing `short_description`, `long_description`, `topics`, and `links`. When run with `--apply` it will PATCH the repository description and update topics (up to 20).
