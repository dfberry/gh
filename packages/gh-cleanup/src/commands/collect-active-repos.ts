import { GitHubClient } from 'github-rest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getOutputPath } from '../lib/outputOrganizer.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';
import { fetchActiveRepos } from '../lib/repo-utils.js';

export type Args = BaseFlags & { out?: string };

const stepOutputFileName = 'collect-active-repos.json';

export function parseArgs(argv: string[]): Args {
    const base = parseBaseFlags(argv);
    const args: Args = { ...base } as any;
    for (const a of argv) {
        if (a.startsWith('--out=')) args.out = a.split('=')[1];
    }
    return args;
}

export async function runCommand(client: GitHubClient, args: Args) {
    const active = await fetchActiveRepos(client, (args as any).input);
    return { repos: active };
}

export async function writeOutput(result: any, args: Args) {

    const target = args.out || getOutputPath({ group: 'active', filename: stepOutputFileName, config: { rootDir: `${process.cwd()}/generated` } });
    const outDir = path.dirname(target);
    try {
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(target, JSON.stringify(result, null, 2), 'utf8');
    } catch (e) {
        console.error(`Failed to write output to ${target}:`, (e as any)?.message ?? e);
    }
}

export async function collectActiveReposCommand(argv: string[]):Promise<any> {
    const args = parseArgs(argv);
    const client = new GitHubClient({ token: process.env.GH_TOKEN, userAgent: 'gh-cleanup/collect-active' });
    const res = await runCommand(client, args);
    const repos = res?.repos || [];
    await writeOutput(repos, args);
    
    // specific to this command: return metadata about the step
    return {
        step: 'collect-active-repos',
        outputFileName: stepOutputFileName,
        stepSummary:{
            step: 'collect-active-repos',
            repoCount: (repos || []).length
        },
        timestamp: new Date().toISOString()
    }
}

export default collectActiveReposCommand;
