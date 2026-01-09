export type CommandRunner = (argv: string[]) => Promise<void>;

import { CommandName } from '../lib/commandNames.js';

const commands: Record<string, CommandRunner> = {
  [CommandName.RemoveForks]: async (argv: string[]) => {
    const m = await import('../commands/remove-forks.js');
    await m.removeForksCommand(argv);
  },
  [CommandName.ArchiveStaleRepos]: async (argv: string[]) => {
    const m = await import('../commands/archive-stale-repos.js');
    await m.archiveStaleReposCommand(argv);
  },
  [CommandName.Summary]: async (argv: string[]) => {
    const m = await import('../commands/summary.js');
    await m.summaryCommand(argv);
  },
  [CommandName.CategorizeRepos]: async (argv: string[]) => {
    const m = await import('../commands/categorize-repos.js');
    await m.categorizeReposCommand(argv);
  },
  [CommandName.DescribeRepo]: async (argv: string[]) => {
    const m = await import('../commands/describe-repo.js');
    await m.describeRepoCommand(argv);
  },
  [CommandName.DescribeRepos]: async (argv: string[]) => {
    const m = await import('../commands/describe-repos.js');
    await m.describeReposCommand(argv);
  },
  [CommandName.DeleteEmptyRepos]: async (argv: string[]) => {
    const m = await import('../commands/delete-empty-repos.js');
    await m.deleteEmptyReposCommand(argv);
  },
  [CommandName.EvaluateActions]: async (argv: string[]) => {
    const m = await import('../commands/evaluate-actions.js');
    await m.evaluateActionsCommand(argv);
  },
  [CommandName.Active]: async (argv: string[]) => {
    const m = await import('../commandgroups/active.js');
    await m.activeCommand(argv);
  },
  [CommandName.All]: async (argv: string[]) => {
    const m = await import('../commandgroups/all.js');
    await m.allCommand(argv);
  },
  [CommandName.Evaluate]: async (argv: string[]) => {
    const m = await import('../commandgroups/evaluate.js');
    await m.evaluateCommand(argv);
  },
  [CommandName.Maintenance]: async (argv: string[]) => {
    const m = await import('../commandgroups/maintenance.js');
    await m.maintenanceCommand(argv);
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
