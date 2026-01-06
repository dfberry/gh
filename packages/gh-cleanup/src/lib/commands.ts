export type CommandRunner = (argv: string[]) => Promise<void>;

const commands: Record<string, CommandRunner> = {
  'remove-forks': async (argv: string[]) => {
    const m = await import('../commands/remove-forks.js');
    await m.removeForksCommand(argv);
  },
  'archive-stale-repos': async (argv: string[]) => {
    const m = await import('../commands/archive-stale-repos.js');
    await m.archiveStaleReposCommand(argv);
  },
  summary: async (argv: string[]) => {
    const m = await import('../commands/summary.js');
    await m.summaryCommand(argv);
  },
  'categorize-repos': async (argv: string[]) => {
    const m = await import('../commands/categorize-repos.js');
    await m.categorizeReposCommand(argv);
  },
  'describe-repo': async (argv: string[]) => {
    const m = await import('../commands/describe-repo.js');
    await m.describeRepoCommand(argv);
  },
  'describe-repos': async (argv: string[]) => {
    const m = await import('../commands/describe-repos.js');
    await m.describeReposCommand(argv);
  },
  'delete-empty-repos': async (argv: string[]) => {
    const m = await import('../commands/delete-empty-repos.js');
    await m.deleteEmptyReposCommand(argv);
  },
  'evaluate-actions': async (argv: string[]) => {
    const m = await import('../commands/evaluate-actions.js');
    await m.evaluateActionsCommand(argv);
  },
  'active': async (argv: string[]) => {
    const m = await import('../commandgroups/active.js');
    await m.activeCommand(argv);
  },
  'evaluate': async (argv: string[]) => {
    const m = await import('../commandgroups/evaluate.js');
    await m.evaluateCommand(argv);
  },
  'maintenance': async (argv: string[]) => {
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
