# pr-feedback-aggregator

Cross-PR feedback pattern analyzer that identifies recurring themes in reviewer comments across repositories using LLM analysis. Fetches PR comments, filters bots, and generates actionable recommendations for improving code quality and review processes.

## Purpose

Analyzes PR review feedback across multiple repositories to:

- Extract human reviewer comments from PRs (filters out bot comments)
- Identify recurring feedback patterns using LLM analysis
- Generate prioritized recommendations based on frequency and severity
- Track feedback across repos for cross-team visibility

Helps teams understand systemic issues (e.g., "missing tests" appears in 20 PRs across 5 repos) rather than treating each PR comment as isolated feedback.

## Installation

```bash
cd solutions/pr-feedback-aggregator
npm install
npm run build
```

## Usage

### CLI

```bash
# Default: reads active-sample-repos.json (dry-run skips LLM)
npm start -- --input repos.json --out generated/pr-feedback

# Dry-run (fetches comments, skips LLM analysis)
pr-feedback-aggregator --input repos.json --out output --dry-run

# Full analysis with LLM pattern extraction
pr-feedback-aggregator --input repos.json --out output

# Limit PRs per repo
pr-feedback-aggregator --input repos.json --max-prs 10

# Filter by date (ISO 8601)
pr-feedback-aggregator --input repos.json --since 2024-01-01

# Verbose logging
pr-feedback-aggregator --input repos.json --verbose
```

### From repo root

```bash
npm run pr-feedback-aggregator
```

### Library

```typescript
import { generateReport, generateMarkdownSummary } from 'pr-feedback-aggregator';
import type { PRFeedbackOptions } from 'pr-feedback-aggregator';
import { GitHubClient } from 'github-rest';

const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });

const options: PRFeedbackOptions = {
  repos: ['org/repo1', 'org/repo2'],
  outputDir: './output',
  dryRun: false, // Enable LLM analysis
  verbose: true,
  maxPRsPerRepo: 20,
  since: '2024-01-01T00:00:00Z',
  token: process.env.GITHUB_TOKEN,
};

const report = await generateReport(client, options);
console.log(`Analyzed ${report.totalPRs} PRs, found ${report.topPatterns.length} patterns`);

const markdown = generateMarkdownSummary(report);
console.log(markdown);
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub personal access token with repo access |
| `GH_TOKEN` | Fallback | Used if `GITHUB_TOKEN` is not set |
| `OPENAI_API_KEY` | Yes (live mode) | OpenAI API key for LLM analysis (not required in dry-run) |
| `OPENAI_ENDPOINT` | Optional | Azure OpenAI or custom endpoint URL |
| `OPENAI_MODEL` | Optional | Model identifier (default: gpt-4.1-mini) |
| `OPENAI_TEMPERATURE` | Optional | Sampling temperature 0-1 (default: 0.2) |

```bash
cp sample.env .env
# Edit .env and add your GitHub and OpenAI tokens
```

### Input Format

JSON array of `owner/repo` strings:

```json
[
  "Azure-Samples/azure-sdk-for-js-docs",
  "dfberry/gh",
  "microsoft/vscode"
]
```

## CLI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--input` | string | — | Path to JSON file with repo list |
| `--out` | string | `./output` | Output directory for reports |
| `--dry-run` | flag | `false` | Fetch comments but skip LLM analysis |
| `--max-prs` | number | `20` | Max PRs to fetch per repo |
| `--since` | string | — | ISO 8601 date — only PRs updated after this |
| `--verbose` | flag | `false` | Enable detailed logging |

## Output

### JSON Report (`feedback-aggregation-report.json`)

```json
{
  "generatedAt": "2024-01-15T10:30:00Z",
  "repoCount": 3,
  "totalPRs": 45,
  "totalComments": 234,
  "topPatterns": [
    {
      "theme": "Missing unit tests for new features",
      "frequency": 18,
      "examples": [
        "Could you add tests for this new method?",
        "Test coverage looks low — please add unit tests"
      ],
      "repos": ["org/repo1", "org/repo2"],
      "severity": "high"
    },
    {
      "theme": "Inconsistent error handling patterns",
      "frequency": 12,
      "examples": [
        "Should this throw or return an error object?",
        "Error handling is inconsistent with the rest of the codebase"
      ],
      "repos": ["org/repo1"],
      "severity": "medium"
    }
  ],
  "perRepo": [
    {
      "repo": "org/repo1",
      "prCount": 15,
      "commentCount": 89,
      "patterns": [...]
    }
  ],
  "recommendations": [
    "Address: Missing unit tests for new features (found 18 times across 2 repos)",
    "Address: Inconsistent error handling patterns (found 12 times across 1 repos)"
  ],
  "dryRun": false
}
```

### Markdown Summary (`feedback-aggregation-recommendations.md`)

Human-readable report with:
- Overview (repo count, PR count, comment count)
- Top patterns with severity, frequency, and examples
- Per-repo breakdown
- Actionable recommendations (auto-generated for high-severity patterns)
- Dry-run instructions (when applicable)

## How It Works

### 1. Fetch Phase

- For each repo: fetch up to `--max-prs` PRs (sorted by most recently updated)
- For each PR: fetch both issue comments and review comments
- Filter out bot comments (usernames ending in `[bot]`)
- Truncate comment bodies to 10,000 characters max
- Handle API errors gracefully (404, 401, 403) — skip repo and continue

### 2. Analysis Phase (Live Mode Only)

- Combine all comment bodies with separators
- Send to LLM with prompt: "Identify recurring feedback patterns"
- Parse response JSON for patterns with:
  - `theme`: Pattern description
  - `frequency`: Estimated occurrences
  - `examples`: Representative comment snippets
  - `repos`: Affected repositories
  - `severity`: high | medium | low

### 3. Aggregation Phase

- Deduplicate patterns by theme across repos
- Sum frequencies for matching themes
- Merge examples and repo lists
- Keep highest severity for each theme
- Sort by frequency (most common first)

### 4. Recommendations

- Auto-generate recommendations for high-severity patterns
- Format: "Address: {theme} (found {frequency} times across {repoCount} repos)"

## Dry-Run Mode

**Default behavior:** When `--dry-run` is set, the tool:
- Fetches PR comments from GitHub (no LLM calls)
- Shows what PRs and comments would be analyzed
- Lists per-PR metadata (PR number, title, comment count)
- Skips LLM analysis (saves API costs)
- Marks output with `dryRun: true`

**Use case:** Verify comment fetch before spending LLM API credits.

## Bot Filtering

Comments from these usernames are excluded:
- Any username ending in `[bot]` (e.g., `github-actions[bot]`, `dependabot[bot]`)

This ensures only human reviewer feedback is analyzed.

## Error Handling

- Gracefully handles missing repos (404), auth errors (401), rate limits (403)
- Logs errors to `pr-feedback-errors.log` in the output directory
- Continues processing remaining repos even if some fail
- Per-repo error categorization: `auth`, `not_found`, `rate_limit`, `api_error`

## Dependencies

- `github-rest` — GitHub REST API client from this monorepo
- `llm-completion` — OpenAI/Azure OpenAI LLM client from this monorepo

## Related Solutions

- `security-audit-repos` — Security vulnerability scanner (P0)
- `sample-health-check` — Repository health analyzer (P0)
- `create-remediation-issues` — Automated issue creator (P1)
- `azure-best-practices-check` — Azure best practices scoring (P2)

## Contributing

Follows monorepo patterns — see `.github/copilot-instructions.md`.

## License

Part of the gh monorepo.
