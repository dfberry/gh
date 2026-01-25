#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { runCommand, availableCommands } from './commands.js';
import { getGitHubClient } from '../lib/github-auth.js';
import { setMode } from '../lib/runtime-mode.js';

function printHelp() {
  console.log('gh-cleanup — repository cleanup helpers');
  console.log('Usage: gh-cleanup <command> [flags]');
  console.log('\nMode (required):');
  console.log('  --mode=selected|user   Top-level mode: "selected" uses the provided input files; "user" uses the authenticated user repos');
  console.log('  --selected             Shortcut for --mode=selected');
  console.log('  --user                 Shortcut for --mode=user');
  console.log('\nCommands:', availableCommands().join(', '));
  console.log('\nCommon flags:');
  console.log('  --yes            Perform destructive actions (default: dry-run)');
  console.log('  --force          Skip typed confirmation prompts');
  console.log('  --out=<path>     Write command output to file instead of stdout');
  console.log('  --output=json|md Output format for report commands (json or md)');
  console.log('  --debug          Enable verbose debug logging for commands');
  console.log('  --debug-dir=<d>  Directory to write debug logs to');
  console.log('\nExamples:');
  console.log('  gh-cleanup --mode=selected categorize-repos --fetch --output=md --out=generated/catalog.md');
  console.log('  gh-cleanup --mode=user summary --output=json --out=generated/active.json');
}

function detectMode(argv: string[]): string | undefined {
  let mode: string | undefined;
  argv.forEach((a) => {
    if (a === '--user') mode = 'user';
    if (a === '--selected') mode = 'selected';
    if (a.startsWith('--mode=')) mode = a.split('=', 2)[1];
  });
  if (mode) return mode.toLowerCase();
  return undefined;
}

async function main(argv: string[]) {
  const rawArgs = argv.slice(2); // user-supplied args

  const mode = detectMode(rawArgs);
  if (!mode) {
    printHelp();
    // try to print package version from package.json in this package
    try {
      const pkgPath = new URL('../../package.json', import.meta.url);
      const raw = await readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw.toString());
      console.log('version:', pkg.version || 'unknown');
    } catch (e) {
      // ignore
    }
    return;
  }

  // expose chosen mode for downstream modules via runtime singleton (avoid global env mutation)
  try {
    setMode(mode);
  } catch (e) {
    console.error('Invalid mode:', e);
    process.exit(1);
  }

  // find the first non-flag token as the command
  const cmdIndex = rawArgs.findIndex((a) => !a.startsWith('-'));
  const cmd = cmdIndex === -1 ? undefined : rawArgs[cmdIndex];
  const rest = cmdIndex === -1 ? rawArgs.slice(1) : rawArgs.slice(cmdIndex + 1);

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    printHelp();
    return;
  }

  // allow `gh-cleanup <command> --help` to show the same top-level help
  if (rest.includes('--help') || rest.includes('-h')) {
    printHelp();
    return;
  }

  const githubClient = getGitHubClient();
  await runCommand(cmd, rest, githubClient);
}

main(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
