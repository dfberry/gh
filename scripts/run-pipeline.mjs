/**
 * Pipeline script: security-audit → sample-health-check → create-remediation-issues → pr-feedback-aggregator
 *
 * Runs all four solutions in sequence. The first two produce reports,
 * create-remediation-issues consumes them, and pr-feedback-aggregator
 * analyzes PR reviewer comments for recurring patterns.
 *
 * Usage:
 *   node scripts/run-pipeline.mjs            # dry-run (default)
 *   node scripts/run-pipeline.mjs --apply    # create real GitHub issues
 */

import { execSync } from 'node:child_process';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GitHubClient } from '../packages/github-rest/dist/index.js';

const applyMode = process.argv.includes('--apply');

// ── Preflight: validate GitHub token (hard gate) ────────────────────────
const PREFLIGHT_DIR = './generated/preflight';

async function preflight() {
  console.log('\n🔑 Preflight: Checking GitHub token...\n');

  await mkdir(PREFLIGHT_DIR, { recursive: true });

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (!token) {
    const report = buildReport({
      status: 'FAILED',
      error: 'No GITHUB_TOKEN or GH_TOKEN found in environment',
      suggestion: 'Add GITHUB_TOKEN=ghp_xxx to your .env file',
    });
    await writePreflightLog(timestamp, report);
    console.log(report.display);
    process.exit(1);
  }

  const client = new GitHubClient({ token });
  const result = await client.validateToken();

  if (result.valid) {
    const report = buildReport({
      status: 'PASSED',
      login: result.login,
      scopes: result.scopes,
      rateLimit: result.rateLimit,
    });
    await writePreflightLog(timestamp, report);
    console.log(report.display);

    // Hard gate: if rate limit is exhausted, abort the pipeline
    if (result.rateLimit && result.rateLimit.remaining === 0) {
      process.exit(1);
    }
    return;
  }

  const report = buildReport({
    status: 'FAILED',
    error: result.error,
    suggestion: result.suggestion,
  });
  await writePreflightLog(timestamp, report);
  console.log(report.display);
  process.exit(1);
}

function buildReport({ status, login, scopes, rateLimit, error, suggestion }) {
  const lines = [];
  lines.push('════════════════════════════════════════════════════════════');
  lines.push('GITHUB TOKEN PREFLIGHT CHECK');
  lines.push('════════════════════════════════════════════════════════════');

  if (status === 'PASSED') {
    lines.push(`Status:         ✅ PASSED`);
    lines.push(`Authenticated:  @${login}`);
    lines.push(`Scopes:         ${scopes?.length ? scopes.join(', ') : '(fine-grained token — no classic scopes)'}`);

    if (rateLimit) {
      const resetTime = rateLimit.resetAt
        ? new Date(rateLimit.resetAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : 'unknown';

      if (rateLimit.remaining === 0) {
        lines.push(`Rate Limit:     ❌ 0/${rateLimit.limit} remaining (resets at ${resetTime})`);
        lines.push('');
        lines.push('The pipeline cannot run — GitHub API rate limit is exhausted.');
        lines.push('Wait for the rate limit to reset before running the pipeline.');
      } else if (rateLimit.remaining < 100) {
        lines.push(`Rate Limit:     ⚠️ ${rateLimit.remaining}/${rateLimit.limit} remaining (resets at ${resetTime}) — pipeline may hit limits!`);
      } else {
        lines.push(`Rate Limit:     ${rateLimit.remaining}/${rateLimit.limit} remaining (resets at ${resetTime})`);
      }
    }

    lines.push('════════════════════════════════════════════════════════════');
  } else {
    lines.push(`Status:         ❌ FAILED`);
    lines.push(`Error:          ${error}`);
    lines.push(`Fix:            ${suggestion}`);
    lines.push('');
    lines.push('The pipeline requires a valid GitHub token to run.');
    lines.push('All 4 steps call the GitHub API — nothing will work without it.');
    lines.push('════════════════════════════════════════════════════════════');
  }

  return {
    display: lines.join('\n'),
    json: { status, login, scopes, rateLimit, error, suggestion, timestamp: new Date().toISOString() },
  };
}

async function writePreflightLog(timestamp, report) {
  const logPath = join(PREFLIGHT_DIR, `${timestamp}-preflight.json`);
  await writeFile(logPath, JSON.stringify(report.json, null, 2));
  console.log(`📄 Preflight log: ${logPath}\n`);
}

await preflight();

/**
 * Run a shell command, streaming output to the console.
 * Throws with a descriptive message on failure.
 */
function run(label, command) {
  try {
    execSync(command, { stdio: 'inherit' });
  } catch {
    console.error(`\n❌ Pipeline failed at: ${label}`);
    process.exit(1);
  }
}

/**
 * Find the newest .json file in a directory.
 * Files are ISO-timestamped so alphabetical sort = chronological order.
 */
async function findLatestJson(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    console.error(`❌ Output directory not found: ${dir}`);
    process.exit(1);
  }

  const jsonFiles = entries.filter((f) => f.endsWith('.json')).sort();

  if (jsonFiles.length === 0) {
    console.error(`❌ No .json files found in ${dir}`);
    process.exit(1);
  }

  return join(dir, jsonFiles[jsonFiles.length - 1]);
}

