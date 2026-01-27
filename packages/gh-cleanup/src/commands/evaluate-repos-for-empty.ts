/**
 * Command: evaluate-repos-for-empty
 *
 * Purpose:
 *   Use the evaluate base to mark repositories that are empty candidates
 *   (size === 0 or no pushes) and emit a structured evaluation JSON file.
 */
import type { GitHubClient } from 'github-rest';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { emitOutput, formatJsonOutput } from '../lib/report.js';
import { resolveInputFilePath } from '../lib/input-file-utils.js';
import { EvaluateBase } from '../command-base/evaluate-base-user-repos.js';
import { resolveOutFile } from '../lib/files.js';
import { readInputRepos } from '../lib/commands-shared.js';
import type { GatherActionsEntry } from '../lib/commands-shared.js';


// Configurable constants
const FLAG_INPUT = '--input=';
const FLAG_INPUT_FILE = '--input-file=';
const FLAG_CONFIG_FILE = '--config-file=';
const FLAG_OUT = '--out=';

const DEFAULT_CONFIG_PATH = './packages/gh-cleanup/evaluate-config.json';
const DEFAULT_OUT_FILENAME = 'evaluate-repos-for-empty.json';
const MISSING_INPUT_ERROR = 'Missing --input-file or --input (gather output JSON)';

const REASON_ARCHIVED = 'archived';
const REASON_FORK_EXCLUDED = 'fork-excluded';
const REASON_EMPTY = 'empty';
const REASON_OK = 'ok';

const STATUS_CANDIDATE = 'candidate';
const STATUS_OK = 'ok';
const STATUS_SKIPPED = 'skipped';

// Focused evaluator that uses EvaluateBase helpers to produce only empty-repo candidates
class EmptyEvaluator extends EvaluateBase {
  async evaluateEmpty(params: { repos: string[]; configFile?: string; outPath?: string }) {
    const { repos, configFile, outPath } = params;
    const cfg = await this.loadConfigFile(configFile);

    const evaluations = repos.map(r => {
      const repo = r as any;
      const full = repo.full_name || `${repo.owner?.login || 'unknown'}/${repo.name || 'unknown'}`;

      if (cfg.excludeArchived && repo.archived) return { full_name: full, reason: REASON_ARCHIVED, status: STATUS_SKIPPED, repo };
      if (cfg.excludeForks && repo.fork) return { full_name: full, reason: REASON_FORK_EXCLUDED, status: STATUS_SKIPPED, repo };

      if (this.isEmptyCandidate(repo)) return { full_name: full, reason: REASON_EMPTY, status: STATUS_CANDIDATE, repo };
      return { full_name: full, reason: REASON_OK, status: STATUS_OK, repo };
    });

    const emptyOnly = evaluations.filter(e => e.reason === REASON_EMPTY && e.status === STATUS_CANDIDATE);
    const notEmpty = evaluations.filter(e => !(e.reason === REASON_EMPTY && e.status === STATUS_CANDIDATE));

    const payload = { repos, configPath: configFile, count: emptyOnly.length,evaluation: { empty: emptyOnly, not_empty: notEmpty } };
    if (outPath) {
      await this.emitEvaluationOutput(outPath, payload);
    }
    return payload.evaluation;
  }
}

export type Args = BaseFlags & { input?: string; inputFile?: string; configFile?: string; out?: string };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const args: Args = { ...base, input: undefined, inputFile: undefined, configFile: undefined, out: undefined };
  for (const a of argv) {
    if (a.startsWith(FLAG_INPUT)) args.input = a.split('=', 2)[1];
    if (a.startsWith(FLAG_INPUT_FILE)) args.inputFile = a.split('=', 2)[1];
    if (a.startsWith(FLAG_CONFIG_FILE)) args.configFile = a.split('=', 2)[1];
    if (a.startsWith(FLAG_OUT)) args.out = a.split('=', 2)[1];
  }
  return args;
}

export async function runCommand(client: GitHubClient, args: Args) {
  const repos = await readInputRepos(args.input);

  // Resolve --out into a concrete file path (handles directory case using outPrefix)
  const outPathToPass = await resolveOutFile(args.out, (args as any).outPrefix, DEFAULT_OUT_FILENAME);

  // prefer explicit config-file, otherwise use package default which may be present in repo
  const cfg = args.configFile || DEFAULT_CONFIG_PATH;
  const runner = new EmptyEvaluator();
  const evaluations = await runner.evaluateEmpty({ repos, configFile: cfg, outPath: outPathToPass });
  return { inputPath: args.input, configPath: cfg, evaluation: evaluations };
}

export async function writeOutput(result: any, args: Args) {
  const data = (result && result.evaluation) || [];
  if (args.out) {
    const filePath = await resolveOutFile(args.out, (args as any).outPrefix, DEFAULT_OUT_FILENAME);
    await emitOutput(formatJsonOutput(data, result.evaluation.empty.length), filePath);
    return;
  }

  // default: print JSON to stdout via emitOutput
  await emitOutput(formatJsonOutput(data));
}

export async function evaluateReposForEmptyCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
    if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}

export default { parseArgs, runCommand, writeOutput, evaluateReposForEmptyCommand };
