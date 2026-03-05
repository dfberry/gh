# security-audit-repos

Unified security posture scanner that establishes a measurement baseline for GitHub repositories. This solution implements the P0 priority from the SMART goal to reduce repository-related security and operational issues by 25%.

## Purpose

Scans GitHub repositories for security issues and produces comprehensive audit reports with actionable metrics:
- Dependabot alerts (critical, high, medium, low severity)
- Code scanning alerts
- Secret scanning alerts
- Branch protection status
- Security advisories
- Automated security fixes status

Each repository receives a security score (0-100) calculated from weighted issues, enabling tracking of improvements over time.

## Installation

```bash
# From the solution directory
npm install
npm run build
```

## Usage

### CLI

```bash
# Basic usage (uses active-sample-repos.json)
npm start

# Custom input file
security-audit-repos --input repos.json

# Custom output directory
security-audit-repos --out reports/security

# Output format options
security-audit-repos --format json        # JSON only
security-audit-repos --format markdown    # Markdown only
security-audit-repos --format both        # Both (default)

# Verbose mode
security-audit-repos --verbose

# Full example
security-audit-repos --input active-sample-repos.json --out generated/security-audit --format both --verbose
```

### Library

```typescript
import { auditRepo, auditRepos, generateAuditSummary } from 'security-audit-repos';
import { GitHubClient } from 'github-rest';

const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });

// Audit a single repository
const audit = await auditRepo(client, 'owner', 'repo', { verbose: true });
console.log(`Security score: ${audit.score}/100`);

// Audit multiple repositories
const repos = ['owner/repo1', 'owner/repo2'];
const report = await auditRepos(client, repos, { verbose: true });

// Generate human-readable summary
const summary = generateAuditSummary(report);
console.log(summary);
```

## Configuration

### Environment Variables

- `GITHUB_TOKEN` (required) - GitHub personal access token with repo access

Create a `.env` file based on `sample.env`:

```bash
cp sample.env .env
# Edit .env and add your GitHub token
```

### Input Format

The input file should be a JSON array of repository names in `owner/repo` format:

```json
[
  "Azure-Samples/azure-sdk-for-js-docs",
  "dfberry/gh"
]
```

## Output

### JSON Report

Structured data with full details for each repository:

```json
{
  "repos": [
    {
      "owner": "owner",
      "repo": "repo",
      "auditedAt": "2024-01-15T10:30:00Z",
      "dependabotAlerts": {
        "total": 5,
        "critical": 1,
        "high": 2,
        "medium": 2,
        "low": 0,
        "alerts": [...]
      },
      "codeScanningAlerts": {
        "total": 3,
        "enabled": true,
        "alerts": [...]
      },
      "secretScanningAlerts": {
        "total": 0,
        "enabled": true,
        "alerts": []
      },
      "securityAdvisories": {
        "total": 0,
        "advisories": []
      },
      "branchProtection": {
        "defaultBranch": "main",
        "protected": true,
        "rules": {...}
      },
      "automatedSecurityFixes": {
        "enabled": true
      },
      "score": 35
    }
  ],
  "summary": {
    "totalRepos": 2,
    "avgScore": 67.5,
    "totalDependabotAlerts": 10,
    "totalCodeScanningAlerts": 5,
    "totalSecretScanningAlerts": 0,
    "reposWithoutBranchProtection": 1,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Markdown Summary

Human-readable report sorted by priority (lowest score first):

```markdown
# Security Audit Summary

**Generated:** 1/15/2024, 10:30:00 AM

## Overview

- **Total Repositories:** 2
- **Average Security Score:** 67.5/100
- **Total Dependabot Alerts:** 10
- **Total Code Scanning Alerts:** 5
- **Total Secret Scanning Alerts:** 0
- **Repos Without Branch Protection:** 1

## Repository Details

### owner/repo1 (Score: 35/100)

**Dependabot Alerts:** 5 total (1 critical, 2 high, 2 medium)

**Code Scanning Alerts:** 3

**Branch Protection:** ⚠️ Not enabled on main

**Automated Security Fixes:** ⚠️ Not enabled

---
```

## Security Scoring

Repositories start at 100 points with deductions for issues:

- **-20 points** per critical Dependabot alert
- **-10 points** per high Dependabot alert
- **-5 points** per medium Dependabot alert
- **-15 points** per secret scanning alert
- **-10 points** per code scanning alert
- **-25 points** if branch protection is disabled
- **-10 points** if automated security fixes are disabled

Minimum score: 0

## Error Handling

The scanner gracefully handles:
- Repositories with security features not enabled (recorded as "not enabled")
- API rate limits and transient failures
- Missing permissions (continues with available data)
- Invalid repository names (skipped with warning)

## Dependencies

- `github-rest` - GitHub REST API client from this monorepo

## Related Solutions

- `sample-health-check` - Comprehensive health analyzer (P0)
- `create-remediation-issues` - Automated work item creator (P1)
- `pr-feedback-aggregator` - Cross-PR pattern analyzer (P1)

## Contributing

This solution follows the established monorepo patterns:
- `src/index.ts` - Exported library functions
- `src/cli.ts` - CLI entry point
- ESM with `.js` extensions in imports
- TypeScript strict mode
- Async/await throughout

See `.github/copilot-instructions.md` for detailed conventions.

## License

Part of the gh monorepo.
