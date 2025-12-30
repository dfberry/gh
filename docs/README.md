# Docs index — when to read each file

This directory contains documentation, examples, and small utilities used by
maintainers and users of the repository-cleanup tooling. Below is a short
guide explaining what each file is for and when you should open it.

- **blog-post.md**
  - Purpose: a user-facing writeup showing how to run the tooling and what it
    accomplishes. Useful when preparing a blog or short tutorial for readers.
  - When to read: when you want a narrative overview, example commands, or
    copy to adapt for a blog post or README excerpt.

- **DESCRIBE_USAGE.md**
  - Purpose: detailed usage notes for the describe commands (LLM-driven
    descriptions/topics). Contains examples, flags, and input/output formats.
  - When to read: when you need to understand `describe-repo`/`describe-repos`
    command behavior, input JSON shapes, or how to run the LLM-driven steps safely.

- **GET-GITHUB-TOKEN.md**
  - Purpose: step-by-step instructions for creating a GitHub token with the
    right scopes for dry-runs and destructive operations.
  - When to read: before running the pipeline or configuring CI; required for
    anyone setting up credentials.

- **LLM_PROMPT_DESCRIBE_REPO.md**
  - Purpose: explains what the prompt contains, what the LLM sees, privacy
    concerns, and guidance for including extra files safely.
  - When to read: before enabling the describe step or adding more repo
    content to prompts; important for privacy and security review.

- **youtube-script.md**
  - Purpose: a short video script and sequence for a 3–4 minute demo of the
    tooling, showing key commands and safety notes.
  - When to read: when recording a short demo or preparing a walk-through video.

- **debug-llm-completion/**
  - Purpose: sample debug captures produced by the `--debug` feature. Contains
    example prompt files and provider responses for inspection.
  - When to read: when debugging LLM behavior or verifying exactly what was
    sent to the model (sensitive content may be present — do not share)

- **images/**
  - Purpose: image assets (placeholders) for docs and the blog post.
  - When to read: when assembling a site or replacing screenshots.

- **scripts/convert-images.sh**
  - Purpose: helper to convert SVG placeholders to PNG for publishing.
  - When to run: if your publishing toolchain needs PNGs instead of SVGs.

How to use these docs safely
- Always inspect `LLM_PROMPT_DESCRIBE_REPO.md` and the `debug-llm-completion`
  samples before running `--apply` or sharing debug outputs — prompts may
  contain private repository excerpts.
- Use `GET-GITHUB-TOKEN.md` to ensure tokens have minimal required scopes.

