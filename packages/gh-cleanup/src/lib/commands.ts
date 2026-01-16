export type CommandRunner = (argv: string[]) => Promise<void>;

import { startSection, endSection } from './cli-log.js';
import { StepCommand, GroupCommand } from './commandNames.js';

const commands: Record<string, CommandRunner> = {
  [StepCommand.RemoveForks]: async (argv: string[]) => {
    startSection('remove-forks');
    const m = await import('../commands/remove-forks.js');
    await m.removeForksCommand(argv);
    endSection('remove-forks');
  },
  [StepCommand.ArchiveStaleRepos]: async (argv: string[]) => {
    startSection('archive-stale-repos');
    const m = await import('../commands/archive-stale-repos.js');
    await m.archiveStaleReposCommand(argv);
    endSection('archive-stale-repos');
  },
  [StepCommand.Summary]: async (argv: string[]) => {
    startSection('summary');
    const m = await import('../commands/summary.js');
    await m.summaryCommand(argv);
    endSection('summary');
  },
  [StepCommand.CategorizeRepos]: async (argv: string[]) => {
    startSection('categorize-repos');
    const m = await import('../commands/categorize-repos.js');
    await m.categorizeReposCommand(argv);
    endSection('categorize-repos');
  },
  [StepCommand.DescribeRepo]: async (argv: string[]) => {
    startSection('describe-repo');
    const m = await import('../commands/describe-repo.js');
    await m.describeRepoCommand(argv);
    endSection('describe-repo');
  },
  [StepCommand.DescribeRepos]: async (argv: string[]) => {
    startSection('describe-repos');
    const m = await import('../commands/describe-repos.js');
    await m.describeReposCommand(argv);
    endSection('describe-repos');
  },
  [StepCommand.DeleteEmptyRepos]: async (argv: string[]) => {
    startSection('delete-empty-repos');
    const m = await import('../commands/delete-empty-repos.js');
    await m.deleteEmptyReposCommand(argv);
    endSection('delete-empty-repos');
  },
  [StepCommand.EvaluateActions]: async (argv: string[]) => {
    startSection('evaluate-actions');
    const m = await import('../commands/evaluate-actions.js');
    await m.evaluateActionsCommand(argv);
    endSection('evaluate-actions');
  },
  [GroupCommand.Active]: async (argv: string[]) => {
    startSection('group: active');
    const m = await import('../commandgroups/active.js');
    await m.activeCommand(argv);
    endSection('group: active');
  },
  [GroupCommand.Evaluate]: async (argv: string[]) => {
    startSection('group: evaluate');
    const m = await import('../commandgroups/evaluate.js');
    await m.evaluateCommand(argv);
    endSection('group: evaluate');
  },
  [GroupCommand.Maintenance]: async (argv: string[]) => {
    startSection('group: maintenance');
    const m = await import('../commandgroups/maintenance.js');
    await m.maintenanceCommand(argv);
    endSection('group: maintenance');
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
