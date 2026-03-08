# azure-best-practices-check

Azure best practices analyzer for GitHub sample repositories. Scores Azure SDK usage, IaC quality, CI/CD configuration, environment config, and security patterns across 15 rules spanning 5 dimensions. Outputs 0-100 scores with actionable recommendations.

## Purpose

Validates Azure-specific coding and configuration practices across sample repositories:

- **Azure SDK Usage (25 pts):** Modern @azure/ packages, identity management, TypeScript support
- **IaC Quality (25 pts):** Bicep/Terraform presence, parameterization, no hardcoded secrets
- **Configuration (15 pts):** Azure Developer CLI (azd), .env.example, security policy
- **CI/CD (20 pts):** Federated auth (no hardcoded creds), current GitHub Actions versions
- **Security (15 pts):** No connection strings in code, managed identity documentation

Each repository receives a 0-100 score and grade (A-F) based on weighted rule results.

## Scoring Model

Additive scoring — start at 0, earn points for passing checks:

| Grade | Score Range | Meaning |
|-------|-------------|---------|
| A | 85-100 | Excellent — production-ready Azure patterns |
| B | 70-84 | Good — minor gaps |
| C | 55-69 | Fair — needs improvement |
| D | 40-54 | Poor — significant issues |
| F | 0-39 | Critical — missing key practices |

**Dimension Weights:**
- Azure SDK Usage: 25 points
- IaC Quality: 25 points
- CI/CD: 20 points
- Configuration: 15 points
- Security: 15 points

Total: 100 points

## Installation

```bash
cd solutions/azure-best-practices-check
npm install
npm run build
```

## Usage

### CLI

```bash
# Default: reads active-sample-repos.json
npm start

# Custom input
azure-best-practices-check --input repos.json

# Custom output directory
azure-best-practices-check --input repos.json --out reports/azure-bp

# Output format options
azure-best-practices-check --format json       # JSON only
azure-best-practices-check --format markdown   # Markdown only
azure-best-practices-check --format both       # Both (default)

# Verbose mode
azure-best-practices-check --verbose

# Dry-run (analyze without writing)
azure-best-practices-check --dry-run
```

### From repo root

```bash
npm run azure-best-practices-check
```

### Library

```typescript
import { checkReposBestPractices, generateMarkdownReport } from 'azure-best-practices-check';
import type { CheckOptions } from 'azure-best-practices-check';
import { GitHubClient } from 'github-rest';

const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });

const repos = ['Azure-Samples/azure-functions-nodejs', 'Azure-Samples/azure-sdk-for-js'];
const options: CheckOptions = { verbose: true };

const report = await checkReposBestPractices(client, repos, options);

console.log(`Average score: ${report.summary.avgScore}/100`);
console.log(`Grade distribution: ${JSON.stringify(report.summary.gradeDistribution)}`);

const markdown = generateMarkdownReport(report);
console.log(markdown);
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes (primary) | GitHub personal access token with repo access |
| `GH_TOKEN` | Fallback | Used if `GITHUB_TOKEN` is not set |

```bash
cp sample.env .env
# Edit .env and add your GitHub token
```

### Input Format

JSON array of `owner/repo` strings:

```json
[
  "Azure-Samples/azure-functions-nodejs",
  "Azure-Samples/azure-sdk-for-js-docs"
]
```

## CLI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--input` | string | `active-sample-repos.json` | Path to JSON file with repo list |
| `--out` | string | `generated/azure-best-practices` | Output directory |
| `--format` | string | `both` | Output format: `json`, `markdown`, or `both` |
| `--verbose` | flag | `false` | Enable detailed logging |
| `--dry-run` | flag | `false` | Analyze without writing output |

## Output

### JSON Report (`{timestamp}-check.json`)

