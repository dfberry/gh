import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs, Step } from './base.js';

export type AllArgs = GroupArgs;

export function parseArgs(argv: string[]): AllArgs {
  return parseGroupArgs(argv) as AllArgs;
}

export async function runCommand(_client: any, args: AllArgs): Promise<any> {
  const steps: Step[] = [
    { name: 'maintenance', module: './maintenance.js', wrapper: 'maintenanceCommand', destructive: true },
    { name: 'active', module: './active.js', wrapper: 'activeCommand', destructive: false },
    { name: 'evaluate', module: './evaluate.js', wrapper: 'evaluateCommand', destructive: false },
  ];

  return runGroupCommand(args, {
    groupName: 'all',
    defaultOutPrefix: 'all',
    steps,
  });
}

export async function writeOutput(result: any, args: AllArgs): Promise<void> {
  return writeGroupOutput(result, args, 'all', 'all');
}

export async function allCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('all: completed');
}

export default allCommand;
