Goal

Provide an LLM prompt to evaluate sanitized lockfile comparison outputs produced by `scripts/compare-lockfiles.js`.

Files to analyze (present in the repo when running this prompt):
- `package-lock.sanitized.committed.json` — sanitized committed lockfile baseline
- `package-lock.sanitized.generated.json` — sanitized generated lockfile after `npm install --package-lock-only`

Primary Tasks (exact instructions for the LLM)

1. Parse both JSON files and compute a structural diff.
2. Classify differences into categories:
   - metadata-only (safe to ignore)
   - dependency addition (new package present)
   - dependency removal
   - version change (package present in both, different version/resolution)
   - range/semver metadata change
   - peer/optional flag differences
3. For each changed package, produce a short record with fields:
   - name: package name or path key
   - changeType: one of [added, removed, updated, metadata-only]
   - from: previous value (string or object excerpt) or null
   - to: new value or null
   - reason: one-sentence explanation of the likely cause (e.g., upgraded via transitive update, peer metadata stripped by npm)
4. Produce counts: total added, removed, updated, metadata-only.
5. Produce a one-paragraph human summary of the significance and recommended action (commit lockfile, regenerate in CI environment, ignore, or investigate manually).
6. Generate a ready-to-post PR comment body that includes:
   - short explanation why lockfile changed
   - clear commands to fix (repo root `npm install`, `git add package-lock.json`, `git commit -m "Update package-lock.json"`, `git push`)
   - a collapsed section containing a compact diff or list of significant package changes (not full lockfile content).
7. Provide a machine-readable JSON output object (for automation) with keys:
   - summary: short text
   - counts: {added, removed, updated, metadataOnly}
   - changes: [ ...records from step 3... ]
   - recommendedAction: one of [commit-regenerate, ignore, investigate, run-ci-regenerate]
   - confidence: score 0.0-1.0

Formatting and Constraints

- Return the human summary as plain text (1 paragraph) and the PR comment body as Markdown.
- Return the machine-readable JSON as a JSON code block labeled "json".
- If differences are only metadata-only, explicitly state "metadata-only differences" and recommend ignoring the diff or regenerating lockfile with exact CI npm version if desired.
- Limit the change list in the PR comment to the top 25 most significant changes (by change type priority: removed/updated/added, then alphabetically).
- Avoid exposing raw large lockfile content; include examples or small excerpts only.

Scoring rubric (for evaluation)

- Relevance: 0-1 — Did the analysis focus on dependency-relevant differences (not noise)?
- Actionability: 0-1 — Are the recommended next steps clear and minimal?
- Correctness: 0-1 — Were added/removed/updated packages correctly identified?
- Confidence: 0-1 — Model-assigned confidence reflecting ambiguity in diffs.

Example expected outputs (short)

Human summary:
"Most differences are metadata-only (root name and peer flags). No dependency versions changed; it's safe to ignore, or run `npm install` with CI npm version to normalize metadata." 

PR comment (Markdown):
"**Lockfile out of sync** — please run `npm install` at the repo root and commit `package-lock.json`.

<details><summary>Significant changes</summary>

- `left-pad`: updated 1.0.0 -> 1.1.0
- `example-lib`: added

</details>

Commands to run:

```bash
npm install
git add package-lock.json
git commit -m "Update package-lock.json"
git push
```

Machine JSON (example):
```json
{
  "summary": "metadata-only",
  "counts": {"added":0, "removed":0, "updated":0, "metadataOnly":3},
  "changes": [],
  "recommendedAction": "ignore",
  "confidence": 0.9
}
```

Usage notes for automation

- The prompt expects the two sanitized JSON files to be available in the current working directory.
- Use the machine-readable JSON output to decide CI step outcomes: fail CI only when `counts.added+counts.removed+counts.updated > 0`.
- When the result is metadata-only, CI should produce a warning and upload the sanitized files for inspection rather than fail.


---

EOF