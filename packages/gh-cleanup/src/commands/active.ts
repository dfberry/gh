import * as fs from 'fs';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import * as readline from 'readline';

export type ActiveArgs = {
  input?: string;
  out?: string;
  outPrefix?: string;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
  continueOnError?: boolean;
};

export function parseArgs(argv: string[]): ActiveArgs {
  const base = parseBaseFlags(argv);
  const args: any = { ...base };
  argv.forEach((a) => {
    if (a.startsWith('--input=')) args.input = a.split('=')[1];
    if (a.startsWith('--out=')) args.out = a.split('=')[1];
    if (a.startsWith('--out-prefix=')) args.outPrefix = a.split('=')[1];
    if (a === '--dry-run') args.dryRun = true;
    if (a === '--yes') args.yes = true;
    if (a === '--force') args.force = true;
    if (a === '--continue-on-error') args.continueOnError = true;
  });
  return args as ActiveArgs & BaseFlags;
}

export async function runCommand(_client: any, args: ActiveArgs): Promise<any> {
  // Merge base flags if present (will be attached by the CLI wrapper)
  const base = (args as any).base as BaseFlags | undefined;

  // Normalize input into an array of repo full names.
  const inputPath = args.input || 'active-sample-repos.json';
  let repos: string[] = [];
  const raw = fs.existsSync(inputPath) ? fs.readFileSync(inputPath, 'utf8') : '';
  if (raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) repos = parsed.map(String).filter(Boolean);
    } catch (e) {
      // fall through to newline parsing
    }
  }
  if (repos.length === 0 && raw.trim().length > 0) {
    repos = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  const timestamp = new Date().toISOString();

  // Prepare normalized input file path for steps (place inside outDir/generated)
  try {
    // normalizedInputPath will be assigned after outDir is determined
  } catch (e) {
    // noop
  }

  // Determine out dir and prefix from flags
  const outDir = args.out || (base && (base as any).out) || `${process.cwd()}/generated`;
  const outPrefix = args.outPrefix || (base && (base as any).outPrefix) || 'active-dryrun';
  try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}

  const normalizedInputPath = `${outDir}/.tmp-active-input.json`;
  try { fs.writeFileSync(normalizedInputPath, JSON.stringify(repos, null, 2), 'utf8'); } catch (e) {}

  const steps = [
    { name: 'categorize-repos', module: '../commands/categorize-repos.js', wrapper: 'categorizeReposCommand' },
    { name: 'describe-repos', module: '../commands/describe-repos.js', wrapper: 'describeReposCommand' },
    { name: 'evaluate-actions', module: '../commands/evaluate-actions.js', wrapper: 'evaluateActionsCommand' },
    { name: 'summary', module: '../commands/summary.js', wrapper: 'summaryCommand' },
  ];

  const summary: any = { steps: [] };

  // Single staged confirmation for any destructive forwarding.
  let forwardApply = false;
  const destructiveStepNames = steps.map((s) => s.name);
  if (args.yes) {
    if (args.force) {
      forwardApply = true;
    } else if (process.stdin.isTTY && process.stdout.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => rl.question(
        `This will forward destructive flags to steps: ${destructiveStepNames.join(', ')}\nType YES to confirm and forward --yes to subcommands: `,
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
    // pass normalized input and out locations
    childArgv.push(`--input=${normalizedInputPath}`);
    childArgv.push(`--out=${stepOut}`);
    childArgv.push('--dry-run');
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

  // write final summary
  const summaryFile = `${outDir}/${outPrefix}-summary.json`;
  try { fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8'); } catch (e) {}

  return { step: 'active', repos, timestamp, summary };
}

export async function writeOutput(result: any, args: ActiveArgs): Promise<void> {
  const out = args.out || `${process.cwd()}/generated`;
  const prefix = args.outPrefix || 'active-dryrun';
  try {
    fs.mkdirSync(out, { recursive: true });
    const stepFile = `${out}/${prefix}-active.json`;
    fs.writeFileSync(stepFile, JSON.stringify(result, null, 2), 'utf8');
    // Also write/merge a summary file with per-step metadata.
    const summaryFile = `${out}/${prefix}-summary.json`;
    const summary = {
      steps: [
        {
          name: 'active',
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

export async function activeCommand(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const result = await runCommand(null, args);
  await writeOutput(result, args);
  console.log('active: completed');
}
