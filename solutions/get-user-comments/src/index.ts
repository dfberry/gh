import { createGitHubClient, getUserPrComments } from 'github-rest';
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const [,, owner, repo, username, since, until, filePathFilter] = process.argv;
  if (!owner || !repo || !username) {
    console.error('Usage: npm start -- <owner> <repo> <username> [since] [until] [filePathFilter]');
    process.exit(1);
  }

  const client = createGitHubClient({ token: process.env.GH_TOKEN });
  const options = {
    owner,
    repo,
    username,
    since,
    until,
    filePaths: filePathFilter ? [filePathFilter] : undefined,
  };
  const comments = await getUserPrComments(client, options);
  const outPath = path.resolve(process.cwd(), `comments-${owner}-${repo}-${username}.json`);
  await fs.writeFile(outPath, JSON.stringify(comments, null, 2));
  console.log(`Saved ${comments.length} comments to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
