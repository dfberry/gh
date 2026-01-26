export type CommandRunner = (argv: string[]) => Promise<void>;

const commands: Record<string, CommandRunner> = {
    'actions': async (argv: string[]) => {
      const m = await import('../commands/actions.js');
      const { runWithErrorHandling } = await import('../lib/command-executor.js');
      const debug = argv.includes('--debug');
      const result = await runWithErrorHandling(m.gatherActionsCommand, argv, { debug });
      if (result.error) {
        console.error('Error:', result.error);
      }
      if (result.result) {
        console.log('Result:', result.result);
      }
    },
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
  'gather': async (argv: string[]) => {
    const m = await import('../commandgroups/gather.js');
    await m.gatherCommand(argv);
  },
  'evaluate': async (argv: string[]) => {
    const m = await import('../commandgroups/evaluate.js');
    await m.evaluateCommand(argv);
  },
  'change': async (argv: string[]) => {
    const m = await import('../commandgroups/change.js');
    await m.changeCommand(argv);
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
