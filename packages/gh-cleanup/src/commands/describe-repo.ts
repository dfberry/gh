import * as fs from 'fs/promises';
import * as path from 'path';
import { LLMConfig } from 'llm-completion';
import { describeHelpers } from 'github-rest';
import { describeRepoWithLLM, createClient } from '../lib/describe-common.js';
import { parseBaseFlags, BaseFlags } from '../lib/flags.js';

export type Args = BaseFlags & { repo?: string; apply?: boolean; prompt?: string; out?: string; openaiKey?: string; openaiModel?: string; openaiTemp?: number; openaiEndpoint?: string };

export function parseArgs(argv: string[]): Args {
	const flags = argv.slice(0);
	const base = parseBaseFlags(flags);
	const args: Args = { ...base, repo: undefined, apply: flags.includes('--apply'), prompt: undefined, out: undefined };
	for (const a of flags) {
		if (a.startsWith('--openai-key=')) args.openaiKey = a.split('=')[1];
		if (a.startsWith('--openai-model=')) args.openaiModel = a.split('=')[1];
		if (a.startsWith('--openai-temp=')) args.openaiTemp = Number(a.split('=')[1]);
		if (a.startsWith('--openai-endpoint=')) args.openaiEndpoint = a.split('=')[1];
		if (a.startsWith('--out=')) args.out = a.split('=')[1];
		if (a.startsWith('--prompt=')) args.prompt = a.split('=')[1];
		if (a.startsWith('--repo=')) args.repo = a.split('=')[1];
	}
	return args;
}

export async function runCommand(client: ReturnType<typeof createClient>, args: Args) {
	const cfg: LLMConfig = {};
	if (args.openaiKey) cfg.key = args.openaiKey;
	if (args.openaiModel) cfg.model = args.openaiModel;
	if (args.openaiTemp !== undefined) cfg.temperature = args.openaiTemp;
	if (args.openaiEndpoint) cfg.endpoint = args.openaiEndpoint;
	if (args.debug) cfg.debug = { ...(cfg.debug || {}), enabled: true, dir: args.debugDir };

	if (!args.repo) throw new Error('Missing required flag --repo=owner/repo');
	const [owner, repo] = (args.repo || '').split('/');
	if (!owner || !repo) throw new Error('Invalid --repo value, expected owner/repo');

	const ai = await describeRepoWithLLM(client as any, cfg, args.prompt, owner, repo);
	let appliedDescription = false;
	let appliedTopics = false;
	if (args.apply) {
		try {
			await describeHelpers.updateRepo(client as any, owner, repo, { description: ai.short_description });
			appliedDescription = true;
		} catch (err) {
			console.error('Failed to apply description:', (err as any)?.message || err);
		}
		try {
			await describeHelpers.updateTopics(client as any, owner, repo, (ai.topics || []).slice(0, 20));
			appliedTopics = true;
		} catch (err) {
			console.error('Failed to apply topics:', (err as any)?.message || err);
		}
		console.log(`Apply results: description=${appliedDescription} topics=${appliedTopics}`);
	}

	return { owner, repo, ai, applied: { description: appliedDescription, topics: appliedTopics } };
}

export async function writeOutput(result: any, args: Args) {
	const { owner, repo, ai, applied } = result;
	if (args.out) {
		if (args.out.endsWith('.json')) {
			const out = [{ repo: `${owner}/${repo}`, ai, applied }];
			await fs.writeFile(args.out, JSON.stringify(out, null, 2), 'utf8');
			console.log('Wrote', args.out);
		} else if (args.out.endsWith('.md') || args.out.endsWith('.markdown')) {
			const parts: string[] = [];
			parts.push(`## ${owner}/${repo}\n`);
			parts.push(`- **Applied description**: ${applied.description}\n- **Applied topics**: ${applied.topics}\n`);
			parts.push('```json');
			parts.push(JSON.stringify(ai, null, 2));
			parts.push('```\n');
			await fs.writeFile(args.out, parts.join('\n'), 'utf8');
			console.log('Wrote', args.out);
		} else {
			const out = [{ repo: `${owner}/${repo}`, ai, applied }];
			await fs.writeFile(args.out, JSON.stringify(out, null, 2), 'utf8');
			console.log('Wrote', args.out);
		}
	} else {
		if (args.apply) console.log(JSON.stringify({ ai, applied }, null, 2));
		else console.log(JSON.stringify(ai, null, 2));
	}
}

export async function describeRepoCommand(argv: string[]) {
	const args = parseArgs(argv);
	const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
	const client = createClient(token);
	const res = await runCommand(client as any, args);
	await writeOutput(res, args);
}

