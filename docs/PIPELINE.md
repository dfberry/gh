# Pipeline Documentation

The automated pipeline orchestrates six solutions that work together to scan, score, and remediate GitHub repositories. It provides a complete workflow for identifying repository health issues, security vulnerabilities, and Azure best-practices gaps — with the ability to automatically create issues and fix pull requests.

## Overview

The pipeline performs **automated GitHub repository health analysis and remediation** in six sequential steps:

1. **Security scanning** — detect vulnerabilities and security configuration gaps
2. **Health scoring** — comprehensive multi-dimensional repository health assessment
3. **Issue generation** — create GitHub Issues for findings (optional, requires `--apply`)
4. **Feedback analysis** — identify patterns in PR review comments
5. **Azure validation** — check Azure SDK and IaC best practices
6. **Auto-fix** — create branches and PRs with automated remediations (optional, requires `--apply`)

Outputs are timestamped JSON reports saved to `generated/{solution-name}/` and are suitable for archival, auditing, and further analysis.

## Prerequisites

- **Node.js** >= 22 (or `nvm use`)
- **Git** configured with SSH key or HTTPS credentials
- **`.env` file** at repository root containing:
  - `GITHUB_TOKEN` or `GH_TOKEN` — fine-grained or classic GitHub PAT with `repo` and `read:org` scopes
  - `OPENAI_API_KEY` — (required only for PR Feedback Aggregator step) OpenAI API key or compatible LLM endpoint
- **Dependencies installed:** `npm ci && npm run build`

### Setting up credentials

1. Create a GitHub Token:
   - Go to https://github.com/settings/tokens/new
   - For **fine-grained tokens** (recommended): Select `Contents: read/write`, `Issues: read/write`, `Pull requests: read/write`, `Metadata: read` scopes
   - Copy the token and add it to `.env`: `GITHUB_TOKEN=ghp_xxx`

2. (Optional) For PR Feedback Aggregator: Add OpenAI API key:
   - Create a key at https://platform.openai.com/api-keys
   - Add to `.env`: `OPENAI_API_KEY=sk-xxx`

3. Create `.env` from `.env.example` if it exists, then verify:
   ```bash
   cat .env | grep GITHUB_TOKEN  # Should show your token
   ```

## Running the pipeline

### Dry-run (default, safe — no destructive operations)

```bash
# Via npm script
npm run pipeline

# Or directly
node scripts/run-pipeline.mjs
```

This **tests** all six steps without:
- Creating GitHub Issues
- Creating or pushing branches
- Opening pull requests

**Output:** Timestamped JSON reports in `generated/{solution-name}/`

### Apply mode (destructive operations enabled)

```bash
# Via npm script
npm run pipeline:apply

# Or directly
node scripts/run-pipeline.mjs --apply
```

With `--apply`:
- ✅ Steps 1–2 and 4–5 run identically (non-destructive)
- ✅ Step 3 (Create Remediation Issues) **creates real GitHub Issues**
- ✅ Step 6 (Sample Auto-Fix) **creates branches, commits, and opens pull requests**

### Running individual solutions

If you need to run a single step outside the pipeline:

```bash
# Step 1: Security Audit
node solutions/security-audit-repos/dist/cli.js --input ./active-sample-repos.json --out ./generated/security-audit --verbose

# Step 2: Sample Health Check
node solutions/sample-health-check/dist/cli.js --input ./active-sample-repos.json --out ./generated/sample-health-check --verbose

# Step 3: Create Remediation Issues (dry-run)
node solutions/create-remediation-issues/dist/cli.js \
  --security-input ./generated/security-audit/<latest>.json \
  --health-input ./generated/sample-health-check/<latest>.json \
  --out ./generated/remediation-issues \
  --dry-run --verbose

# Step 4: PR Feedback Aggregator
node solutions/pr-feedback-aggregator/dist/cli.js \
  --input ./active-sample-repos.json \
  --out ./generated/pr-feedback-aggregator \
  --verbose

# Step 5: Azure Best Practices Check
node solutions/azure-best-practices-check/dist/cli.js \
  --input ./active-sample-repos.json \
  --out ./generated/azure-best-practices \
  --format both --verbose

# Step 6: Sample Auto-Fix (dry-run)
node solutions/sample-auto-fix/dist/cli.js \
  --remediation-input ./generated/remediation-issues/<latest>.json \
  --security-input ./generated/security-audit/<latest>.json \
  --health-input ./generated/sample-health-check/<latest>.json \
  --azure-input ./generated/azure-best-practices/<latest>.json \
  --out ./generated/sample-auto-fix \
  --verbose
```

