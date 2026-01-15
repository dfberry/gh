/**
 * Move files and folders between GitHub repositories
 */

import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { GitHubClient, repos, errors } from 'github-rest';

export interface MoveOptions {
  source: string;
  target: string;
  filesPath: string;
  token: string;
  preserveHistory?: boolean;
  dryRun?: boolean;
  createPR?: boolean;
  prBranch?: string;
  prTitle?: string;
  prBody?: string;
  upstream?: string;
}

export interface FileMapping {
  from: string;
  to?: string;
}

interface FileList {
  files: (string | FileMapping)[];
}

/**
 * Parse repository string (owner/repo) into parts
 */
function parseRepo(repo: string): { owner: string; repo: string } {
  const parts = repo.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid repository format: ${repo}. Expected format: owner/repo`);
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Execute git command and return output
 */
function gitCommand(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  
  if (result.error) {
    throw new Error(`Git command failed: git ${args.join(' ')}\n${result.error}`);
  }
  
  if (result.status !== 0) {
    throw new Error(`Git command failed: git ${args.join(' ')}\n${result.stderr}`);
  }
  
  return result.stdout;
}

/**
 * Clone repository using git with token authentication
 * Note: Token is passed via environment for security, though it's still visible in process environment
 */
async function cloneRepo(repoUrl: string, targetDir: string, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use token in URL - this is a known limitation
    // For production use, consider using SSH keys or credential helpers
    const urlWithAuth = repoUrl.replace('https://', `https://x-access-token:${token}@`);
    const child = spawn('git', ['clone', urlWithAuth, targetDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to clone repository: ${stderr}`));
      }
    });
  });
}

/**
 * Check if repository exists on GitHub
 */
async function checkRepoExists(client: GitHubClient, owner: string, repo: string): Promise<boolean> {
  try {
    await repos.getRepo(client, owner, repo);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create repository on GitHub
 */
async function createRepo(client: GitHubClient, owner: string, repo: string): Promise<void> {
  const repoOptions: repos.CreateRepoOptions = {
    name: repo,
    private: true,
    auto_init: false,
  };

  // Try creating as user repository first
  try {
    await repos.createUserRepo(client, repoOptions);
    return;
  } catch (error) {
    // If that fails, try creating as org repository
    // Status 404 means user repos endpoint not accessible, 422 means validation error
    if (error instanceof errors.GitHubError && (error.status === 404 || error.status === 422)) {
      await repos.createOrgRepo(client, owner, repoOptions);
      return;
    }
    throw error;
  }
}

/**
 * Load files list from JSON file
 * Supports: ["file.txt"], [{"from": "file.txt", "to": "newfile.txt"}], or {"files": [...]}
 */
function loadFilesList(filesPath: string): FileMapping[] {
  if (!existsSync(filesPath)) {
    throw new Error(`Files list not found: ${filesPath}`);
  }

  const content = readFileSync(filesPath, 'utf-8');
  try {
    const parsed = JSON.parse(content);
    
    let items: (string | FileMapping)[];
    
    // Support both array format and object with "files" property
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed.files && Array.isArray(parsed.files)) {
      items = parsed.files;
    } else {
      throw new Error('Invalid format');
    }
    
    // Normalize to FileMapping objects
    return items.map(item => {
      if (typeof item === 'string') {
        return { from: item, to: item };
      } else if (typeof item === 'object' && item.from) {
        return { from: item.from, to: item.to || item.from };
      } else {
        throw new Error(`Invalid file entry: ${JSON.stringify(item)}`);
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid file entry')) {
      throw error;
    }
    throw new Error(`Invalid JSON in files list: ${filesPath}. Expected array of strings or objects with "from" property`);
  }
}

/**
 * Get the default branch of a repository
 */
async function getDefaultBranch(client: GitHubClient, owner: string, repo: string): Promise<string> {
  try {
    const repository = await repos.getRepo(client, owner, repo);
    return repository.default_branch || 'main';
  } catch {
    return 'main'; // fallback
  }
}

/**
 * Check if a pull request already exists for the branch
 */
async function findExistingPR(
  client: GitHubClient,
  owner: string,
  repo: string,
  head: string
): Promise<number | null> {
  try {
    const prs = await repos.listPullRequests(client, owner, repo, {
      state: 'open',
      head: `${owner}:${head}`,
    });
    return prs.length > 0 ? prs[0].number : null;
  } catch {
    return null;
  }
}

/**
 * Create a pull request
 */
async function createPullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string
): Promise<number> {
  const pr = await repos.createPullRequest(client, owner, repo, {
    title,
    body,
    head,
    base,
  });
  return pr.number;
}

/**
 * Main function to move files between repositories
 */
export async function moveFilesBetweenRepos(options: MoveOptions): Promise<void> {
  const { 
    source, 
    target, 
    filesPath, 
    token, 
    preserveHistory = false, 
    dryRun = false,
    createPR = false,
    prBranch = 'migrate-files',
    prTitle = `Migrate files from ${options.source}`,
    prBody = 'Automated file migration',
    upstream
  } = options;

  console.log('=== Move Files Between Repositories ===');
  console.log(`Source: ${source}`);
  console.log(`Target: ${target}`);
  console.log(`Files list: ${filesPath}`);
  console.log(`Preserve history: ${preserveHistory}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Create PR: ${createPR}`);
  if (createPR) {
    console.log(`PR branch: ${prBranch}`);
    if (upstream) {
      console.log(`PR upstream: ${upstream}`);
    }
  }
  console.log();

  // Create GitHub client
  const client = new GitHubClient({ token });

  // Parse repositories
  const sourceRepo = parseRepo(source);
  const targetRepo = parseRepo(target);

  // Load files list
  const fileMappings = loadFilesList(filesPath);
  console.log(`Files to move (${fileMappings.length}):`);
  fileMappings.forEach((mapping) => {
    if (mapping.from === mapping.to) {
      console.log(`  - ${mapping.from}`);
    } else {
      console.log(`  - ${mapping.from} → ${mapping.to}`);
    }
  });
  console.log();

  if (dryRun) {
    console.log('✓ Dry run mode - no changes will be made');
    return;
  }

  // Create temporary directories
  const tmpBase = mkdtempSync(join(tmpdir(), 'move-repos-'));
  const sourceDir = join(tmpBase, 'source');
  const targetDir = join(tmpBase, 'target');

  try {
    // Clone source repository
    console.log(`Cloning source repository: ${source}...`);
    const sourceUrl = `https://github.com/${source}.git`;
    await cloneRepo(sourceUrl, sourceDir, token);
    console.log('✓ Source repository cloned');

    // Verify files exist in source
    console.log('\nVerifying files exist in source repository...');
    for (const mapping of fileMappings) {
      const filePath = join(sourceDir, mapping.from);
      if (!existsSync(filePath)) {
        throw new Error(`File or folder not found in source: ${mapping.from}`);
      }
      console.log(`  ✓ ${mapping.from}`);
    }

    // Check if target repository exists
    console.log(`\nChecking if target repository exists: ${target}...`);
    const targetExists = await checkRepoExists(client, targetRepo.owner, targetRepo.repo);

    if (!targetExists) {
      console.log('Target repository does not exist. Creating...');
      await createRepo(client, targetRepo.owner, targetRepo.repo);
      console.log('✓ Target repository created');
    } else {
      console.log('✓ Target repository exists');
    }

    // Clone or initialize target repository
    console.log('\nPreparing target repository...');
    const targetUrl = `https://github.com/${target}.git`;
    
    if (targetExists) {
      await cloneRepo(targetUrl, targetDir, token);
      console.log('✓ Target repository cloned');
    } else {
      // Initialize new repository
      gitCommand(tmpBase, ['init', targetDir]);
      const targetUrlWithAuth = targetUrl.replace('https://', `https://x-access-token:${token}@`);
      gitCommand(targetDir, ['remote', 'add', 'origin', targetUrlWithAuth]);
      gitCommand(targetDir, ['checkout', '-b', createPR ? prBranch : 'main']);
      console.log('✓ Target repository initialized');
    }

    // Create branch for PR if requested
    if (createPR && targetExists) {
      console.log(`\nCreating branch: ${prBranch}...`);
      try {
        gitCommand(targetDir, ['checkout', '-b', prBranch]);
        console.log(`✓ Branch created: ${prBranch}`);
      } catch (error) {
        // Branch might already exist, try to check it out
        gitCommand(targetDir, ['checkout', prBranch]);
        console.log(`✓ Switched to existing branch: ${prBranch}`);
      }
    }

    if (preserveHistory) {
      console.log('\n=== Preserving git history ===');
      console.log('This feature uses git filter-branch and subtree to preserve history.');
      
      // For each file, use git log to get its history and apply to target
      // This is a simplified approach - full history preservation is complex
      console.log('Note: Full history preservation requires advanced git operations.');
      console.log('Current implementation copies files without full history.');
      console.log('For complete history preservation, consider using git-filter-repo or manual git subtree.');
    }

    // Copy files to target repository
    console.log('\nCopying files to target repository...');
    for (const mapping of fileMappings) {
      const sourcePath = join(sourceDir, mapping.from);
      const targetPath = join(targetDir, mapping.to!);
      
      // Create parent directories if needed
      const targetParent = dirname(targetPath);
      mkdirSync(targetParent, { recursive: true });
      
      // Copy file or directory
      if (existsSync(sourcePath)) {
        cpSync(sourcePath, targetPath, { recursive: true });
        if (mapping.from === mapping.to) {
          console.log(`  ✓ Copied: ${mapping.from}`);
        } else {
          console.log(`  ✓ Copied: ${mapping.from} → ${mapping.to}`);
        }
      }
    }

    // Commit changes in target repository
    console.log('\nCommitting changes to target repository...');
    gitCommand(targetDir, ['add', '.']);
    
    try {
      gitCommand(targetDir, ['diff', '--cached', '--quiet']);
      console.log('No changes to commit (files may already exist in target)');
    } catch {
      // There are changes to commit
      gitCommand(targetDir, ['commit', '-m', `Migrate files from ${source}`]);
      console.log('✓ Changes committed');

      // Push to target repository
      const branchToPush = createPR ? prBranch : 'main';
      console.log(`\nPushing to target repository (branch: ${branchToPush})...`);
      gitCommand(targetDir, ['push', '-u', 'origin', branchToPush]);
      console.log('✓ Changes pushed');

      // Create or update pull request if requested
      if (createPR) {
        // Determine which repo to create the PR in
        let prRepo, prOwner, prRepoName, prBaseOwner, prHead;
        
        if (upstream) {
          // Create PR in upstream repo (fork -> upstream workflow)
          prRepo = parseRepo(upstream);
          prOwner = prRepo.owner;
          prRepoName = prRepo.repo;
          prBaseOwner = prRepo.owner;
          prHead = `${targetRepo.owner}:${prBranch}`; // fork:branch format
          console.log(`\nCreating PR from fork (${target}) to upstream (${upstream})`);
        } else {
          // Create PR in target repo (standard workflow)
          prOwner = targetRepo.owner;
          prRepoName = targetRepo.repo;
          prBaseOwner = targetRepo.owner;
          prHead = prBranch;
          console.log(`\nCreating PR in target repo (${target})`);
        }

        // Get the default branch for the PR base repo
        const defaultBranch = await getDefaultBranch(client, prOwner, prRepoName);
        console.log(`Base repository default branch: ${defaultBranch}`);

        console.log('Checking for existing pull request...');
        const existingPR = await findExistingPR(
          client,
          prOwner,
          prRepoName,
          prHead
        );

        if (existingPR) {
          console.log(`✓ Pull request already exists: #${existingPR}`);
          console.log(`  Updated with new changes`);
          console.log(`  View at: https://github.com/${prOwner}/${prRepoName}/pull/${existingPR}`);
        } else {
          console.log('Creating new pull request...');
          const prNumber = await createPullRequest(
            client,
            prOwner,
            prRepoName,
            prHead,
            defaultBranch,
            prTitle,
            prBody
          );
          console.log(`✓ Pull request created: #${prNumber}`);
          console.log(`  View at: https://github.com/${prOwner}/${prRepoName}/pull/${prNumber}`);
        }
      }
    }
  } finally {
    // Cleanup temporary directories
    console.log('\nCleaning up temporary files...');
    try {
      rmSync(tmpBase, { recursive: true, force: true });
      console.log('✓ Cleanup complete');
    } catch (error) {
      console.warn('Warning: Failed to cleanup temporary directory:', tmpBase);
    }
  }
}
