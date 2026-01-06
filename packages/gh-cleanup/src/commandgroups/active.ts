import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs } from './base.js';

export type ActiveArgs = GroupArgs;

export function parseArgs(argv: string[]): ActiveArgs {
  return parseGroupArgs(argv) as ActiveArgs;
}

export async function runCommand(_client: any, args: ActiveArgs): Promise<any> {
  const steps = [
    { name: 'categorize-repos', module: '../commands/categorize-repos.js', wrapper: 'categorizeReposCommand' },
    { name: 'describe-repos', module: '../commands/describe-repos.js', wrapper: 'describeReposCommand' },
    { name: 'evaluate-actions', module: '../commands/evaluate-actions.js', wrapper: 'evaluateActionsCommand' },
    { name: 'summary', module: '../commands/summary.js', wrapper: 'summaryCommand' },
  ];
  return runGroupCommand(args, {
    groupName: 'active',
    defaultInput: 'active-sample-repos.json',
    normalizedInputSuffix: '.tmp-active-input.json',
    defaultOutPrefix: 'active-dryrun',
    steps,
  });
}

export async function writeOutput(result: any, args: ActiveArgs): Promise<void> {
  return writeGroupOutput(result, args, 'active', 'active-dryrun');
}

export async function activeCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('active: completed');
}
