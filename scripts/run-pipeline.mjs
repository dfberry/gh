/**
 * Pipeline script: security-audit → sample-health-check → create-remediation-issues
 *                  → pr-feedback-aggregator → azure-best-practices-check → sample-auto-fix
 *
 * Runs all six solutions in sequence. The first two produce reports,
 * create-remediation-issues consumes them, pr-feedback-aggregator
 * analyzes PR reviewer comments, azure-best-practices-check scores
 * Azure patterns, and sample-auto-fix creates PRs for fixable findings.
 *
 * Usage:
 *   node scripts/run-pipeline.mjs            # dry-run (default)
 *   node scripts/run-pipeline.mjs --apply    # create real GitHub issues + PRs
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readdir, readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { GitHubClient } from '../packages/github-rest/dist/index.js';

const applyMode = process.argv.includes('--apply');

// ── Tee-like logging: mirror all output to a timestamped log file ───────
const pipelineTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
await mkdir('./generated', { recursive: true });
const LOG_PATH = `./generated/pipeline-${pipelineTimestamp}.log`;
const logStream = createWriteStream(LOG_PATH);

const _origStdoutWrite = process.stdout.write.bind(process.stdout);
const _origStderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = function (chunk, encoding, cb) {
  logStream.write(chunk);
  return _origStdoutWrite(chunk, encoding, cb);
};
process.stderr.write = function (chunk, encoding, cb) {
  logStream.write(chunk);
  return _origStderrWrite(chunk, encoding, cb);
};

// Best-effort flush on abrupt exit (process.exit calls in error paths)
process.on('exit', () => {
  try { logStream.end(); } catch { /* swallow */ }
});

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
    return client;
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
    lines.push('All 6 steps call the GitHub API — nothing will work without it.');
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

const client = await preflight();

// ── Preflight Step 2: Check repo accessibility ──────────────────────────
const INPUT_FILE = './active-sample-repos.json';

