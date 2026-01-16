import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs } from './base.js';

export type GetDataArgs = GroupArgs;

export function parseArgs(argv: string[]): GetDataArgs {
  return parseGroupArgs(argv) as GetDataArgs;
}

export async function runCommand(_client: any, args: GetDataArgs): Promise<any> {
  // Enforce input-only behavior for this group: steps must operate on the
  // provided input list and must not fall back to the authenticated user's repos.
  (args as any).inputOnly = true;

  const steps = [
    { name: 'active-security', module: '../commands/active-security.js', wrapper: 'activeSecurityCommand', destructive: false },
  ];

  return runGroupCommand(args, {
    groupName: 'get-data',
    defaultOutPrefix: 'get-data',
    steps,
  });
}

export async function writeOutput(result: any, args: GetDataArgs): Promise<void> {
  return writeGroupOutput(result, args, 'get-data', 'get-data');
}

export async function getDataCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('get-data: completed');
}

export default getDataCommand;
