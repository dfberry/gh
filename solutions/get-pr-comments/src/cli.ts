#!/usr/bin/env node
import { fetchPRComments } from './index.js';

async function main() {
  const [owner, repo, prNumberStr, username] = process.argv.slice(2);
  if (!owner || !repo || !prNumberStr) {
    console.error('Usage: get-pr-comments <owner> <repo> <prNumber> [username]');
    process.exit(1);
  }
  const prNumber = Number(prNumberStr);
  if (isNaN(prNumber)) {
    console.error('prNumber must be a number');
    process.exit(1);
  }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  if (!token) {
    if (username) {
      console.error('Warning: No GitHub token provided. Username filtering may not work correctly without authentication.');
    } else {
      console.error('Warning: No GitHub token provided. You may hit rate limits.');
    }
  } else {
    console.log('Using GitHub token from environment variable.');
  }

  try {
    const comments = await fetchPRComments(owner, repo, prNumber, username, token);
    console.log(JSON.stringify(comments, null, 2));
  } catch (err) {
    console.error('Error fetching PR comments:', err);
    process.exit(2);
  }
}

main();
