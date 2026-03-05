# sample-health-check

Comprehensive health analyzer for GitHub sample repositories. Measures documentation quality, CI/CD presence, dependency freshness, maintenance activity, branch protection, and Azure-specific signals to produce a 0–100 health score.

Complements `security-audit-repos` (which focuses on vulnerabilities); this solution answers "is this sample repo well-maintained and developer-friendly?"

## Purpose

Scans repositories across 7 health dimensions (25 individual signals) and produces a scored report:

| Dimension | Points | What it measures |
|-----------|--------|------------------|
| Documentation Quality | 25 | README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT |
| CI/CD Presence | 20 | Workflows, recent runs, pass status |
| Dependency Freshness | 16 | Dependabot critical/high alerts, auto-fix enabled |
| Activity & Maintenance | 16 | Recent commits, pushes, manageable issues, releases |
| Repository Hygiene | 12 | .gitignore, description, topics, archive status, default branch |
| Azure Sample-Specific | 7 | Azure topics, language tags, description mentions Azure |
| Branch Protection | 5 | Default branch protection rules |

**Total: 100 points**

## Scoring Model

Additive: start at 0, award points for healthy signals (normalized to 0–100).

| Grade | Score Range | Meaning |
|-------|-------------|---------|
| A | 90–100 | Excellent — well-maintained sample |
| B | 75–89 | Good — minor gaps |
| C | 50–74 | Fair — needs attention |
| D | 25–49 | Poor — significant maintenance debt |
| F | 0–24 | Critical — likely abandoned or misconfigured |

## Installation

```bash
cd solutions/sample-health-check
npm install
npm run build
```

## Usage

### CLI

```bash
# Default: reads active-sample-repos.json, writes to generated/sample-health-check/
npm start

# Custom input and output
sample-health-check --input repos.json --out reports/health

# Output format
sample-health-check --format json       # JSON only
sample-health-check --format markdown   # Markdown only
sample-health-check --format both       # Both (default)

# Verbose logging
sample-health-check --verbose

# Full example
sample-health-check --input active-sample-repos.json --out generated/sample-health-check --format both --verbose
```

### From repo root

```bash
npm run sample-health-check
```

### Library

```typescript
import { checkRepoHealth, checkReposHealth, generateHealthSummary } from 'sample-health-check';
import { GitHubClient } from 'github-rest';

const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });

// Single repo
const result = await checkRepoHealth(client, 'Azure-Samples', 'my-app', { verbose: true });
console.log(`Health score: ${result.score}/100 (${result.grade})`);

// Multiple repos
const report = await checkReposHealth(client, ['org/repo1', 'org/repo2'], { verbose: true });

// Generate markdown summary
const summary = generateHealthSummary(report);
console.log(summary);
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes (primary) | GitHub personal access token with repo access |
| `GH_TOKEN` | Fallback | Used if `GITHUB_TOKEN` is not set |

```bash
cp sample.env .env
# Edit .env and add your token
```

### Input Format

JSON array of `owner/repo` strings:

```json
[
  "Azure-Samples/azure-sdk-for-js-docs",
  "dfberry/gh"
]
```

## Output

### JSON (`{timestamp}-health.json`)

```json
{
  "repos": [
    {
      "owner": "Azure-Samples",
      "repo": "my-app",
      "checkedAt": "2026-03-06T10:00:00Z",
      "score": 85,
      "grade": "B",
      "checks": [
        {
          "dimension": "documentation",
          "signal": "readme_exists",
          "passed": true,
          "weight": 5,
          "earned": 5,
          "detail": "README.md found"
        }
      ],
      "dimensions": {
        "documentation": { "earned": 20, "possible": 25, "passRate": 0.8 }
      }
    }
  ],
  "summary": {
    "totalRepos": 2,
    "avgScore": 72,
    "avgGrade": "C",
    "gradeDistribution": { "A": 0, "B": 1, "C": 1, "D": 0, "F": 0 },
    "worstDimension": "ci_cd",
    "timestamp": "2026-03-06T10:00:00Z"
  }
}
```

### Markdown (`{timestamp}-health.md`)

Sorted by score (lowest first) with dimension tables and failing check lists.

## Architecture

```
src/
├── checks.ts    # 25 pure check functions (no API calls)
├── scoring.ts   # Weight constants, grade calculation, dimension summaries
├── index.ts     # Orchestration: fetch → check → score
└── cli.ts       # CLI entry point
```

- **checks.ts** — Pure functions: `(data) → CheckResult`. One per signal. No API calls.
- **scoring.ts** — Isolated scoring logic. Weights are constants, not buried in checks.
- **index.ts** — Fetches all data via `Promise.allSettled` (graceful degradation), runs checks, scores results.
- **cli.ts** — Follows the `security-audit-repos` CLI pattern exactly.

## Error Handling

- Uses `Promise.allSettled` — a 404 on one endpoint doesn't crash the entire check.
- When an endpoint is unavailable, that check fails (no points awarded).
- Invalid repo names are skipped with a warning.
- Sequential repo processing for rate-limit safety.

## Dependencies

- `github-rest` — GitHub REST API client from this monorepo

## Related Solutions

- `security-audit-repos` — Security posture scanner (P0)
- `create-remediation-issues` — Automated work item creator (P1)
- `pr-feedback-aggregator` — Cross-PR pattern analyzer (P1)

## Contributing

Follows monorepo patterns — see `.github/copilot-instructions.md`.

## License

Part of the gh monorepo.