```json
{
  "repos": [
    {
      "owner": "Azure-Samples",
      "repo": "my-app",
      "checkedAt": "2024-01-15T10:30:00Z",
      "score": 72,
      "grade": "B",
      "filesAnalyzed": ["package.json", "infra/main.bicep", ".github/workflows/deploy.yml"],
      "checks": [
        {
          "dimension": "azure-sdk",
          "signal": "azure-identity-present",
          "passed": true,
          "severity": "high",
          "weight": 8,
          "earned": 8,
          "detail": "@azure/identity present"
        },
        {
          "dimension": "iac",
          "signal": "iac-present",
          "passed": true,
          "severity": "high",
          "weight": 8,
          "earned": 8,
          "detail": "Found Bicep file: infra/main.bicep"
        },
        {
          "dimension": "security",
          "signal": "no-connection-strings-in-source",
          "passed": false,
          "severity": "high",
          "weight": 8,
          "earned": 0,
          "detail": "Found 2 connection strings in source files",
          "recommendation": "Replace hardcoded connection strings with environment variables or Azure Key Vault references"
        }
      ],
      "dimensions": {
        "azure-sdk": { "earned": 21, "possible": 25, "passRate": 0.84 },
        "iac": { "earned": 18, "possible": 25, "passRate": 0.72 },
        "config": { "earned": 10, "possible": 15, "passRate": 0.67 },
        "ci-cd": { "earned": 15, "possible": 20, "passRate": 0.75 },
        "security": { "earned": 8, "possible": 15, "passRate": 0.53 }
      }
    }
  ],
  "summary": {
    "totalRepos": 2,
    "avgScore": 68.5,
    "avgGrade": "C",
    "gradeDistribution": { "A": 0, "B": 1, "C": 1, "D": 0, "F": 0 },
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Markdown Report (`{timestamp}-check.md`)

Human-readable report with:
- Overview (total repos, average score, grade distribution)
- Per-repo details sorted by score (lowest first)
- Dimension tables with pass rates
- Failing checks with recommendations
- Files analyzed per repo

## 15 Rules Across 5 Dimensions

### Azure SDK Usage (25 points)

| Rule | Weight | Severity | What it checks |
|------|--------|----------|----------------|
| `azure-identity-present` | 8 | high | Repos using @azure/ packages must include @azure/identity |
| `no-deprecated-azure-sdk` | 7 | medium | No deprecated azure-* packages (e.g., azure-storage, ms-rest-azure) |
| `uses-modern-azure-sdk` | 6 | medium | Uses @azure/ scoped packages (SDK v2+) |
| `azure-types-present` | 4 | low | TypeScript projects with Azure SDKs should use TypeScript or have Azure devDeps |

### IaC Quality (25 points)

| Rule | Weight | Severity | What it checks |
|------|--------|----------|----------------|
| `iac-present` | 8 | high | Contains Bicep (.bicep), Terraform (.tf), or ARM (azuredeploy.json) files |
| `iac-no-hardcoded-secrets` | 10 | high | No secret literals (password, key, connectionString) in IaC files |
| `iac-parameterized` | 7 | medium | IaC files use parameters/variables (not hardcoded resource names) |

### Configuration (15 points)

| Rule | Weight | Severity | What it checks |
|------|--------|----------|----------------|
| `azd-yaml-present` | 6 | medium | Has azure.yaml (Azure Developer CLI config) |
| `env-example-present` | 5 | low | Has .env.example (documents required env vars) |
| `security-policy-present` | 4 | low | Has SECURITY.md (vulnerability reporting instructions) |

### CI/CD (20 points)

| Rule | Weight | Severity | What it checks |
|------|--------|----------|----------------|
| `workflow-federated-auth` | 8 | high | GitHub Actions workflows use federated auth (OIDC) |
| `workflow-no-hardcoded-creds` | 7 | high | No hardcoded credentials in workflow files |
| `workflow-current-actions` | 5 | medium | Uses current GitHub Actions versions (no v1/v2 actions) |

### Security (15 points)

| Rule | Weight | Severity | What it checks |
|------|--------|----------|----------------|
| `no-connection-strings-in-source` | 8 | high | No connection strings in .js/.ts source files |
| `managed-identity-documented` | 7 | medium | README mentions managed identity or DefaultAzureCredential |

## Architecture

```
src/
├── rules.ts      # 15 pure check functions (no API calls)
├── scoring.ts    # Weight constants, grade calculation, dimension summaries
├── index.ts      # Orchestration: fetch → check → score
└── cli.ts        # CLI entry point
```

- **rules.ts** — Pure functions: `(data) → CheckResult`. One per rule. No API calls.
- **scoring.ts** — Isolated scoring logic. Weights are constants (DIMENSION_WEIGHTS).
- **index.ts** — Fetches files via github-rest (package.json, IaC files, workflows), runs checks, scores results.
- **cli.ts** — Follows the `security-audit-repos` pattern.

## Error Handling

- Uses `Promise.allSettled` — a 404 on one file doesn't crash the check
- When a file is unavailable, checks that depend on it fail (0 points)
- Invalid repo names are skipped with a warning
- Sequential repo processing for rate-limit safety

## Dependencies

- `github-rest` — GitHub REST API client from this monorepo

## Related Solutions

- `security-audit-repos` — Security posture scanner (P0)
- `sample-health-check` — Repository health analyzer (P0)
- `create-remediation-issues` — Automated issue creator (P1)
- `pr-feedback-aggregator` — Cross-PR pattern analyzer (P1)
- `sample-auto-fix` — Automated PR creation for fixes (P2)

## Contributing

Follows monorepo patterns — see `.github/copilot-instructions.md`.

## License

Part of the gh monorepo.
