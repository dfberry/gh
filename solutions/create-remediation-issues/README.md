# create-remediation-issues

Automated GitHub issue creator from security audit and health check reports. Analyzes findings, deduplicates against existing issues, and creates actionable work items with configurable severity thresholds and labels.

## Purpose

Closes the remediation automation loop by converting security/health scan results into tracked GitHub issues:

- Signal-based findings (critical/high Dependabot alerts, code scanning, secret scanning, branch protection, automated fixes)
- Score-based findings (low security scores, low health grades)
- Deduplication against existing open issues (by exact title match)
- Configurable thresholds (security score, health grade)
- Dry-run by default for safety — requires explicit mode

## Installation

```bash
cd solutions/create-remediation-issues
npm install
npm run build
```

## Usage

### CLI

```bash
# Default: dry-run (analyze but don't create issues)
npm start -- --security-input security-audit.json --health-input health-check.json

# Custom output directory
create-remediation-issues --security-input reports/security.json --out generated/issues

# Live mode (creates issues on GitHub)
create-remediation-issues --security-input security.json --health-input health.json --apply

# With custom thresholds
create-remediation-issues --security-input security.json --security-score-threshold 60 --health-grade-threshold C

# Add custom labels
create-remediation-issues --security-input security.json --extra-labels high-priority,q1-2024

# Verbose logging
create-remediation-issues --security-input security.json --verbose
```

### From repo root

```bash
npm run create-remediation-issues
```

### Library

```typescript
import { createRemediationIssues } from 'create-remediation-issues';
import type { RemediationInput, RemediationOptions } from 'create-remediation-issues';
import { GitHubClient } from 'github-rest';
import { readFile } from 'node:fs/promises';

const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });

// Load reports
const securityReport = JSON.parse(await readFile('security-audit.json', 'utf-8'));
const healthReport = JSON.parse(await readFile('health-check.json', 'utf-8'));

const input: RemediationInput = {
  securityReport,
  healthReport,
};

const options: RemediationOptions = {
  dryRun: false, // Create issues
  securityScoreThreshold: 70,
  healthGradeThreshold: 'D',
  extraLabels: ['automated-remediation'],
  verbose: true,
};

const result = await createRemediationIssues(client, input, options);
console.log(`Created ${result.created.length} issues, skipped ${result.skipped.length} duplicates`);
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes (primary) | GitHub personal access token with repo and issues write access |
| `GH_TOKEN` | Fallback | Used if `GITHUB_TOKEN` is not set |

```bash
cp sample.env .env
# Edit .env and add your GitHub token
```

### Input Format

Expects JSON output from `security-audit-repos` and `sample-health-check`:

**Security Audit Report** (`security-audit.json`):
```json
{
  "repos": [
    {
      "owner": "org",
      "repo": "my-app",
      "score": 45,
      "dependabotAlerts": { "total": 5, "critical": 1, "high": 2 },
      "codeScanningAlerts": { "total": 3, "enabled": true },
      "secretScanningAlerts": { "total": 0 },
      "branchProtection": { "protected": false, "defaultBranch": "main" },
      "automatedSecurityFixes": { "enabled": false }
    }
  ]
}
```

**Health Check Report** (`health-check.json`):
```json
{
  "repos": [
    {
      "owner": "org",
      "repo": "my-app",
      "score": 42,
      "grade": "F",
      "dimensions": {
        "documentation": { "earned": 5, "possible": 25, "passRate": 0.2 },
        "ci_cd": { "earned": 0, "possible": 20, "passRate": 0 }
      }
    }
  ]
}
```

## CLI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--security-input` | string | — | Path to security-audit JSON |
| `--health-input` | string | — | Path to health-check JSON |
| `--out` | string | `generated/remediation-issues` | Output directory for results |
| `--dry-run` | flag | `true` | Analyze but don't create issues |
| `--security-score-threshold` | number | `70` | Create issues for repos below this security score |
| `--health-grade-threshold` | string | `'D'` | Create issues for repos at this grade or worse |
| `--extra-labels` | string | — | Comma-separated labels to add to all issues |
| `--verbose` | flag | `false` | Enable detailed logging |

## Output

### JSON Report (`{timestamp}-remediation.json`)

```json
{
  "created": [
    {
      "owner": "org",
      "repo": "my-app",
      "title": "[Security] org/my-app: Critical Dependabot vulnerabilities",
      "issueNumber": 123,
      "issueUrl": "https://github.com/org/my-app/issues/123",
      "severity": "critical",
      "findingType": "critical-dependabot"
    }
  ],
  "skipped": [
    {
      "owner": "org",
      "repo": "my-app",
      "title": "[Health] org/my-app: Low health grade",
      "reason": "duplicate — existing open issue",
      "existingIssueNumber": 100
    }
  ],
  "planned": [],
  "dryRun": false,
  "summary": {
    "totalPlanned": 5,
    "totalCreated": 3,
    "totalSkipped": 2,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Markdown Summary (`{timestamp}-remediation.md`)

Human-readable report with:
- Summary table (planned, created, skipped)
- Created issues with severity and links
- Skipped issues with reasons
- Instructions for applying changes (in dry-run mode)

## Finding Classification

### Signal-Based Findings
These fire for every repo with the condition, regardless of score/grade:

| Finding Type | Trigger | Severity | Label |
|--------------|---------|----------|-------|
| `critical-dependabot` | Any critical Dependabot alerts | critical | security |
| `high-dependabot` | 3+ high Dependabot alerts | high | security |
| `code-scanning` | Any code scanning alerts (when enabled) | high | security |
| `secret-scanning` | Any secret scanning alerts | critical | security |
| `no-branch-protection` | Default branch not protected | medium | security |
| `no-automated-security-fixes` | Automated security fixes disabled | low | security |
| `failing-dimension-*` | Dimension pass rate < 50% | medium/high | health |

### Score-Based Findings
These only fire for repos below the configured threshold:

| Finding Type | Trigger | Severity | Label |
|--------------|---------|----------|-------|
| `low-security-score` | Score < 70 (configurable) AND no signal findings | medium/high | security |
| `low-health-grade` | Grade ≤ D (configurable) | high | health |

## Deduplication Logic

- Queries GitHub for open issues with label `automated-remediation` in each repository
- Matches by exact title (case-sensitive)
- Closed issues are not considered duplicates
- On API error during deduplication, creates the issue anyway (safe fallback)

## Safety Model

Default: **dry-run** — analyze and show what would be created, but don't create issues.

To create issues: omit `--dry-run` or pass explicit mode.

## Error Handling

- Gracefully handles rate limits, auth errors, and missing repos
- Logs errors to `remediation-issues-errors.log` in the output directory
- Continues processing all repos even if some fail during deduplication

## Dependencies

- `github-rest` — GitHub REST API client from this monorepo

## Related Solutions

- `security-audit-repos` — Security vulnerability scanner (P0)
- `sample-health-check` — Repository health analyzer (P0)
- `pr-feedback-aggregator` — Cross-PR pattern analyzer (P1)
- `azure-best-practices-check` — Azure best practices scoring (P2)
- `sample-auto-fix` — Automated PR creation for fixes (P2)

## Contributing

Follows monorepo patterns — see `.github/copilot-instructions.md`.

## License

Part of the gh monorepo.
