import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs, Step } from './base.js';

export type EvaluationsArgs = GroupArgs;

export function parseArgs(argv: string[]): EvaluationsArgs {
  return parseGroupArgs(argv) as EvaluationsArgs;
}

export async function runCommand(_client: any, args: EvaluationsArgs): Promise<any> {
  const steps: Step[] = [
    // Placeholder: add command entries for the evaluations group here.
    // Example:
    // { name: 'evaluate-repos', module: '../commands/evaluate-repos.js', wrapper: 'evaluateReposCommand' },
  ];

  return runGroupCommand(args, {
    groupName: 'evaluations',
    defaultInput: 'active-sample-repos.json',
    normalizedInputSuffix: '.tmp-evaluations-input.json',
    defaultOutPrefix: 'evaluations-dryrun',
    steps,
  });
}

export async function writeOutput(result: any, args: EvaluationsArgs): Promise<void> {
  return writeGroupOutput(result, args, 'evaluations', 'evaluations-dryrun');
}

export async function evaluationsCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('evaluations: completed');
}
