#!/usr/bin/env node
import { removeForksCommand } from '../commands/remove-forks.js';

async function main(argv: string[]) {
  const cmd = argv[2];
  const rest = argv.slice(3);
  if (cmd === 'remove-forks') {
    await removeForksCommand(rest);
    return;
  }
  if (cmd === 'archive-stale-repos') {
    const { archiveStaleReposCommand } = await import('../commands/archive-stale-repos.js');
    await archiveStaleReposCommand(rest);
    return;
  }
  if (cmd === 'summary') {
    const { summaryCommand } = await import('../commands/summary.js');
    await summaryCommand(rest);
    return;
  }
  if (cmd === 'categorize-repos') {
    const { categorizeReposCommand } = await import('../commands/categorize-repos.js');
    await categorizeReposCommand(rest);
    return;
  }
  if (cmd === 'delete-empty-repos') {
    const { deleteEmptyReposCommand } = await import('../commands/delete-empty-repos.js');
    await deleteEmptyReposCommand(rest);
    return;
  }
  console.log('gh-cleanup CLI');
  console.log('Commands: remove-forks');
}

main(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
