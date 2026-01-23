import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs } from './base.js';

export type ChangeArgs = GroupArgs;

export function parseArgs(argv: string[]): ChangeArgs {
  return parseGroupArgs(argv) as ChangeArgs;
}

export async function runCommand(_client: any, args: ChangeArgs): Promise<any> {
  const steps = [
    { name: 'change-stale-repos', module: '../commands/change-stale-repos.js', wrapper: 'changeStaleReposCommand' },
    { name: 'change-remove-empty-repos', module: '../commands/change-remove-empty-repos.js', wrapper: 'changeEmptyReposCommand' },
    { name: 'change-remove-forks', module: '../commands/change-remove-forks.js', wrapper: 'changeRemoveForksCommand' },
  ];
  return runGroupCommand(args, {
    groupName: 'change',
    defaultInput: 'active-sample-repos.json',
    normalizedInputSuffix: '.tmp-change-input.json',
    defaultOutPrefix: 'change-dryrun',
    steps,
  });
}

export async function writeOutput(result: any, args: ChangeArgs): Promise<void> {
  return writeGroupOutput(result, args, 'change', 'change-dryrun');
}

export async function changeCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('change: completed');
}
