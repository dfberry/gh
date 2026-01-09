import { parseArgs as parseGroupArgs, runGroupCommand, writeGroupOutput, GroupArgs, Step } from './base.js';

export type EvaluateArgs = GroupArgs;

export function parseArgs(argv: string[]): EvaluateArgs {
  return parseGroupArgs(argv) as EvaluateArgs;
}

export async function runCommand(_client: any, args: EvaluateArgs): Promise<any> {
  const steps: Step[] = [
    { name: 'evaluate-actions', module: '../commands/evaluate-actions.js', wrapper: 'evaluateActionsCommand' },
  ];

  return runGroupCommand(args, {
    groupName: 'evaluate',
    normalizedInputSuffix: '.tmp-evaluate-input.json',
    defaultOutPrefix: 'evaluate',
    steps,
  });
}

export async function writeOutput(result: any, args: EvaluateArgs): Promise<void> {
  return writeGroupOutput(result, args, 'evaluate', 'evaluate');
}

export async function evaluateCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('evaluate: completed');
}
