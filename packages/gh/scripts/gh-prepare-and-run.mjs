#!/usr/bin/env node
// scripts/gh-prepare-and-run.mjs
// Ensures gh auth is available, obtains the auth token, writes it to an
// env-file, and runs an example script with that env file.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
// default env file location (relative to package root)
const envFile = (() => {
  const idx = argv.findIndex(a => a.startsWith('--env-file='));
  if (idx !== -1) return argv[idx].split('=')[1];
  const i2 = argv.findIndex(a => a === '--env-file');
  if (i2 !== -1 && argv[i2+1]) return argv[i2+1];
  return path.join(process.cwd(), 'examples', '.env');
})();

function checkGh() {
  const which = spawnSync('which', ['gh']);
  if (which.status !== 0) return false;
  return true;
}

function ensureLoggedIn() {
  const st = spawnSync('gh', ['auth', 'status'], { stdio: 'inherit' });
  if (st.status === 0) return true;
  console.log('You are not logged into gh. Running `gh auth login` now...');
  const login = spawnSync('gh', ['auth', 'login'], { stdio: 'inherit' });
  return login.status === 0;
}

function getGhToken() {
  // `gh auth token` prints the token for the current CLI auth
  const out = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
  if (out.status !== 0) {
    throw new Error(`gh auth token failed: ${out.stderr || out.stdout}`);
  }
  return (out.stdout || '').trim();
}

function writeEnvFile(filePath, token) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }
  const lines = content.split(/\r?\n/).filter(Boolean).filter(l => !l.startsWith('GH_TOKEN='));
  lines.push(`GH_TOKEN=${token}`);
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote GH_TOKEN to ${filePath}`);
}

async function main() {
  if (!checkGh()) {
    console.error('GitHub CLI `gh` not found on PATH. Please install it first.');
    process.exit(2);
  }

  if (!ensureLoggedIn()) {
    console.error('Failed to login with gh. Aborting.');
    process.exit(2);
  }

  let token;
  try {
    token = getGhToken();
  } catch (err) {
    console.error('Failed to obtain token from gh:', err.message || err);
    process.exit(2);
  }

  writeEnvFile(envFile, token);

  // Run the example with the env-file flag and pass remaining args through
  const exampleArgs = ['examples/remove-forks.mjs', `--env-file=${envFile}`, ...argv.filter(a => !a.startsWith('--env-file'))];
  console.log('Running example:', 'node', ...exampleArgs);
  const run = spawnSync('node', exampleArgs, { stdio: 'inherit' });
  process.exit(run.status ?? 0);
}

main().catch(err => { console.error(err); process.exit(1); });
