#!/usr/bin/env node
import { writeFile } from 'fs/promises';
import { fetchPRComments } from './index.js';

type GitHubLikeError = {
  status?: number;
  headers?: Record<string, string>;
  body?: {
    message?: string;
    documentation_url?: string;
  };
  message?: string;
};

function formatGitHubError(err: unknown): string[] {
  const lines: string[] = [];
  const githubErr = err as GitHubLikeError;
  const status = githubErr?.status;
  const bodyMessage = githubErr?.body?.message;
  const docUrl = githubErr?.body?.documentation_url;
  const rateLimitRemaining = githubErr?.headers?.['x-ratelimit-remaining'];

  if (status !== undefined) {
    lines.push(`GitHub API status: ${status}`);
  }

  if (bodyMessage) {
    lines.push(`GitHub API message: ${bodyMessage}`);
  }

  if (docUrl) {
    lines.push(`GitHub docs: ${docUrl}`);
  }

  if (status === 401) {
    lines.push('Token authentication failed. The token may be expired, revoked, or malformed.');
    lines.push('Generate a new token and set GH_TOKEN or GITHUB_TOKEN, then retry.');
  }

  if (status === 403 && rateLimitRemaining === '0') {
    lines.push('GitHub API rate limit reached. Retry after the rate limit resets.');
  }

  if (status === 403 && rateLimitRemaining !== '0') {
    lines.push('Token is authenticated but lacks access to this repository or endpoint.');
  }

  if (githubErr?.message) {
    lines.push(`Error detail: ${githubErr.message}`);
  }

  return lines;
}

async function main() {
  const [owner, repo, prNumberStr] = process.argv.slice(2);
  if (!owner || !repo || !prNumberStr) {
    console.error('Usage: get-pr-comments <owner> <repo> <prNumber>');
    process.exit(1);
  }
  const prNumber = Number(prNumberStr);
  if (isNaN(prNumber)) {
    console.error('prNumber must be a number');
    process.exit(1);
  }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const tokenSource = process.env.GH_TOKEN ? 'GH_TOKEN' : process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : undefined;

  if (!token) {
    console.error('Warning: No GitHub token provided. You may hit rate limits.');
  } else {
    console.log(`Using GitHub token from ${tokenSource}.`);
  }

  try {
    const comments = await fetchPRComments(owner, repo, prNumber, token);
    const fileName = `${owner}-${repo}-${prNumber}-comments.json`;
    await writeFile(fileName, JSON.stringify(comments, null, 2));
    console.log(`Comments written to ${fileName}`);
  } catch (err) {
    console.error('Error fetching PR comments.');
    for (const line of formatGitHubError(err)) {
      console.error(line);
    }
    process.exit(2);
  }
}

main();
