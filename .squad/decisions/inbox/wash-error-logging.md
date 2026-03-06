# Decision: Pipeline Error Logging Pattern

**Author:** Wash (Solutions Dev)
**Date:** 2026-03-09
**Scope:** All pipeline solutions

## Context

Per-repo API errors (401/403/404) were silently swallowed during pipeline runs. Users had no way to know which repos failed or why without reading verbose console output.

## Decision

Each solution's core function collects errors into an optional `errors?: PipelineError[]` field on its result type. CLI layers write `{step}-errors.log` files when errors exist. The pipeline script checks for error logs after all steps and prints a summary.

## Key Details

- **PipelineError interface** defined per-solution (not shared package) since solutions are independent
- **Error categories:** auth, not_found, rate_limit, api_error, unknown — each with a human-readable fix suggestion
- **Fail-open preserved:** Errors are logged but don't stop the pipeline. Dedup in create-remediation-issues still creates issues on API error.
- **Error log format:** Plain text, not JSON — designed for quick human scanning
- **Error log locations:** Written to each solution's output directory (e.g., `generated/security-audit/security-audit-errors.log`)

## Impact

- All 4 pipeline solutions affected
- 286 existing tests still pass (optional field is backward-compatible)
- No new dependencies
