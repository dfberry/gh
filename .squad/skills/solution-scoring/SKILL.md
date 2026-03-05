---
name: "solution-scoring"
description: "Patterns for building weighted scoring models in solution packages"
domain: "solution-development"
confidence: "high"
source: "security-audit-repos (subtractive) + sample-health-check (additive) — two implementations of the same pattern"
---

## Context

Multiple solutions in this monorepo need to score repositories on different dimensions. This skill captures the reusable scoring architecture that emerged from `security-audit-repos` and `sample-health-check`.

## Patterns

### Scoring Architecture: Three-Layer Separation

Every scoring solution should split into three layers:

1. **Checks layer** (`checks.ts`) — Pure functions that evaluate a single signal. No API calls. Input is pre-fetched data, output is a `CheckResult`.
2. **Scoring layer** (`scoring.ts`) — Weights as constants, grade thresholds, score aggregation. No API calls, no check logic.
3. **Orchestration layer** (`index.ts`) — Fetches data via `github-rest`, passes to checks, passes results to scoring.

This separation makes each layer independently testable and allows weight adjustments without touching API or check logic.

### CheckResult Contract

Every check returns a uniform shape:

```typescript
interface CheckResult {
  dimension: string;    // category grouping (e.g., 'documentation', 'security')
  signal: string;       // specific check name (e.g., 'readme_exists', 'critical_dependabot')
  passed: boolean;
  weight: number;       // max points this check is worth
  earned: number;       // weight if passed, 0 if not
  detail?: string;      // human-readable context
}
```

### Two Scoring Models

**Subtractive (security-audit-repos):** Start at 100, deduct for problems found. Good for "baseline health with penalties."
```typescript
let score = 100;
score -= audit.dependabotAlerts.critical * 20;
// ...
return Math.max(0, score);
```

**Additive (sample-health-check):** Start at 0, award points for positive signals. Good for "how much is done right."
```typescript
const score = checks.reduce((sum, c) => sum + c.earned, 0);
```

Choose based on framing: "what's wrong?" → subtractive. "What's right?" → additive.

### Weight Budgets

Weights must sum to 100 for both models. Group weights by dimension:

| Dimension | Budget guidance |
|-----------|----------------|
| Critical controls (security, CI) | 15-25 points |
| Core documentation | 15-25 points |
| Maintenance activity | 10-15 points |
| Hygiene / nice-to-haves | 5-12 points |

### Grade Thresholds

Consistent across solutions:
| Range | Grade |
|-------|-------|
| 90-100 | A |
| 75-89 | B |
| 50-74 | C |
| 25-49 | D |
| 0-24 | F |

### Data Fetching Pattern

Always use `Promise.allSettled` for parallel API calls per repo:
```typescript
const [readmeResult, workflowsResult, ...] = await Promise.allSettled([
  repos.getRepoReadme(client, owner, repo),
  actions.listRepoWorkflows(client, owner, repo),
  // ...
]);
```

Handle each result independently — a failed API call means that signal is "not available," not that the whole repo audit fails.

### Dual Output

Every scoring solution produces:
- **JSON** (`{timestamp}-{context}.json`) — structured, machine-readable, enables trend tracking
- **Markdown** (`{timestamp}-{context}.md`) — human-readable, includes dimension tables and failing checks

Both generated from the same data. Never fetch data twice for different formats.

## Anti-Patterns

- **Mixing API calls and check logic** — Checks must be pure functions. API calls belong in the orchestration layer only.
- **Hardcoded weights inside check functions** — Weights are constants in `scoring.ts`. Checks don't know their own weight.
- **`Promise.all` for multi-endpoint fetches** — Use `Promise.allSettled`. A 404 on one endpoint must not crash the entire run.
- **Negative scores** — Always floor at 0 (`Math.max(0, score)`).
- **Weights that don't sum to 100** — Makes scores incomparable across solutions.

## Examples

```typescript
// checks.ts — pure function, no API calls
export function checkReadmeExists(readme: string | null): CheckResult {
  return {
    dimension: 'documentation',
    signal: 'readme_exists',
    passed: readme !== null && readme.length > 0,
    weight: 5,
    earned: (readme !== null && readme.length > 0) ? 5 : 0,
    detail: readme ? `README is ${readme.length} chars` : 'No README found'
  };
}
```

```typescript
// scoring.ts — weights and grades only
export const HEALTH_WEIGHTS = {
  readme_exists: 5,
  readme_quality: 5,
  license_exists: 5,
  // ...
} as const;

export function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 50) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}
```