async function checkRepoAccess(ghClient, inputFile) {
  // Guard: skip if checkRepoAccess isn't available yet (Kaylee is adding it)
  if (typeof ghClient.checkRepoAccess !== 'function') {
    console.log('\n⚠️  Repo access pre-check not available yet (checkRepoAccess not implemented). Skipping.\n');
    return inputFile;
  }

  const repos = JSON.parse(await readFile(inputFile, 'utf8'));

  console.log(`\n🔍 Preflight: Checking access to ${repos.length} repositories...\n`);

  const results = [];
  for (const repoFullName of repos) {
    const [owner, repo] = repoFullName.split('/');
    const result = await ghClient.checkRepoAccess(owner, repo);
    results.push(result);

    if (result.accessible) {
      console.log(`  ✅ ${repoFullName}`);
    } else {
      console.log(`  ❌ ${repoFullName}`);
      console.log(`     ${result.error}`);
      if (result.suggestion) console.log(`     Fix: ${result.suggestion}`);
    }
  }

  // Write access log
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logPath = join(PREFLIGHT_DIR, `${timestamp}-repo-access.json`);
  await writeFile(logPath, JSON.stringify({ repos: results, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\n📄 Repo access log: ${logPath}`);

  const accessible = results.filter(r => r.accessible);
  const blocked = results.filter(r => !r.accessible);

  if (accessible.length === 0) {
    console.log('\n❌ No accessible repositories found. Cannot run pipeline.');
    console.log('   Fix the issues above and re-run.\n');
    process.exit(1);
  }

  if (blocked.length > 0) {
    console.log(`\n⚠️  ${blocked.length} repo(s) blocked — pipeline will run on ${accessible.length} accessible repo(s) only.\n`);

    // Write filtered input file for solutions to use
    const filteredRepos = accessible.map(r => `${r.owner}/${r.repo}`);
    const filteredPath = './generated/preflight/accessible-repos.json';
    await writeFile(filteredPath, JSON.stringify(filteredRepos, null, 2));
    return filteredPath;
  }

  return inputFile; // all repos accessible, use original
}

const effectiveInput = await checkRepoAccess(client, INPUT_FILE);

// ── Cleanup: Remove stale error logs from previous runs ────────────────
async function cleanupStaleErrorLogs() {
  const errorLogDirs = [
    './generated/security-audit',
    './generated/sample-health-check',
    './generated/remediation-issues',
    './generated/pr-feedback-aggregator',
    './generated/azure-best-practices',
    './generated/sample-auto-fix',
  ];

  console.log('\n🧹 Cleaning stale error logs from previous runs...\n');

  let removedCount = 0;
  for (const dir of errorLogDirs) {
    try {
      const entries = await readdir(dir);
      for (const file of entries) {
        if (file.endsWith('-errors.log')) {
          const logPath = join(dir, file);
          await unlink(logPath);
          removedCount++;
          console.log(`  🗑️  Removed: ${logPath}`);
        }
      }
    } catch {
      // Directory doesn't exist or other error — skip
    }
  }

  if (removedCount === 0) {
    console.log('  ✓ No stale error logs found');
  }
  console.log('');
}

await cleanupStaleErrorLogs();

/**
 * Run a shell command, streaming output to console (and log file via patched writes).
 * Returns a promise that resolves on success or exits the process on failure.
 */
async function run(label, command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`\n❌ Pipeline failed at: ${label}`);
        process.exit(1);
      }
      resolve();
    });
  });
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

// ── Ensure all step output directories exist ────────────────────────────
const STEP_OUTPUT_DIRS = [
  './generated/security-audit',
  './generated/sample-health-check',
  './generated/remediation-issues',
  './generated/pr-feedback-aggregator',
  './generated/azure-best-practices',
  './generated/sample-auto-fix',
];
for (const dir of STEP_OUTPUT_DIRS) {
  await mkdir(dir, { recursive: true });
}

// ── Step 1: Security Audit ──────────────────────────────────────────────
console.log('\n🔒 Running security audit...');
await run('security-audit', `node solutions/security-audit-repos/dist/cli.js --input "${effectiveInput}" --out ./generated/security-audit --verbose`);

const securityDir = './generated/security-audit';
const securityFile = await findLatestJson(securityDir);
console.log(`✅ Security audit complete: ${securityFile}\n`);

// ── Step 2: Sample Health Check ─────────────────────────────────────────
console.log('🏥 Running health check...');
await run('sample-health-check', `node solutions/sample-health-check/dist/cli.js --input="${effectiveInput}" --out="./generated/sample-health-check" --verbose`);

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
  '--out ./generated/remediation-issues',
  '--verbose',
  dryRunFlag,
].filter(Boolean).join(' ');

await run('create-remediation-issues', remediationCmd);

const remediationDir = './generated/remediation-issues';
const remediationFile = await findLatestJson(remediationDir);
console.log(`✅ Remediation issues complete: ${remediationFile}\n`);

// ── Step 4: PR Feedback Aggregator ──────────────────────────────────────
console.log('💬 Running PR feedback aggregator...');
const feedbackDryRunFlag = applyMode ? '' : ' --dry-run';
const feedbackCmd = [
  `node solutions/pr-feedback-aggregator/dist/cli.js`,
  `--input "${effectiveInput}"`,
  '--out ./generated/pr-feedback-aggregator',
  '--verbose',
  feedbackDryRunFlag,
].filter(Boolean).join(' ');

await run('pr-feedback-aggregator', feedbackCmd);
console.log('\n✅ PR feedback aggregation complete!\n');

// ── Step 5: Azure Best Practices Check ──────────────────────────────────
console.log('☁️  Running Azure best practices check...');
const azureBpCmd = [
  `node solutions/azure-best-practices-check/dist/cli.js`,
  `--input "${effectiveInput}"`,
  '--out ./generated/azure-best-practices',
  '--format both',
  '--verbose',
].join(' ');

await run('azure-best-practices-check', azureBpCmd);

const azureBpDir = './generated/azure-best-practices';
const azureBpFile = await findLatestJson(azureBpDir);
console.log(`✅ Azure best practices check complete: ${azureBpFile}\n`);

// ── Step 6: Auto-Fix (P2) ───────────────────────────────────────────────
const autoFixMode = applyMode ? 'APPLY' : 'dry-run';
console.log(`🔧 Running auto-fix (${autoFixMode})...`);
console.log(`  Inputs:`);
console.log(`    - ${remediationFile}`);
console.log(`    - ${securityFile}`);
console.log(`    - ${healthFile}`);
console.log(`    - ${azureBpFile}`);

const autoFixDryRunFlag = applyMode ? ' --apply' : '';
const autoFixCmd = [
  `node solutions/sample-auto-fix/dist/cli.js`,
  `--remediation-input "${remediationFile}"`,
  `--security-input "${securityFile}"`,
  `--health-input "${healthFile}"`,
  `--azure-input "${azureBpFile}"`,
  '--out ./generated/sample-auto-fix',
  '--verbose',
  autoFixDryRunFlag,
].filter(Boolean).join(' ');

await run('sample-auto-fix', autoFixCmd);

const autoFixDir = './generated/sample-auto-fix';
const autoFixFile = await findLatestJson(autoFixDir);
console.log(`✅ Auto-fix complete: ${autoFixFile}\n`);

// ── Check for error logs ────────────────────────────────────────────────
const errorDirs = [
  securityDir,
  healthDir,
  './generated/remediation-issues',
  './generated/pr-feedback-aggregator',
  azureBpDir,
  autoFixDir,
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
console.log(`📄 Pipeline log: ${LOG_PATH}\n`);

// ── Flush and close the log file ────────────────────────────────────────
process.stdout.write = _origStdoutWrite;
process.stderr.write = _origStderrWrite;
await new Promise((resolve) => logStream.end(resolve));
