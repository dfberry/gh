export type CommandRunner = (argv: string[]) => Promise<void>;

const commands: Record<string, CommandRunner> = {
  'branch-protection': async (argv: string[]) => {
    const m = await import('../commands/gather-branch-protection.js');
    await m.branchProtectionCommand(argv);
  },
  'collaborators': async (argv: string[]) => {
    const m = await import('../commands/gather-collaborators.js');
    await m.collaboratorsCommand(argv);
  },
  'repo-secrets': async (argv: string[]) => {
    const m = await import('../commands/gather-repo-secrets.js');
    await m.repoSecretsCommand(argv);
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
