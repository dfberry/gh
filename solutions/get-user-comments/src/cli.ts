#!/usr/bin/env node
import { createGitHubClient, getUserPrComments } from 'github-rest';
import { writeFileSync } from 'fs';
import path from 'path';

async function main() {
  const [owner, repo, username, since, until, filePathFilter] = process.argv.slice(2);
  if (!owner || !repo || !username) {
    console.error('Usage: get-user-comments <owner> <repo> <username> [since] [until] [filePathFilter]');
    process.exit(1);
  }

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Warning: No GitHub token provided. You may hit rate limits.');
  } else {
    console.log('Using GitHub token from environment variable.');
  }

  const client = createGitHubClient({ token });
  const options = {
    owner,
    repo,
    username,
    since,
    until,
    filePaths: filePathFilter ? [filePathFilter] : undefined,
  };
  try {
    const comments = await getUserPrComments(client, options);
    const outPath = path.resolve(process.cwd(), `comments-${owner}-${repo}-${username}.json`);
    writeFileSync(outPath, JSON.stringify(comments, null, 2));
    console.log(`Saved ${comments.length} comments to ${outPath}`);
  } catch (err) {
    console.error('Error fetching user PR comments:', err);
    process.exit(2);
  }
}

main();
