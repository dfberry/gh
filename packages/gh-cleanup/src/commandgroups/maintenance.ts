import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs } from './base.js';

export type MaintenanceArgs = GroupArgs;

export function parseArgs(argv: string[]): MaintenanceArgs {
  return parseGroupArgs(argv) as MaintenanceArgs;
}

export async function runCommand(_client: any, args: MaintenanceArgs): Promise<any> {
  const steps = [
    { name: 'archive-stale-repos', module: '../commands/archive-stale-repos.js', wrapper: 'archiveStaleReposCommand', destructive: true },
    { name: 'delete-empty-repos', module: '../commands/delete-empty-repos.js', wrapper: 'deleteEmptyReposCommand', destructive: true },
    { name: 'remove-forks', module: '../commands/remove-forks.js', wrapper: 'removeForksCommand', destructive: true },
  ];
  return runGroupCommand(args, {
    groupName: 'maintenance',
    defaultOutPrefix: 'maintenance',
    steps,
  });
}

export async function writeOutput(result: any, args: MaintenanceArgs): Promise<void> {
  return writeGroupOutput(result, args, 'maintenance', 'maintenance');
}

export async function maintenanceCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('maintenance: completed');
}