## Step details

### Step 1: Security Audit

**What it does:** Scans repositories for security vulnerabilities and misconfigurations.

- Checks for Dependabot alerts
- Scans for code scanning findings
- Detects secret scanning alerts
- Verifies branch protection settings
- Scores each repo 0–100 (deductive model: starts at 100, deductions for each finding)

**Input:**
- `active-sample-repos.json` — list of repositories (format: `["owner/repo", ...]`)

**Output:**
- `generated/security-audit/{timestamp}-audit.json` — structured security scan results
- `generated/security-audit/{timestamp}-audit.md` — human-readable summary

**Flags:**
- `--input <file>` — JSON array of `owner/repo` strings
- `--out <dir>` — output directory (created if missing)
- `--verbose` — enable detailed logging

### Step 2: Sample Health Check

**What it does:** Comprehensive repository health assessment across seven dimensions.

Dimensions (100 points total):
- **Documentation** (25 pts) — README, CONTRIBUTING, LICENSE presence
- **CI/CD** (20 pts) — GitHub Actions, workflow configuration
- **Dependencies** (16 pts) — Dependency freshness, security updates
- **Activity** (16 pts) — Recent commits, issue/PR activity
- **Hygiene** (12 pts) — Branch naming, merge strategy
- **Azure** (7 pts) — Azure-specific configurations
- **Branch Protection** (5 pts) — Required reviews, status checks

Returns **letter grades A–F** and structured scoring.

**Input:**
- `active-sample-repos.json` — list of repositories

**Output:**
- `generated/sample-health-check/{timestamp}-health.json` — structured health scores
- `generated/sample-health-check/{timestamp}-health.md` — human-readable summary with grades

**Flags:**
- `--input <file>` — JSON array of `owner/repo` strings
- `--out <dir>` — output directory
- `--verbose` — enable detailed logging

### Step 3: Create Remediation Issues

**What it does:** Extracts actionable findings from Steps 1–2 and creates GitHub Issues.

- Reads security-audit and health-check reports
- Deduplicates findings (checks for existing open issues)
- Creates Issues with labels (e.g., `security`, `documentation`, `ci-cd`)
- Includes structured bodies with fix suggestions

**Input:**
- `{security-audit}/{timestamp}-audit.json` — from Step 1
- `{sample-health-check}/{timestamp}-health.json` — from Step 2

**Output:**
- `generated/remediation-issues/{timestamp}-issues.json` — created/skipped issue details

**Flags:**
- `--security-input <file>` — path to security audit JSON
- `--health-input <file>` — path to health check JSON
- `--out <dir>` — output directory
- `--dry-run` — preview issues without creating them (default in pipeline)
- `--apply` (or no `--dry-run` in apply mode) — create real GitHub Issues
- `--verbose` — enable detailed logging

**Safety:**
- Default is dry-run — issues are NOT created
- To create issues: remove `--dry-run` or run `npm run pipeline:apply`

### Step 4: PR Feedback Aggregator

**What it does:** Identifies patterns in PR review comments using LLM analysis.

- Fetches recent PRs from all repositories
- Filters out bot comments
- Uses LLM to extract themes and recommendations
- Deduplicates patterns across repos
- Generates aggregated insights

**Input:**
- `active-sample-repos.json` — list of repositories

**Output:**
- `generated/pr-feedback-aggregator/{timestamp}-feedback.json` — aggregated patterns and recommendations
- `generated/pr-feedback-aggregator/{timestamp}-feedback.md` — human-readable summary

