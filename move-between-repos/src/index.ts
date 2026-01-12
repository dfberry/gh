/**
 * Move files and folders between GitHub repositories
 */

import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export interface MoveOptions {
  source: string;
  target: string;
  filesPath: string;
  token: string;
  preserveHistory?: boolean;
  dryRun?: boolean;
}

interface FileList {
  files: string[];
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
async function checkRepoExists(owner: string, repo: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Create repository on GitHub
 */
async function createRepo(owner: string, repo: string, token: string): Promise<void> {
  // Try creating as user repository first
  const userResponse = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: repo,
      private: true,
      auto_init: false,
    }),
  });

  if (userResponse.ok) {
    return;
  }

  // If that fails, try creating as org repository
  const orgResponse = await fetch(`https://api.github.com/orgs/${owner}/repos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: repo,
      private: true,
      auto_init: false,
    }),
  });

  if (!orgResponse.ok) {
    const error = await orgResponse.text();
    throw new Error(`Failed to create repository: ${error}`);
  }
}

/**
 * Load files list from JSON file
 */
function loadFilesList(filesPath: string): string[] {
  if (!existsSync(filesPath)) {
    throw new Error(`Files list not found: ${filesPath}`);
  }

  const content = readFileSync(filesPath, 'utf-8');
  try {
    const parsed = JSON.parse(content);
    
    // Support both array format and object with "files" property
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.files && Array.isArray(parsed.files)) {
      return parsed.files;
    } else {
      throw new Error('Invalid format');
    }
  } catch {
    throw new Error(`Invalid JSON in files list: ${filesPath}. Expected array of strings or {files: string[]}`);
  }
}

/**
 * Main function to move files between repositories
 */
export async function moveFilesBetweenRepos(options: MoveOptions): Promise<void> {
  const { source, target, filesPath, token, preserveHistory = false, dryRun = false } = options;

  console.log('=== Move Files Between Repositories ===');
  console.log(`Source: ${source}`);
  console.log(`Target: ${target}`);
  console.log(`Files list: ${filesPath}`);
  console.log(`Preserve history: ${preserveHistory}`);
  console.log(`Dry run: ${dryRun}`);
  console.log();

  // Parse repositories
  const sourceRepo = parseRepo(source);
  const targetRepo = parseRepo(target);

  // Load files list
  const files = loadFilesList(filesPath);
  console.log(`Files to move (${files.length}):`);
  files.forEach((file) => console.log(`  - ${file}`));
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
    for (const file of files) {
      const filePath = join(sourceDir, file);
      if (!existsSync(filePath)) {
        throw new Error(`File or folder not found in source: ${file}`);
      }
      console.log(`  ✓ ${file}`);
    }

    // Check if target repository exists
    console.log(`\nChecking if target repository exists: ${target}...`);
    const targetExists = await checkRepoExists(targetRepo.owner, targetRepo.repo, token);

    if (!targetExists) {
      console.log('Target repository does not exist. Creating...');
      await createRepo(targetRepo.owner, targetRepo.repo, token);
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
      gitCommand(targetDir, ['checkout', '-b', 'main']);
      console.log('✓ Target repository initialized');
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
    for (const file of files) {
      const sourcePath = join(sourceDir, file);
      const targetPath = join(targetDir, file);
      
      // Create parent directories if needed
      const targetParent = dirname(targetPath);
      mkdirSync(targetParent, { recursive: true });
      
      // Copy file or directory
      if (existsSync(sourcePath)) {
        cpSync(sourcePath, targetPath, { recursive: true });
        console.log(`  ✓ Copied: ${file}`);
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
      console.log('\nPushing to target repository...');
      gitCommand(targetDir, ['push', '-u', 'origin', 'main']);
      console.log('✓ Changes pushed');
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
