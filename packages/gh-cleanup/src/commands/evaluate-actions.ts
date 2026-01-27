/**
 * Command: evaluate-actions
 *
 * Purpose:
 *   Inspect GitHub Actions workflows across authenticated user's repositories
 *   and report workflow file name, workflow name, description (if present in file),
 *   create date, last run time, and last successful run time.
 *
 * Exports:
 *   - `parseArgs(argv)`, `runCommand(client, args)`, `writeOutput(result, args)`
 *   - `evaluateActionsCommand(argv)` — thin CLI wrapper used by the bin
 */
import type { GitHubClient } from 'github-rest';
import { emitOutput, formatJsonOutput, addGeneratedTimestamp } from '../lib/report.js';
import { actions as ghActions } from 'github-rest';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { readJsonFile } from '../lib/files.js';

export type Args = BaseFlags & { output?: 'json' | 'md' };

export function parseArgs(argv: string[]): Args {
  const base = parseBaseFlags(argv);
  const args: Args = { ...base, output: undefined };
  for (const a of argv) {
    if (a.startsWith('--output=')) args.output = (a.split('=')[1] as any) || undefined;
  }
  return args;
}

function decodeContent(encoded: string | undefined, encoding?: string | null): string | null {
  if (!encoded) return null;
  try {
    if ((encoding ?? 'base64') === 'base64') {
      return Buffer.from(encoded, 'base64').toString('utf8');
    }
    return encoded;
  } catch (e) {
    return null;
  }
}

function extractDescriptionFromWorkflow(content: string | null): string | null {
  if (!content) return null;
  // naive YAML extraction: look for a top-level 'description:' key
  const m = content.match(/^[ \t-]*description:\s*(?:"([^"]*)"|'([^']*)'|([^\n\r]*))/im);
  if (!m) return null;
  return (m[1] || m[2] || m[3] || '').trim();
}

export async function runCommand(client: GitHubClient, args: Args): Promise<any> {
  // Deconstruct commonly used args
  const { input, out, owner, repo } = args as any;
  if (!input) throw new Error('Missing --input (actions data file)');

  // Read input JSON using shared helper
  const rawData = await readJsonFile<any>(input as string);
  if (!rawData) throw new Error('Invalid or unreadable actions data file');
  let actionsData: any[] = Array.isArray(rawData) ? rawData : [rawData];

  // If the provided input is a per-repo normalized file (e.g. ["owner/repo"]),
  // try to find a gathered actions file in the same directory and prefer it.
  try {
    if (Array.isArray(actionsData) && actionsData.length > 0 && typeof actionsData[0] === 'string') {
      const dir = path.dirname(input as string);
      const files = await fs.readdir(dir);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const p = path.join(dir, f);
        if (p === input) continue;
        try {
          const cand = await readJsonFile<any>(p);
          if (cand && Array.isArray(cand) && cand.length > 0 && cand[0] && cand[0].actions && Array.isArray(cand[0].actions.workflow_runs) && cand[0].actions.workflow_runs.length > 0) {
            actionsData = cand;
            break;
          }
        } catch (e) {
          // ignore parse/read errors for candidate files
        }
      }
    }
  } catch (e) {
    // ignore any dir-read errors and proceed with original actionsData
    console.log('Warning: could not scan for gathered actions data:', String(e));
  }

  const results: any[] = [];

  for (const item of actionsData) {
    let owner: string | undefined;
    let repo: string | undefined;
    if (typeof item === 'string') {
      [owner, repo] = item.split('/');
    } else if (item.owner && item.repo) {
      owner = item.owner;
      repo = item.repo;
    } else if (item.full_name) {
      [owner, repo] = (item.full_name as string).split('/');
    }
    if (!owner || !repo) {
      // cannot evaluate this entry
      continue;
    }

    const repoResult: any = { full_name: `${owner}/${repo}`, html_url: `https://github.com/${owner}/${repo}`, workflows: [] };

    try {
      // If the gather run included actions data (workflow_runs), prefer using it
      const gathered = (item && item.actions) || null;
      if (gathered && Array.isArray(gathered.workflow_runs) && gathered.workflow_runs.length > 0) {
        // Group runs by workflow_id
        const runs: any[] = gathered.workflow_runs;
        const byWorkflow = new Map<number, any[]>();
        for (const r of runs) {
          const wid = r.workflow_id || r.workflowId || 0;
          if (!byWorkflow.has(wid)) byWorkflow.set(wid, []);
          byWorkflow.get(wid)!.push(r);
        }

        for (const [wid, wRuns] of byWorkflow.entries()) {
          // sort descending by created_at
          wRuns.sort((a: any, b: any) => {
            const da = Date.parse(a.created_at || a.run_started_at || a.updated_at || '') || 0;
            const db = Date.parse(b.created_at || b.run_started_at || b.updated_at || '') || 0;
            return db - da;
          });
          const lastRun = wRuns[0] || null;
          const lastSuccess = wRuns.find((r: any) => r.conclusion === 'success') || null;

          const wfEntry: any = {
            id: wid,
            file: lastRun?.path || lastRun?.workflow_url || '',
            name: lastRun?.name || lastRun?.display_title || '',
            html_url: lastRun?.workflow_url || null,
            created_at: (wRuns[wRuns.length - 1] && (wRuns[wRuns.length - 1].created_at || '')) || '',
          };
          if (lastRun) {
            wfEntry.last_run = lastRun.created_at || lastRun.updated_at || lastRun.run_started_at || '';
            wfEntry.last_run_conclusion = lastRun.conclusion || null;
            wfEntry.last_run_html_url = lastRun.html_url || lastRun?.html_url || null;
          }
          if (lastSuccess) {
            wfEntry.last_successful_run = lastSuccess.created_at || lastSuccess.updated_at || lastSuccess.run_started_at || '';
            wfEntry.last_successful_run_html_url = lastSuccess.html_url || null;
          }
          repoResult.workflows.push(wfEntry);
        }
      } else {
        // fallback to API when gather data not present
        const wfResp = await ghActions.listRepoWorkflows(client as any, owner, repo);
        const workflows = (wfResp && wfResp.workflows) || [];
        for (const wf of workflows) {
          const wfEntry: any = {
            id: wf.id,
            file: wf.path || wf.file || '',
            name: wf.name || '',
            html_url: wf.html_url || '',
            created_at: wf.created_at || wf.createdAt || '',
          };

          try {
            const runsResp = await ghActions.listWorkflowRuns(client as any, owner, repo, wf.id, 20);
            const runs = (runsResp && runsResp.workflow_runs) || [];
            const lastRun = runs[0] || null;
            const lastSuccess = runs.find((r: any) => r.conclusion === 'success') || null;
            if (lastRun) {
              wfEntry.last_run = lastRun.created_at || lastRun.updated_at || lastRun.run_started_at || '';
              wfEntry.last_run_conclusion = lastRun.conclusion || null;
              wfEntry.last_run_html_url = lastRun.html_url || null;
            }
            if (lastSuccess) {
              wfEntry.last_successful_run = lastSuccess.created_at || lastSuccess.updated_at || lastSuccess.run_started_at || '';
              wfEntry.last_successful_run_html_url = lastSuccess.html_url || null;
            }
          } catch (e) {
            wfEntry.error = String(e);
          }

          repoResult.workflows.push(wfEntry);
        }
      }
    } catch (e) {
      repoResult.error = String(e);
    }

    results.push(repoResult);
  }

  return { repos: results };
}