**Flags:**
- `--input <file>` — JSON array of `owner/repo` strings
- `--out <dir>` — output directory
- `--max-prs <n>` — limit PRs per repo (default: unlimited)
- `--since <date>` — only analyze PRs since this date (ISO 8601 format)
- `--dry-run` — (not typically used in pipeline, but supported)
- `--verbose` — enable detailed logging

**Requirements:**
- `OPENAI_API_KEY` in `.env` (or compatible LLM endpoint)

### Step 5: Azure Best Practices Check

**What it does:** Validates Azure SDK, IaC, CI/CD, and security patterns.

Checks (15 rules across 5 dimensions):
- **SDK Usage** — correct Azure SDK imports and patterns
- **IaC** — Bicep/ARM template best practices
- **CI/CD** — Azure DevOps or GitHub Actions configuration
- **Configuration** — App Service, Function App, Container App settings
- **Security** — RBAC, secrets, managed identity usage

Returns a score (0–100) and dimension-level scores.

**Input:**
- `active-sample-repos.json` — list of repositories

**Output:**
- `generated/azure-best-practices/{timestamp}-check.json` — structured check results
- `generated/azure-best-practices/{timestamp}-check.md` — human-readable summary

**Flags:**
- `--input <file>` — JSON array of `owner/repo` strings
- `--out <dir>` — output directory
- `--format both` — output both JSON and Markdown
- `--verbose` — enable detailed logging

### Step 6: Sample Auto-Fix

**What it does:** Automatically creates branches and pull requests with fixes for findings from Steps 1–5.

Creates PRs for:
- Missing security files (SECURITY.md, .github/CODEOWNERS)
- Missing CI/CD configurations
- Azure configuration gaps (missing azure-pipelines.yml, app service settings)
- Documentation fixes (README sections, CONTRIBUTING.md)

Includes a **6-layer safety model**:
1. Repository state validation (no uncommitted changes)
2. Branch conflict detection
3. Commit signing verification
4. Rate limit checks
5. Dry-run mode (default — no branches/PRs created)
6. Manual review of all changes before pushing

**Input:**
- `{remediation-issues}/{timestamp}-issues.json` — from Step 3
- `{security-audit}/{timestamp}-audit.json` — from Step 1
- `{sample-health-check}/{timestamp}-health.json` — from Step 2
- `{azure-best-practices}/{timestamp}-check.json` — from Step 5

**Output:**
- `generated/sample-auto-fix/{timestamp}-fixes.json` — created/skipped PR details

**Flags:**
- `--remediation-input <file>` — path to remediation issues JSON
- `--security-input <file>` — path to security audit JSON
- `--health-input <file>` — path to health check JSON
- `--azure-input <file>` — path to Azure best practices JSON
- `--out <dir>` — output directory
- `--apply` — actually create branches and PRs (default is dry-run)
- `--verbose` — enable detailed logging

**Safety:**
- **Default is dry-run** — branches and PRs are NOT created
- To create branches/PRs: use `--apply` or run `npm run pipeline:apply`
- All changes are reviewed before being pushed
- Rate limits are checked before creating PRs

## Output structure

All output is saved to `generated/{solution-name}/` with the following structure:

```
generated/
├── security-audit/
│   ├── 2025-03-15T10-30-45-audit.json      # Structured results
│   ├── 2025-03-15T10-30-45-audit.md        # Markdown summary
│   └── 2025-03-15T10-30-45-errors.log      # Error log (if any)
├── sample-health-check/
│   ├── 2025-03-15T10-31-12-health.json
│   ├── 2025-03-15T10-31-12-health.md
│   └── 2025-03-15T10-31-12-errors.log
├── remediation-issues/
│   ├── 2025-03-15T10-32-00-issues.json
│   └── 2025-03-15T10-32-00-errors.log
├── pr-feedback-aggregator/
│   ├── 2025-03-15T10-33-15-feedback.json
│   ├── 2025-03-15T10-33-15-feedback.md
│   └── 2025-03-15T10-33-15-errors.log
├── azure-best-practices/
│   ├── 2025-03-15T10-34-30-check.json
│   ├── 2025-03-15T10-34-30-check.md
│   └── 2025-03-15T10-34-30-errors.log
└── sample-auto-fix/
    ├── 2025-03-15T10-35-45-fixes.json
    └── 2025-03-15T10-35-45-errors.log
```

