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

import { GitHubClient, repos, pagination, actions } from 'github-rest';
import { emitOutput, formatJsonOutput, addGeneratedTimestamp } from '../lib/report.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';

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
  const allRepos = await pagination.paginateAll(async (page) => {
    return repos.listAuthenticatedUserRepos(client, page, 100);
  });

  const out: any[] = [];

  for (const r of allRepos) {
    const owner = r.owner.login;
    const name = r.name;
    try {
      const wfRes: any = await actions.listRepoWorkflows(client, owner, name);
      const workflows: any[] = (wfRes && wfRes.workflows) || [];
      if (!workflows || workflows.length === 0) continue;

      const repoEntry: any = { full_name: r.full_name, html_url: r.html_url, workflows: [] };

      for (const wf of workflows) {
        const wfEntry: any = {
          file: wf.path ?? null,
          name: wf.name ?? null,
          created_at: wf.created_at ?? null,
          description: null,
          last_run: null,
          last_successful_run: null,
          html_url: wf.html_url ?? null,
        };

        // try to get description from workflow file contents
        try {
          if (wf.path) {
            const contents = await actions.getRepoContent(client, owner, name, wf.path);
            const decoded = decodeContent(contents?.content ?? contents?.raw_content, contents?.encoding);
            const desc = extractDescriptionFromWorkflow(decoded);
            if (desc) wfEntry.description = desc;
          }
        } catch (e) {
          // ignore content fetch errors (private files, etc.)
        }

        // last run
        try {
          const runsRes: any = await actions.listWorkflowRuns(client, owner, name, wf.id, 1);
          const runs = (runsRes && runsRes.workflow_runs) || [];
          if (runs.length > 0) wfEntry.last_run = runs[0].created_at ?? runs[0].updated_at ?? null;
        } catch (e) {
          // ignore
        }

        // last successful run — search recent runs for a successful conclusion
        try {
          const runsRes2: any = await actions.listWorkflowRuns(client, owner, name, wf.id, 50);
          const runs2 = (runsRes2 && runsRes2.workflow_runs) || [];
          const success = runs2.find((rr: any) => rr.conclusion === 'success');
          if (success) wfEntry.last_successful_run = success.created_at ?? success.updated_at ?? null;
        } catch (e) {
          // ignore
        }

        repoEntry.workflows.push(wfEntry);
      }

      out.push(repoEntry);
    } catch (err: any) {
      // skip repos where actions endpoint is not accessible
      continue;
    }
  }

  return { repos: out };
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

export async function evaluateActionsCommand(argv: string[]) {
  const args = parseArgs(argv);
  const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/evaluate-actions' });
  const res = await runCommand(client, args);
  await writeOutput(res, args);
}
