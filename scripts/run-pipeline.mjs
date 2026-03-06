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
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const applyMode = process.argv.includes('--apply');

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

console.log('✅ Pipeline complete!\n');
