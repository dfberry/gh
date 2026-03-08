# sample-auto-fix

Automated remediation with PR creation for sample repositories. Analyzes findings from security, health, and Azure reports, classifies them as auto-fixable/manual/informational, creates branches, writes templated fixes, and opens PRs. Implements a 6-layer safety model with dry-run default.

## Purpose

Closes the full remediation loop by automatically creating PRs with fixes for:

- Missing security files (SECURITY.md, .env.example, .github/dependabot.yml)
- Missing Azure configuration (azure.yaml)
- Future: automated code fixes for common patterns

Each PR includes:
- Templated file content (maintained in `src/templates/`)
- Descriptive commit messages
- PR title and body with context
- Links back to original findings

## Fixability Classification

All findings are classified into 3 categories:

| Category | Definition | Action |
|----------|------------|--------|
| **Auto-fixable** | Can be fixed with templates or code generation | Creates PR |
| **Manual action** | Requires human judgment (e.g., code refactoring, architecture changes) | Logged only |
| **Informational** | Awareness signals (e.g., low scores without specific remediation) | Logged only |

Auto-fixable findings currently include:
- Missing `SECURITY.md`
- Missing `.env.example`
- Missing `.github/dependabot.yml`
- Missing `azure.yaml`

## Safety Model (6 Layers)

1. **Dry-run default** — `--apply` required to create PRs
2. **Branch safety** — Creates branches like `autofix/missing-security-files-20240115`, never modifies main
3. **Template-based** — All content from version-controlled templates (no dynamic code injection)
4. **Idempotency** — Skips if target branch already exists
5. **Classification** — Only acts on `auto-fixable` findings; logs others for manual review
6. **Error isolation** — One repo failure doesn't stop the pipeline

## Installation

```bash
cd solutions/sample-auto-fix
npm install
npm run build
```

## Usage

### CLI

```bash
# Default: dry-run (analyze, don't create PRs)
npm start -- --security-input security.json --health-input health.json --azure-input azure-bp.json

# Dry-run with verbose logging (shows what would happen)
sample-auto-fix --security-input security.json --verbose

# Live mode (creates branches and PRs)
sample-auto-fix --security-input security.json --health-input health.json --apply

# Filter by category
sample-auto-fix --security-input security.json --category missing-security-files

# Multiple categories
sample-auto-fix --security-input security.json --category missing-security-files,missing-azure-config --apply

# Custom output directory
sample-auto-fix --security-input security.json --out generated/auto-fix
```

### From repo root

```bash
npm run sample-auto-fix
```

### Library

```typescript
import { autoFixFindings, generateMarkdownReport } from 'sample-auto-fix';
import type { AutoFixOptions } from 'sample-auto-fix';
import { GitHubClient } from 'github-rest';
import { readFile } from 'node:fs/promises';

const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });

// Load reports
const security = JSON.parse(await readFile('security-audit.json', 'utf-8'));
const health = JSON.parse(await readFile('health-check.json', 'utf-8'));
const azure = JSON.parse(await readFile('azure-bp.json', 'utf-8'));

const options: AutoFixOptions = {
  dryRun: false,
  apply: true, // Enable PR creation
  verbose: true,
  categories: ['missing-security-files'], // Optional filter
};

const result = await autoFixFindings(client, { security, health, azure }, options);

console.log(`Created ${result.created.length} PRs`);
console.log(`Auto-fixable: ${result.summary.totalAutoFixable}`);
console.log(`Manual action: ${result.summary.totalManualAction}`);
console.log(`Informational: ${result.summary.totalInformational}`);

const markdown = generateMarkdownReport(result);
console.log(markdown);
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes (primary) | GitHub personal access token with repo, contents, and pull_requests write access |
| `GH_TOKEN` | Fallback | Used if `GITHUB_TOKEN` is not set |

```bash
cp sample.env .env
# Edit .env and add your GitHub token with write permissions
```

### Input Format

Accepts JSON output from these solutions:

**Remediation Issues Report** (`remediation-issues.json`):
```json
{
  "created": [...],
  "planned": [...]
}
```

**Security Audit Report** (`security-audit.json`):
```json
{
  "repos": [
    {
      "owner": "org",
      "repo": "my-app",
      "score": 45,
      "dependabotAlerts": {...}
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
      "checks": [...]
    }
  ]
}
```

**Azure Best Practices Report** (`azure-bp.json`):
```json
{
  "repos": [
    {
      "owner": "org",
      "repo": "my-app",
      "score": 60,
      "checks": [...]
    }
  ]
}
```

## CLI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--remediation-input` | string | — | Path to remediation-issues JSON |
| `--security-input` | string | — | Path to security-audit JSON |
| `--health-input` | string | — | Path to health-check JSON |
| `--azure-input` | string | — | Path to azure-best-practices JSON |
| `--out` | string | `generated/sample-auto-fix` | Output directory |
| `--category` | string | — | Comma-separated categories to apply |
| `--apply` | flag | `false` | Enable PR creation (default: dry-run) |
| `--dry-run` | flag | `false` | Explicit dry-run mode |
| `--verbose` | flag | `false` | Enable detailed logging |