**Timestamps** are in ISO 8601 format (YYYYMMDDTHHMMSS) for easy sorting and chronological identification.

## Error handling

If any step fails or encounters errors:

1. An error log is written to `{solution-name}/{timestamp}-errors.log`
2. The pipeline **continues** running remaining steps (graceful failure)
3. At the end, the pipeline reports all error logs found:
   ```
   ⚠️  2 error log(s) found — some repos had failures:
      generated/security-audit/2025-03-15T10-30-45-errors.log
      generated/sample-auto-fix/2025-03-15T10-35-45-errors.log
   ```

**To debug:**
- Check error logs: `cat generated/{solution}/{timestamp}-errors.log`
- Re-run individual step with `--verbose` flag (see "Running individual solutions" section above)
- Verify GitHub token has correct scopes: `npm run preflight` (or check preflight logs in `generated/preflight/`)

## Rate limiting

GitHub API has rate limits:
- **Authenticated requests:** 5,000 requests per hour per user
- **Search API:** 30 requests per minute

The pipeline:
- Checks rate limits before starting (preflight check)
- Stops with an error if rate limit is exhausted
- Logs remaining requests at each step
- Reports rate limit reset time if warnings occur

**To check rate limit status:**
```bash
npm run pipeline 2>&1 | grep -i "rate"
```

## Examples

### Example 1: Dry-run pipeline

```bash
# Build and run the full 6-step pipeline (no issues or PRs created)
npm run build
npm run pipeline

# Check the generated reports
ls -la generated/*/
cat generated/security-audit/*.md
```

### Example 2: Apply pipeline with issue creation

```bash
# Run the pipeline and create GitHub Issues (Steps 1–5 are the same)
npm run pipeline:apply

# Check created issues
cat generated/remediation-issues/*.json | jq '.[] | {repo, title, url}'
```

### Example 3: Run a single step

```bash
# Just run security audit
npm run build
npm run security-audit

# Outputs to:
cat generated/security-audit/*.md
```

### Example 4: Debug a failing step

```bash
# Run Step 3 with verbose output
npm run build
node solutions/create-remediation-issues/dist/cli.js \
  --security-input ./generated/security-audit/2025-03-15T10-30-45-audit.json \
  --health-input ./generated/sample-health-check/2025-03-15T10-31-12-health.json \
  --out ./generated/remediation-issues \
  --dry-run --verbose 2>&1 | tee debug.log
```

## FAQ

**Q: Can I run just Steps 1–2 and skip the rest?**
A: Yes, the orchestrator runs all six steps, but you can run individual solutions separately (see "Running individual solutions" above).

**Q: What if a repository is inaccessible?**
A: The pipeline checks repository access during preflight. If a repo is blocked, it's skipped and logged. The pipeline continues with accessible repositories.

**Q: Can I customize which repositories are scanned?**
A: Yes, edit `active-sample-repos.json` or create a custom JSON array of `owner/repo` strings and pass `--input` to individual steps.

**Q: How do I schedule the pipeline?**
A: Use GitHub Actions (see `.github/workflows/` for examples) or a cron job:
```bash
# Run daily at 2 AM UTC
0 2 * * * cd /path/to/repo && npm run pipeline:apply >> pipeline.log 2>&1
```

**Q: What's the difference between `--apply` and `--dry-run`?**
A: 
- **`--dry-run` (default):** Previews changes without creating issues or PRs
- **`--apply`:** Creates real GitHub Issues and PRs

**Q: Can I use the pipeline with GitHub Enterprise?**
A: Yes, if your `.env` contains a token for your GitHub Enterprise instance and you have network access.

## See also

- [README.md](../README.md) — Quick start and solution overview
- `packages/github-rest/README.md` — GitHub client library documentation
- Individual solution READMEs in `solutions/{solution-name}/README.md`
