#!/usr/bin/env node
import { runCommand, availableCommands } from './commands.js';
import { CommandName } from '../lib/commandNames.js';

function printHelp() {
  console.log('gh-cleanup — repository cleanup helpers');
  console.log('Usage: gh-cleanup <command> [flags]');
  console.log('Commands:', availableCommands().join(', '));
  console.log('\nCommon flags:');
  console.log('  --yes            Perform destructive actions (default: dry-run)');
  console.log('  --force          Skip typed confirmation prompts');
  console.log('  --out=<path>     Write command output to file instead of stdout');
  console.log('  --output=json|md Output format for report commands (json or md)');
  console.log('  --debug          Enable verbose debug logging for commands');
  console.log('  --debug-dir=<d>  Directory to write debug logs to');
  console.log('\nExamples:');
  console.log(`  gh-cleanup ${CommandName.CategorizeRepos} --fetch --output=md --out=generated/catalog.md`);
  console.log(`  gh-cleanup ${CommandName.Summary} --output=json --out=generated/active.json`);
}

async function main(argv: string[]) {
  const cmd = argv[2];
  const rest = argv.slice(3);

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    printHelp();
    return;
  }

  // allow `gh-cleanup <command> --help` to show the same top-level help
  if (rest.includes('--help') || rest.includes('-h')) {
    printHelp();
    return;
  }

  await runCommand(cmd, rest);
}

main(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
