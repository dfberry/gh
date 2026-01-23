import * as fs from 'fs';
import * as readline from 'readline';
import { startSection, endSection } from '../lib/cli-log.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { parseRepoInput } from '../lib/input-parser.js';
import { repos as repoEndpoints, user as userEndpoints } from 'github-rest';
import { getGitHubClient } from '../lib/github-auth.js';
import { getDefaultOutDir } from '../config/appConfig.js';
import { ensureDir } from '../lib/files.js';
import { writeNormalizedInput } from '../lib/output.js';
import { fetchAndWriteTokenScopes } from '../lib/token-scopes.js';
export type GroupArgs = {
  input?: string;
  out?: string;
  outPrefix?: string;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
  continueOnError?: boolean;
} & BaseFlags;

export function parseArgs(argv: string[]): GroupArgs & BaseFlags {
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
  return args as GroupArgs & BaseFlags;
}

export async function confirmDestructiveForwarding(
  args: GroupArgs,
  destructiveStepNames: string[],
): Promise<boolean> {
  let forwardApply = false;
  if (args.yes) {
    if (args.force) {
      forwardApply = true;
    } else if (process.stdin.isTTY && process.stdout.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) =>
        rl.question(
          `This will forward destructive flags to steps: ${destructiveStepNames.join(', ')}\nType YES to confirm and forward --yes to subcommands: `,
          (ans: string) => {
            rl.close();
            resolve(ans);
          },
        ),
      );
      if (answer.trim().toLowerCase() === 'yes') forwardApply = true;
    } else {
      throw new Error('Non-interactive run: to forward destructive actions provide both --yes and --force');
    }
  }
  return forwardApply;
}

export type Step = { name: string; module: string; wrapper: string };

export async function runGroupCommand(
  args: GroupArgs,
  opts: {
    groupName: string;
    defaultInput: string;
    normalizedInputSuffix: string;
    defaultOutPrefix: string;
    steps: Step[];
  },
): Promise<any> {
  const base = (args as any).base as BaseFlags | undefined;

  const client = getGitHubClient();
  startSection(`group: ${opts.groupName}`);

  const inputPath = args.input || opts.defaultInput;
  const repos = parseRepoInput(inputPath);

  const timestamp = new Date().toISOString();

  const outDir = args.out || (base && (base as any).out) || getDefaultOutDir();
  const outPrefix = args.outPrefix || (base && (base as any).outPrefix) || opts.defaultOutPrefix;
  ensureDir(outDir);

  const normalizedInputPath = writeNormalizedInput(outDir, opts.normalizedInputSuffix, repos);

  // Fetch token scopes once for the entire gather run and write to output
  const tokenScopes: string[] = await fetchAndWriteTokenScopes(client, outDir, outPrefix);

  const steps = opts.steps;
  const summary: any = { steps: [] };

  const destructiveStepNames = steps.map((s) => s.name);
  const forwardApply = await confirmDestructiveForwarding(args, destructiveStepNames);

  for (const s of steps) {
    startSection(`step: ${s.name}`);
    const stepOut = `${outDir}/${outPrefix}-${s.name}.json`;
    const childArgv: string[] = [];
    childArgv.push(`--input=${normalizedInputPath}`);
    childArgv.push(`--out=${stepOut}`);
    if (s.name === 'branch-protection' && Array.isArray(repos) && repos.length > 0) {
      // Use first repo in list for demonstration; could loop for all
      const [owner, repo] = repos[0].split('/');
      let branch = 'main';
      try {
        const detected = await repoEndpoints.getDefaultBranch(client, owner, repo);
        if (detected) branch = detected;
      } catch (e) {
        // fallback to main
      }
      childArgv.push(`--owner=${owner}`);
      childArgv.push(`--repo=${repo}`);
      childArgv.push(`--branch=${branch}`);
    }
    if (!forwardApply) {
      childArgv.push('--dry-run');
    } else {
      if (args.yes) childArgv.push('--yes');
      if (args.force) childArgv.push('--force');
    }
    if (base?.debug) childArgv.push('--debug');
    try {
      const m = await import(s.module);
      if (typeof m[s.wrapper] === 'function') {
        await m[s.wrapper](childArgv, client);
        summary.steps.push({ name: s.name, file: stepOut, status: 'ok' });
      } else {
        summary.steps.push({ name: s.name, file: stepOut, status: 'missing' });
      }
      endSection(`step: ${s.name}`, 'ok');
    } catch (e) {
      summary.steps.push({ name: s.name, file: stepOut, status: 'error', error: String(e) });
      endSection(`step: ${s.name}`, 'error');
      if (!args.continueOnError) break;
    }
  }

  const errorSteps = summary.steps.filter((x: any) => x.status === 'error');
  summary.errorCount = errorSteps.length;
  summary.failedSteps = errorSteps.map((x: any) => x.name);
  summary.tokenScopes = tokenScopes;

  const summaryFile = `${outDir}/${outPrefix}-summary.json`;
  try {
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
  } catch (e) {
    console.error(`Failed to write summary file "${summaryFile}":`, e);
  }

  const status = summary.errorCount > 0 ? 'errors' : 'ok';
  endSection(`group: ${opts.groupName}`, status);

  return { step: opts.groupName, repos, timestamp, summary };
}

export async function writeGroupOutput(result: any, args: GroupArgs, groupName: string, defaultPrefix: string): Promise<void> {
  const out = args.out || `${process.cwd()}/generated`;
  const prefix = args.outPrefix || defaultPrefix;
  try {
    ensureDir(out);
    const stepFile = `${out}/${prefix}-${groupName}.json`;
    fs.writeFileSync(stepFile, JSON.stringify(result, null, 2), 'utf8');
    const summaryFile = `${out}/${prefix}-summary.json`;
    const summary = {
      steps: [
        {
          name: groupName,
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
