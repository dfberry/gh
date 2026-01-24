import { promises as fs } from 'fs';
import { dirname } from 'path';

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

export class EvaluateBase {
  DEFAULT_CONFIG: EvaluateConfig = {
    olderThanDays: 365,
    excludeForks: true,
    excludeArchived: true,
  };

  async loadInputFile(inputFile: string): Promise<Repo[]> {
    if (!inputFile) throw new Error('inputFile path required');
    const raw = await fs.readFile(inputFile, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return this.normalizeRepos(parsed as Repo[]);
      if (parsed && Array.isArray(parsed.repos)) return this.normalizeRepos(parsed.repos as Repo[]);
      if (parsed && Array.isArray(parsed.items)) return this.normalizeRepos(parsed.items as Repo[]);
      return this.normalizeRepos([parsed] as Repo[]);
    } catch (err) {
      const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      return this.normalizeRepos(lines.map(l => ({ full_name: l })) as Repo[]);
    }
  }

  async loadConfigFile(configFile?: string): Promise<EvaluateConfig> {
    if (!configFile) return { ...this.DEFAULT_CONFIG };
    try {
      const raw = await fs.readFile(configFile, 'utf8');
      const parsed = JSON.parse(raw) as EvaluateConfig;
      return { ...this.DEFAULT_CONFIG, ...(parsed || {}) };
    } catch (err) {
      return { ...this.DEFAULT_CONFIG };
    }
  }

  normalizeRepos(input: any[]): Repo[] {
    return input.map(item => {
      if (!item) return {} as Repo;
      if (typeof item === 'string') return { full_name: item } as Repo;
      const full = (item.full_name || (item.owner && item.owner.login && item.name ? `${item.owner.login}/${item.name}` : undefined));
      return { ...item, full_name: full } as Repo;
    });
  }

  isEmptyCandidate(repo: Repo): boolean {
    if (!repo) return false;
    // Treat a repo as empty only when its reported size is explicitly 0.
    // Previously we inferred emptiness from missing timestamps which produced false positives
    // when gather outputs lacked metadata. This stricter check avoids misclassifying repos.
    if (typeof repo.size === 'number') return repo.size === 0;
    return false;
  }

  isStaleCandidate(repo: Repo, cfg: EvaluateConfig): boolean {
    if (!repo) return false;
    const days = cfg.olderThanDays ?? this.DEFAULT_CONFIG.olderThanDays!;
    const ts = repo.pushed_at || repo.updated_at;
    if (!ts) return true;
    const then = new Date(ts).getTime();
    if (Number.isNaN(then)) return true;
    const ageDays = (Date.now() - then) / (1000 * 60 * 60 * 24);
    return ageDays >= days;
  }

  isForkCandidate(repo: Repo, _cfg?: EvaluateConfig): boolean {
    if (!repo) return false;
    return Boolean(repo.fork === true);
  }

  async emitEvaluationOutput(outPath: string, payload: any): Promise<void> {
    if (!outPath) throw new Error('outPath required to emit evaluation output');
    const text = JSON.stringify(payload, null, 2);
    await fs.mkdir(dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, text, 'utf8');
  }

//   async evaluateRepos(params: { inputFile: string; configFile?: string; outPath?: string; }): Promise<Evaluation[]> {
//     const { inputFile, configFile, outPath } = params;
//     const repos = await this.loadInputFile(inputFile);
//     const cfg = await this.loadConfigFile(configFile);

//     const evaluations: Evaluation[] = repos.map(r => {
//       const repo = r as Repo;
//       const full = repo.full_name || `${repo.owner?.login || 'unknown'}/${repo.name || 'unknown'}`;

//       if (cfg.excludeArchived && repo.archived) return { full_name: full, reason: 'archived', status: 'skipped', repo };
//       if (cfg.excludeForks && repo.fork) return { full_name: full, reason: 'fork-excluded', status: 'skipped', repo };

//       if (this.isEmptyCandidate(repo)) return { full_name: full, reason: 'empty', status: 'candidate', repo };
//       if (this.isStaleCandidate(repo, cfg)) return { full_name: full, reason: 'stale', status: 'candidate', repo };
//       if (this.isForkCandidate(repo, cfg)) return { full_name: full, reason: 'fork', status: 'candidate', repo };

//       return { full_name: full, reason: 'ok', status: 'ok', repo };
//     });

//     if (outPath) {
//       await this.emitEvaluationOutput(outPath, { inputPath: inputFile, configPath: configFile, evaluation: evaluations });
//     }

//     return evaluations;
//   }
}

export default new EvaluateBase();
