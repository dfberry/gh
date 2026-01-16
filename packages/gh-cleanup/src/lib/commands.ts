export type CommandRunner = (argv: string[]) => Promise<void>;

import { startSection, endSection } from './cli-log.js';

const commands: Record<string, CommandRunner> = {
  'remove-forks': async (argv: string[]) => {
    startSection('remove-forks');
    const m = await import('../commands/remove-forks.js');
    await m.removeForksCommand(argv);
    endSection('remove-forks');
  },
  'archive-stale-repos': async (argv: string[]) => {
    startSection('archive-stale-repos');
    const m = await import('../commands/archive-stale-repos.js');
    await m.archiveStaleReposCommand(argv);
    endSection('archive-stale-repos');
  },
  summary: async (argv: string[]) => {
    startSection('summary');
    const m = await import('../commands/summary.js');
    await m.summaryCommand(argv);
    endSection('summary');
  },
  'categorize-repos': async (argv: string[]) => {
    startSection('categorize-repos');
    const m = await import('../commands/categorize-repos.js');
    await m.categorizeReposCommand(argv);
    endSection('categorize-repos');
  },
  'describe-repo': async (argv: string[]) => {
    startSection('describe-repo');
    const m = await import('../commands/describe-repo.js');
    await m.describeRepoCommand(argv);
    endSection('describe-repo');
  },
  'describe-repos': async (argv: string[]) => {
    startSection('describe-repos');
    const m = await import('../commands/describe-repos.js');
    await m.describeReposCommand(argv);
    endSection('describe-repos');
  },
  'delete-empty-repos': async (argv: string[]) => {
    startSection('delete-empty-repos');
    const m = await import('../commands/delete-empty-repos.js');
    await m.deleteEmptyReposCommand(argv);
    endSection('delete-empty-repos');
  },
  'evaluate-actions': async (argv: string[]) => {
    startSection('evaluate-actions');
    const m = await import('../commands/evaluate-actions.js');
    await m.evaluateActionsCommand(argv);
    endSection('evaluate-actions');
  },
  'gather': async (argv: string[]) => {
    startSection('group: gather');
    const m = await import('../commandgroups/gather.js');
    await m.gatherCommand(argv);
    endSection('group: gather');
  },
  'evaluate': async (argv: string[]) => {
    startSection('group: evaluate');
    const m = await import('../commandgroups/evaluate.js');
    await m.evaluateCommand(argv);
    endSection('group: evaluate');
  },
  'change': async (argv: string[]) => {
    startSection('group: change');
    const m = await import('../commandgroups/change.js');
    await m.changeCommand(argv);
    endSection('group: change');
  },
};

export function availableCommands(): string[] {
  return Object.keys(commands);
}

export async function runCommand(name: string | undefined, argv: string[]): Promise<void> {
  if (!name) {
    console.log('gh-cleanup CLI');
    console.log('Commands:', availableCommands().join(', '));
    return;
  }
  const runner = commands[name];
  if (!runner) {
    console.error(`Unknown command: ${name}`);
    console.log('Commands:', availableCommands().join(', '));
    return;
  }
  await runner(argv);
}

export default { runCommand, availableCommands };
