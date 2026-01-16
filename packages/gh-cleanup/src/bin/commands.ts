export type CommandRunner = (argv: string[]) => Promise<void>;

import { StepCommand, GroupCommand } from '../lib/commandNames.js';

const commands: Record<string, CommandRunner> = {
  [StepCommand.RemoveForks]: async (argv: string[]) => {
    const m = await import('../commands/remove-forks.js');
    await m.removeForksCommand(argv);
  },
  [StepCommand.ArchiveStaleRepos]: async (argv: string[]) => {
    const m = await import('../commands/archive-stale-repos.js');
    await m.archiveStaleReposCommand(argv);
  },
  [StepCommand.Summary]: async (argv: string[]) => {
    const m = await import('../commands/summary.js');
    await m.summaryCommand(argv);
  },
  [StepCommand.CategorizeRepos]: async (argv: string[]) => {
    const m = await import('../commands/categorize-repos.js');
    await m.categorizeReposCommand(argv);
  },
  [StepCommand.DescribeRepo]: async (argv: string[]) => {
    const m = await import('../commands/describe-repo.js');
    await m.describeRepoCommand(argv);
  },
  [StepCommand.DescribeRepos]: async (argv: string[]) => {
    const m = await import('../commands/describe-repos.js');
    await m.describeReposCommand(argv);
  },
  [StepCommand.DeleteEmptyRepos]: async (argv: string[]) => {
    const m = await import('../commands/delete-empty-repos.js');
    await m.deleteEmptyReposCommand(argv);
  },
  [StepCommand.EvaluateActions]: async (argv: string[]) => {
    const m = await import('../commands/evaluate-actions.js');
    await m.evaluateActionsCommand(argv);
  },
  [GroupCommand.Active]: async (argv: string[]) => {
    const m = await import('../commandgroups/active.js');
    await m.activeCommand(argv);
  },
  [GroupCommand.All]: async (argv: string[]) => {
    const m = await import('../commandgroups/all.js');
    await m.allCommand(argv);
  },
  [GroupCommand.Evaluate]: async (argv: string[]) => {
    const m = await import('../commandgroups/evaluate.js');
    await m.evaluateCommand(argv);
  },
  [GroupCommand.Maintenance]: async (argv: string[]) => {
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