// ── Step 1: Security Audit ──────────────────────────────────────────────
console.log('\n🔒 Running security audit...');
run('security-audit', 'npm run security-audit');

const securityDir = './generated/security-audit';
const securityFile = await findLatestJson(securityDir);
console.log(`✅ Security audit complete: ${securityFile}\n`);

// ── Step 2: Sample Health Check ─────────────────────────────────────────
console.log('🏥 Running health check...');
run('sample-health-check', 'npm run sample-health-check');

const healthDir = './generated/sample-health-check';
const healthFile = await findLatestJson(healthDir);
console.log(`✅ Health check complete: ${healthFile}\n`);

// ── Step 3: Create Remediation Issues ───────────────────────────────────
const mode = applyMode ? 'APPLY' : 'dry-run';
console.log(`📋 Creating remediation issues (${mode})...`);
console.log(`  Inputs:`);
console.log(`    - ${securityFile}`);
console.log(`    - ${healthFile}`);

const dryRunFlag = applyMode ? '' : ' --dry-run';
const remediationCmd = [
  'npm run create-remediation-issues --',
  `--security-input "${securityFile}"`,
  `--health-input "${healthFile}"`,
  '--verbose',
  dryRunFlag,
].filter(Boolean).join(' ');

run('create-remediation-issues', remediationCmd);
console.log('\n✅ Remediation issues complete!\n');

// ── Step 4: PR Feedback Aggregator ──────────────────────────────────────
console.log('💬 Running PR feedback aggregator...');
const feedbackDryRunFlag = applyMode ? '' : ' --dry-run';
const feedbackCmd = [
  'npm run pr-feedback-aggregator --',
  feedbackDryRunFlag,
].filter(Boolean).join(' ');

run('pr-feedback-aggregator', feedbackCmd);
console.log('\n✅ PR feedback aggregation complete!\n');

// ── Check for error logs ────────────────────────────────────────────────
const errorDirs = [
  securityDir,
  healthDir,
  './generated/remediation-issues',
  './generated/pr-feedback-aggregator',
];
const errorLogFiles = [];
for (const dir of errorDirs) {
  try {
    const entries = await readdir(dir);
    for (const f of entries) {
      if (f.endsWith('-errors.log')) {
        errorLogFiles.push(join(dir, f));
      }
    }
  } catch {
    // Directory may not exist — skip
  }
}

if (errorLogFiles.length > 0) {
  console.log(`⚠️  ${errorLogFiles.length} error log(s) found — some repos had failures:`);
  for (const f of errorLogFiles) {
    console.log(`   ${f}`);
  }
  console.log('');
}

console.log('✅ Pipeline complete!\n');
