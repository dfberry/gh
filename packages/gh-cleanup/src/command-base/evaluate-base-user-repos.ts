import { promises as fs } from 'fs';

export type Repo = {
  id?: number;
  name?: string;
  full_name?: string;
  owner?: { login?: string };
  fork?: boolean;
  archived?: boolean;
  size?: number;
  pushed_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
};

export type EvaluateConfig = {
  olderThanDays?: number;
  excludeForks?: boolean;
  excludeArchived?: boolean;
};

export type Evaluation = {
  full_name?: string;
  reason: string;
  status: 'candidate' | 'ok' | 'skipped';
  repo?: Repo;
  score?: number;
  message?: string;
};

const DEFAULT_CONFIG: EvaluateConfig = {
  olderThanDays: 365,
  excludeForks: true,
  excludeArchived: true,
};

export async function loadInputFile(inputFile: string): Promise<Repo[]> {
  if (!inputFile) throw new Error('inputFile path required');
  const raw = await fs.readFile(inputFile, 'utf8');
  // try parse JSON, otherwise treat as newline list
  try {
    const parsed = JSON.parse(raw);
    // normalize a few common shapes
    if (Array.isArray(parsed)) return normalizeRepos(parsed as Repo[]);
    if (parsed && Array.isArray(parsed.repos)) return normalizeRepos(parsed.repos as Repo[]);
    if (parsed && Array.isArray(parsed.items)) return normalizeRepos(parsed.items as Repo[]);
    // unknown object shape -> wrap
    return normalizeRepos([parsed] as Repo[]);
  } catch (err) {
    // fallback: newline list of full names
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return normalizeRepos(lines.map(l => ({ full_name: l })) as Repo[]);
  }
}

export async function loadConfigFile(configFile?: string): Promise<EvaluateConfig> {
  if (!configFile) return { ...DEFAULT_CONFIG };
  try {
    const raw = await fs.readFile(configFile, 'utf8');
    const parsed = JSON.parse(raw) as EvaluateConfig;
    return { ...DEFAULT_CONFIG, ...(parsed || {}) };
  } catch (err) {
    // do not fail hard for missing or invalid config; return defaults
    return { ...DEFAULT_CONFIG };
  }
}

export function normalizeRepos(input: any[]): Repo[] {
  return input.map(item => {
    if (!item) return {} as Repo;
    if (typeof item === 'string') return { full_name: item } as Repo;
    // common GitHub API fields may use `full_name` or `name`+`owner`
    const full = (item.full_name || (item.owner && item.owner.login && item.name ? `${item.owner.login}/${item.name}` : undefined));
    return { ...item, full_name: full } as Repo;
  });
}

export function isEmptyCandidate(repo: Repo): boolean {
  // heuristic: size === 0 or no pushes/commits info
  if (!repo) return false;
  if (typeof repo.size === 'number') return repo.size === 0;
  // fallback: if pushed_at/updated_at missing, consider candidate
  if (!repo.pushed_at && !repo.updated_at) return true;
  return false;
}

export function isStaleCandidate(repo: Repo, cfg: EvaluateConfig): boolean {
  if (!repo) return false;
  const days = cfg.olderThanDays ?? DEFAULT_CONFIG.olderThanDays!;
  const ts = repo.pushed_at || repo.updated_at;
  if (!ts) return true;
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return true;
  const ageDays = (Date.now() - then) / (1000 * 60 * 60 * 24);
  return ageDays >= days;
}

export function isForkCandidate(repo: Repo, _cfg?: EvaluateConfig): boolean {
  if (!repo) return false;
  // simple: if GitHub marks it as a fork
  return Boolean(repo.fork === true);
}

export async function emitEvaluationOutput(outPath: string, payload: any): Promise<void> {
  if (!outPath) throw new Error('outPath required to emit evaluation output');
  const text = JSON.stringify(payload, null, 2);
  await fs.mkdir(require('path').dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, text, 'utf8');
}

export async function evaluateRepos(params: { inputFile: string; configFile?: string; outPath?: string; }): Promise<Evaluation[]> {
  const { inputFile, configFile, outPath } = params;
  const repos = await loadInputFile(inputFile);
  const cfg = await loadConfigFile(configFile);

  const evaluations: Evaluation[] = repos.map(r => {
    const repo = r as Repo;
    const full = repo.full_name || `${repo.owner?.login || 'unknown'}/${repo.name || 'unknown'}`;

    if (cfg.excludeArchived && repo.archived) return { full_name: full, reason: 'archived', status: 'skipped', repo };
    if (cfg.excludeForks && repo.fork) return { full_name: full, reason: 'fork-excluded', status: 'skipped', repo };

    if (isEmptyCandidate(repo)) return { full_name: full, reason: 'empty', status: 'candidate', repo };
    if (isStaleCandidate(repo, cfg)) return { full_name: full, reason: 'stale', status: 'candidate', repo };
    if (isForkCandidate(repo, cfg)) return { full_name: full, reason: 'fork', status: 'candidate', repo };

    return { full_name: full, reason: 'ok', status: 'ok', repo };
  });

  if (outPath) {
    await emitEvaluationOutput(outPath, { inputPath: inputFile, configPath: configFile, evaluation: evaluations });
  }

  return evaluations;
}

export default {
  loadInputFile,
  loadConfigFile,
  normalizeRepos,
  isEmptyCandidate,
  isStaleCandidate,
  isForkCandidate,
  evaluateRepos,
  emitEvaluationOutput,
};