## Output

### JSON Report (`{timestamp}-fixes.json`)

```json
{
  "dryRun": false,
  "created": [
    {
      "owner": "org",
      "repo": "my-app",
      "category": "missing-security-files",
      "branch": "autofix/missing-security-files-20240115",
      "prNumber": 123,
      "prUrl": "https://github.com/org/my-app/pull/123",
      "prTitle": "[auto-fix] Add missing security files",
      "filesCreated": ["SECURITY.md", ".env.example"]
    }
  ],
  "skipped": [
    {
      "owner": "org",
      "repo": "another-repo",
      "category": "missing-security-files",
      "reason": "Branch already exists: autofix/missing-security-files-20240115"
    }
  ],
  "errors": [],
  "allFindings": [
    {
      "owner": "org",
      "repo": "my-app",
      "category": "missing-security-files",
      "findingType": "no-security-md",
      "fixability": "auto-fixable",
      "source": "health",
      "missingFiles": ["SECURITY.md"]
    },
    {
      "owner": "org",
      "repo": "my-app",
      "category": "low-security-score",
      "findingType": "low-security-score",
      "fixability": "manual-action",
      "source": "security"
    }
  ],
  "summary": {
    "totalPlanned": 2,
    "totalCreated": 1,
    "totalSkipped": 1,
    "totalErrors": 0,
    "totalAutoFixable": 3,
    "totalManualAction": 5,
    "totalInformational": 2
  }
}
```

### Markdown Report (`{timestamp}-fixes.md`)

Human-readable report with:
- Summary (planned, created, skipped, errors)
- **All findings categorized by fixability** (auto-fixable, manual-action, informational)
- Created PRs with links
- Skipped fixes with reasons
- Dry-run preview of what would be created

## Fix Categories

| Category | Triggers From | Files Created |
|----------|---------------|---------------|
| `missing-security-files` | Health check: no SECURITY.md, no .env.example, no .github/dependabot.yml | SECURITY.md, .env.example, .github/dependabot.yml |
| `missing-azure-config` | Azure check: no azure.yaml | azure.yaml |

Categories can be filtered via `--category` flag.

## Template Management

Templates are version-controlled in `src/templates/`:

- `security-md.ts` — SECURITY.md template
- `env-example.ts` — .env.example template
- `dependabot-yml.ts` — .github/dependabot.yml template
- `azure-yaml.ts` — azure.yaml template

Each template includes:
- File path
- File content
- Commit message

To add a new template:
1. Create template file in `src/templates/`
2. Add mapping in `src/planner.ts` → `getTemplateForFile()`
3. Add finding extraction logic in `src/parser.ts`

## Workflow

1. **Parse** — Extract all findings from input reports
2. **Classify** — Categorize as auto-fixable, manual-action, or informational
3. **Filter** — Apply category filter (if specified)
4. **Group** — Group findings by repository
5. **Plan** — Build fix plans (branch name, PR title/body, templates)
6. **Execute** — Create branches, write files, open PRs (or dry-run)

## Error Handling

- Logs errors to `sample-auto-fix-errors.log` in output directory
- Categorizes errors: `auth`, `not_found`, `rate_limit`, `api_error`, `branch_exists`
- Continues processing remaining repos even if some fail
- Skips repos where target branch already exists (idempotency)

## Safety Notes

⚠️ **Default: DRY-RUN** — Does not create PRs unless `--apply` is explicitly set.

⚠️ **Token permissions** — Requires GitHub token with:
- `repo` scope (full repo access)
- Write access to contents (create files)
- Write access to pull_requests (create PRs)

⚠️ **Branch naming** — Branches follow pattern `autofix/{category}-{YYYYMMDD}`. If a branch exists, the fix is skipped.

⚠️ **No main modifications** — Never writes directly to default branch. All changes go through PRs.

## Dependencies

- `github-rest` — GitHub REST API client from this monorepo

## Related Solutions

- `security-audit-repos` — Security posture scanner (P0)
- `sample-health-check` — Repository health analyzer (P0)
- `create-remediation-issues` — Automated issue creator (P1)
- `pr-feedback-aggregator` — Cross-PR pattern analyzer (P1)
- `azure-best-practices-check` — Azure best practices scoring (P2)

## Contributing

Follows monorepo patterns — see `.github/copilot-instructions.md`.

## License

Part of the gh monorepo.