export async function writeOutput(result: any, args: Args) {
  const data = (result && result.repos) || [];
  if (args.output === 'md') {
    // build markdown: index of repos, then H2 per repo with a table of workflows
    const idxLines: string[] = [];
    idxLines.push('# Actions Report\n');
    idxLines.push('## Repository Index\n');
    for (const r of data) {
      const link = r.html_url ? `[${r.full_name}](${r.html_url})` : r.full_name;
      idxLines.push(`- ${link}`);
    }
    idxLines.push('\n');

    const sections: string[] = [];
    for (const r of data) {
      sections.push(`## ${r.full_name}`);
      if (r.html_url) sections.push(`Repo: ${r.html_url}`);
      sections.push('');
      // table header
      sections.push('| File | Name | Description | Created At | Last Run | Last Successful |');
      sections.push('| --- | --- | --- | --- | --- | --- |');
      for (const wf of r.workflows || []) {
        const fileLink = wf.html_url ? `[${wf.file}](${wf.html_url})` : (wf.file || '');
        const name = wf.name ?? '';
        const desc = wf.description ? wf.description.replace(/\|/g, '\\|') : '';
        const created = wf.created_at ?? '';
        const lastRun = wf.last_run ?? '';
        const lastSuccess = wf.last_successful_run ?? '';
        sections.push(`| ${fileLink} | ${name} | ${desc} | ${created} | ${lastRun} | ${lastSuccess} |`);
      }
      sections.push('');
    }

    const md = addGeneratedTimestamp(idxLines.join('\n') + '\n' + sections.join('\n'), 'GitHub Actions Report');
    await emitOutput(md, args.out || 'actions.md');
    return;
  }

  // default: JSON
  if (args.out) await emitOutput(formatJsonOutput(data), args.out);
}

export async function evaluateActionsCommand(argv: string[], client?: GitHubClient) {
  const args = parseArgs(argv);
  if (!client) throw new Error('GitHub client is required');
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
