# Orchestrator Input Format

This document describes the accepted input formats for the `gather` and `change` orchestrator commands.

Supported formats

- JSON array of repo full names (preferred):

  ```json
  [
    "owner/repo",
    "owner2/repo2"
  ]
  ```

- Plain newline-delimited list (one `owner/repo` per line):

  ```text
  owner/repo
  owner2/repo2
  ```

Behavior

- Orchestrators accept an `--input` path that points to either format above.
- When a subcommand requires a specific input shape, the orchestrator will normalize the input to a temporary JSON file and pass that path to the subcommand.
- The sample input file provided at the repository root (`active-sample-repos.json`) is a valid JSON-array example.


Example

- `active-sample-repos.json` (root):
  ```json
  [
    "Azure-Samples/azure-sdk-for-js",
    "dfberry/gh-cleanup"
  ]
  ```

Runner scripts

- `./scripts/run-gather.sh` — convenience wrapper that invokes the CLI in dry-run mode using `--input`.
- `./scripts/run-change.sh` — convenience wrapper for the change orchestrator in dry-run mode.

Notes

- These orchestrators are designed for dry-run testing by default; destructive actions are gated behind `--yes`/`--force` forwarded explicitly from the orchestrator command line.
- Do not modify `./packages/github-rest` or `./packages/llm-completion` as part of orchestrator implementation.
