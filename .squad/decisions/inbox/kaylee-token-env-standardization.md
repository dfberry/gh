# Token Env Var Standardization (Kaylee — 2026-03-05)

**Context:** Mal's code review flagged that `security-audit-repos` only checked `GITHUB_TOKEN`, while other solutions check both `GH_TOKEN` and `GITHUB_TOKEN`.

**Decision:** Standardize on `GITHUB_TOKEN || GH_TOKEN` (GITHUB_TOKEN primary, GH_TOKEN fallback) for all solution CLI entry points.

**Rationale:** `GITHUB_TOKEN` is the GitHub Actions default. `GH_TOKEN` is the GitHub CLI default. Supporting both reduces developer friction and matches the pattern already used in `get-pr-comments`, `get-user-comments`, and `move-between-repos`.

**Applied to:** `solutions/security-audit-repos/src/cli.ts`

**Future:** New solutions should follow the same dual-check pattern in their CLI entry points.
