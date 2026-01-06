import * as fs from 'fs';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { parseRepoInput } from '../lib/input-parser.js';
import * as readline from 'readline';

export type MaintenanceArgs = {
  input?: string;
  out?: string;
  outPrefix?: string;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
  continueOnError?: boolean;
};

export function parseArgs(argv: string[]): MaintenanceArgs {
  const base = parseBaseFlags(argv);
  const args: any = { ...base };
  argv.forEach((a) => {
    if (a.startsWith('--input=')) args.input = a.split('=', 2)[1];
    if (a.startsWith('--out=')) args.out = a.split('=', 2)[1];
    if (a.startsWith('--out-prefix=')) args.outPrefix = a.split('=', 2)[1];
    if (a === '--dry-run') args.dryRun = true;
    if (a === '--yes') args.yes = true;
    if (a === '--force') args.force = true;
    if (a === '--continue-on-error') args.continueOnError = true;
  });
  return args as MaintenanceArgs & BaseFlags;
}

export async function runCommand(_client: any, args: MaintenanceArgs): Promise<any> {
  // Merge base flags if present
  const base = (args as any).base as BaseFlags | undefined;

  const inputPath = args.input || 'active-sample-repos.json';
  const repos = parseRepoInput(inputPath);

  const timestamp = new Date().toISOString();

  const outDir = args.out || (base && (base as any).out) || `${process.cwd()}/generated`;
  const outPrefix = args.outPrefix || (base && (base as any).outPrefix) || 'maintenance-dryrun';
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (e) {
    console.error(`Failed to create output directory "${outDir}":`, e);
  }

  const normalizedInputPath = `${outDir}/.tmp-maintenance-input.json`;
  try {
    fs.writeFileSync(normalizedInputPath, JSON.stringify(repos, null, 2), 'utf8');
  } catch (e) {
    console.error(`Failed to write normalized input file "${normalizedInputPath}":`, e);
  }

  const steps = [
    { name: 'archive-stale-repos', module: '../commands/archive-stale-repos.js', wrapper: 'archiveStaleReposCommand' },
    { name: 'delete-empty-repos', module: '../commands/delete-empty-repos.js', wrapper: 'deleteEmptyReposCommand' },
    { name: 'remove-forks', module: '../commands/remove-forks.js', wrapper: 'removeForksCommand' },
  ];

  const summary: any = { steps: [] };

  // Determine whether to forward destructive flags to subcommands.
  // Only forward if `--yes` was provided. If `--yes` is present but `--force` is not,
  // require typed confirmation in an interactive terminal. In non-interactive CI
  // runs, require `--force` together with `--yes` to acknowledge automation.
  let forwardApply = false;
  const destructiveStepNames = steps.map((s) => s.name);
  if (args.yes) {
    if (args.force) {
      forwardApply = true;
    } else if (process.stdin.isTTY && process.stdout.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => rl.question(
        `This will perform destructive actions for steps: ${destructiveStepNames.join(', ')}\nType YES to confirm and forward --yes to subcommands: `,
        (ans: string) => { rl.close(); resolve(ans); }
      ));
      if (answer.trim().toLowerCase() === 'yes') forwardApply = true;
    } else {
      throw new Error('Non-interactive run: to forward destructive actions provide both --yes and --force');
    }
  }

  for (const s of steps) {
    const stepOut = `${outDir}/${outPrefix}-${s.name}.json`;
    const childArgv: string[] = [];
    childArgv.push(`--input=${normalizedInputPath}`);
    childArgv.push(`--out=${stepOut}`);
    if (forwardApply) {
      childArgv.push('--yes');
      if (args.force) childArgv.push('--force');
    } else {
      childArgv.push('--dry-run');
    }
    if (base?.debug) childArgv.push('--debug');
    try {
      const m = await import(s.module);
      if (typeof m[s.wrapper] === 'function') {
        await m[s.wrapper](childArgv);
        summary.steps.push({ name: s.name, file: stepOut, status: 'ok' });
      } else {
        summary.steps.push({ name: s.name, file: stepOut, status: 'missing' });
      }
    } catch (e) {
      summary.steps.push({ name: s.name, file: stepOut, status: 'error', error: String(e) });
      if (!args.continueOnError) break;
    }
  }

  // Aggregate error counts for summary
  const errorSteps = summary.steps.filter((x: any) => x.status === 'error');
  summary.errorCount = errorSteps.length;
  summary.failedSteps = errorSteps.map((x: any) => x.name);

  const summaryFile = `${outDir}/${outPrefix}-summary.json`;
  try {
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
  } catch (e) {
    console.error(`Failed to write summary file "${summaryFile}":`, e);
  }

  return { step: 'maintenance', repos, timestamp, summary };
}

export async function writeOutput(result: any, args: MaintenanceArgs): Promise<void> {
  const out = args.out || `${process.cwd()}/generated`;
  const prefix = args.outPrefix || 'maintenance-dryrun';
  try {
    fs.mkdirSync(out, { recursive: true });
    const stepFile = `${out}/${prefix}-maintenance.json`;
    fs.writeFileSync(stepFile, JSON.stringify(result, null, 2), 'utf8');
    const summaryFile = `${out}/${prefix}-summary.json`;
    const summary = {
      steps: [
        {
          name: 'maintenance',
          file: stepFile,
          reposCount: Array.isArray(result.repos) ? result.repos.length : 0,
          dryRun: !!result.dryRun,
          timestamp: result.timestamp,
        },
      ],
      errorCount: result?.summary?.errorCount || 0,
      failedSteps: result?.summary?.failedSteps || [],
    };
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
  } catch (e) {
    // ignore write errors for stub
  }
}

export async function maintenanceCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('maintenance: completed');
}
