# LLM Prompt: Describe Repo — behavior and guidance

This document explains what the `describe-repo` / `describe-repos` prompt contains, what the LLM will see, privacy and token considerations, and how to safely include additional files for richer prompts.

What the CLI currently includes in the prompt
- Repository metadata (name, description, topics, visibility, size, timestamps).
- The repository `README` content (when present and reachable via the GitHub API).
- The repository topic list (topics) and other small metadata fields returned by the API.

What the LLM does not automatically see
- The full repository file tree (source files, configs, secrets) is NOT included by default.
- Only the data explicitly fetched and concatenated into the prompt is sent to the LLM provider.

How files are fetched
- The CLI uses the GitHub API with the authenticated token (`GH_TOKEN`) to fetch README and topics.
- The token determines which repositories and files the runner can access (private repos require appropriate scopes and repository access).

Privacy and security
- Anything included in the prompt is transmitted to the configured LLM endpoint (OpenAI, Azure OpenAI, or another compatible endpoint). Do NOT include secrets, credentials, or other sensitive data in the prompt.
- For private repositories, be especially careful: including private source files in prompts shares their contents with the LLM provider and may violate policies or data residency requirements.

Token scopes and permissions
- To read private repo files you must supply a token that has read access to those repositories.
- To PATCH repository metadata (apply descriptions/topics) the `GH_TOKEN` must have write/admin privileges for that repo (classic PAT with `repo`/`delete_repo` scopes, or fine-grained token with write metadata scope).

Size, tokens, and truncation
- Large files or entire codebases may exceed token limits. Prefer including small, relevant excerpts (README, package.json, main entry points) instead of full source trees.

Including additional files (recommended safe approach)
- The CLI does not include arbitrary files by default. If you want richer context, prefer one of these patterns:
  - Manually fetch and add small files to the prompt bundle before calling `describe-repo` (edit the prompt template to include a placeholder and paste the excerpt).
  - Modify the CLI to accept an inclusion list (e.g., `--include=package.json,src/index.ts`) that fetches and appends only the listed files; only implement this after auditing which files are safe to share.

Debugging and inspection
- Use `--debug --debug-dir=<path>` when running `describe-*` to write the exact prompt sent to the LLM (and the provider's JSON response) to disk. Inspect these files to verify what content was sent.

Best practices
- Default to dry-run and inspect `generated/` outputs before applying changes.
- Limit prompt contents to non-sensitive, high-value files (README, package manifests, short code excerpts).
- Use the debug directory to validate what is being sent to external providers before enabling `--apply`.

Next steps
- If you want, we can add a safe `--include` flag that accepts a short list of manifest or source files and appends their contents to the prompt (with size guards and explicit opt-in). This should include warnings in the CLI and the docs.
