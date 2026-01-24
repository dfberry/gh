import type { GitHubClient } from 'github-rest';
export type CommandRunner = (argv: string[], client?: GitHubClient) => Promise<void>;

const commands: Record<string, CommandRunner> = {
  'branch-protection': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/gather-branch-protection.js');
    await m.branchProtectionCommand(argv, client);
  },
  'collaborators': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/gather-collaborators.js');
    await m.collaboratorsCommand(argv, client);
  },
  'repo-secrets': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/gather-repo-secrets.js');
    await m.repoSecretsCommand(argv, client);
  },
  'remove-forks': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/change-remove-remove-forks.js');
    await m.removeForksCommand(argv, client);
  },
  'archive-stale-repos': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/change-stale-repos.js');
    await m.archiveStaleReposCommand(argv, client);
  },
  summary: async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/summary.js');
    await m.summaryCommand(argv, client);
  },
  'categorize-repos': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/evaluate-categorize-repos.js');
    await m.categorizeReposCommand(argv, client);
  },
  'describe-repo': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/describe-repo.js');
    await m.describeRepoCommand(argv, client);
  },
  'describe-repos': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/evaluate-describe-repos.js');
    await m.describeReposCommand(argv, client);
  },
  'delete-empty-repos': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/change-remove-empty-repos.js');
    await m.deleteEmptyReposCommand(argv, client);
  },
  'evaluate-actions': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/evaluate-actions.js');
    await m.evaluateActionsCommand(argv, client);
  },
  'evaluate-repos-for-empty': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commands/evaluate-repos-for-empty.js');
    await m.evaluateReposForEmptyCommand(argv, client);
  },
  'gather': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commandgroups/gather.js');
    await m.gatherCommand(argv, client);
  },
  'evaluate': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commandgroups/evaluate.js');
    await m.evaluateCommand(argv, client);
  },
  'change': async (argv: string[], client?: GitHubClient) => {
    const m = await import('../commandgroups/change.js');
    await m.changeCommand(argv, client);
  },
};

export function availableCommands(): string[] {
  return Object.keys(commands);
}

export async function runCommand(name: string | undefined, argv: string[], client?: any): Promise<void> {
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
  await runner(argv, client);
}

export default { runCommand, availableCommands };
