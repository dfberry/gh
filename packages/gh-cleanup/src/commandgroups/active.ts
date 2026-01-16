import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs } from './base.js';
import { StepCommand } from '../lib/commandNames.js';
export type ActiveArgs = GroupArgs;

export function parseArgs(argv: string[]): ActiveArgs {
  return parseGroupArgs(argv) as ActiveArgs;
}

export async function runCommand(_client: any, args: ActiveArgs): Promise<any> {
  const steps = [
    { name: StepCommand.CollectActiveRepos, module: '../commands/collect-active-repos.js', wrapper: 'collectActiveReposCommand', destructive: false },
    // { name: 'active-security', module: '../commands/active-security.js', wrapper: 'activeSecurityCommand', destructive: false },
    // { name: 'summary', module: '../commands/summary.js', wrapper: 'summaryCommand', destructive: false },
  ];

  return runGroupCommand(args, {
    groupName: 'active',
    defaultOutPrefix: 'active',
    steps,
  });
}

export async function activeCommand(argv: string[]): Promise<any> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);

  const outputResult = {
    group: 'active',
    groupSummary: result.groupSummary || 0,
    timestamp: new Date().toISOString(),
  }
  console.log('active: completed');

  return outputResult;
}
