import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs } from './base.js';
import type { GitHubClient } from 'github-rest';

export type ChangeArgs = GroupArgs;

export function parseArgs(argv: string[]): ChangeArgs {
  return parseGroupArgs(argv) as ChangeArgs;
}

export async function runCommand(_client: GitHubClient, args: ChangeArgs): Promise<any> {
  const steps = [
    { name: 'change-stale-repos', module: '../commands/change-stale-repos.js', wrapper: 'archiveStaleReposCommand' },
    { name: 'change-remove-empty-repos', module: '../commands/change-remove-empty-repos.js', wrapper: 'deleteEmptyReposCommand' },
    { name: 'change-remove-forks', module: '../commands/change-remove-remove-forks.js', wrapper: 'removeForksCommand' },
  ];
  return runGroupCommand(args, {
    groupName: 'change',
    defaultInput: 'active-sample-repos.json',
    normalizedInputSuffix: '.tmp-change-input.json',
    defaultOutPrefix: 'change-dryrun',
    steps,
  }, _client);
}

export async function writeOutput(result: any, args: ChangeArgs): Promise<void> {
  return writeGroupOutput(result, args, 'change', 'change-dryrun');
}

export async function changeCommand(argv: string[], client?: GitHubClient): Promise<void> {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const result = await runCommand(client, args);
  await writeOutput(result, args);
  console.log('change: completed');
}
