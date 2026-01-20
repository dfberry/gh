#!/usr/bin/env node
// scripts/check-github-rest-imports.js
// -------------------------------------------------------------------------
// This script enforces import rules for the github-rest package in the repo.
// It is designed to be extensible: add more rules to the `rules` array below.
//
// Current rule: Only allow imports of 'github-rest' by package name, not by
// file path (e.g., 'github-rest/src/...' or 'github-rest/dist/...').
//
// Usage: Called from verify-github-rest.sh or directly via node.
//
// To add more requirements, add new rule objects to the `rules` array.
// -------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// Root of the monorepo
const ROOT = path.resolve(__dirname, '..');
// Folders to scan for source files
const PACKAGES = ['packages', 'solutions'];
// The package name to enforce import rules for
const GITHUB_REST = 'github-rest';

// Array of rule objects. Each rule has:
// - name: description
// - test(importPath): returns true if the import is a violation
// - message(file, importPath): error message for violations
// Add more rules here as needed for extensibility.
const rules = [
  {
    name: 'No file path import for github-rest',
    // Only allow 'github-rest', not sub-paths like 'github-rest/src/...'
    test: (importPath) => {
      if (importPath === GITHUB_REST) return false; // allowed
      if (importPath.startsWith(`${GITHUB_REST}/`)) return true; // violation
      return false; // not a github-rest import
    },
    message: (file, importPath) =>
      `Invalid import in ${file}: '${importPath}'. Use only 'github-rest', not a file path.`
  },
  // Add more rules here
];

// Scan a single file for import violations
function scanFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  // Regexes to match various import-like patterns:
  // - ES module imports:   import ... from '...'
  // - Bare imports:        import '...'
  // - Dynamic imports:     import('...')
  // - CommonJS require:    require('...')
  // - Re-exports:          export ... from '...'
  const importFromRegex = /import\s+[^'"]*['"]([^'"]+)['"]/g;
  const bareImportRegex = /import\s*['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requireRegex = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  const exportFromRegex = /export\s+[^'"]*from\s*['"]([^'"]+)['"]/g;

  const importRegexes = [
    importFromRegex,
    bareImportRegex,
    dynamicImportRegex,
    requireRegex,
    exportFromRegex
  ];

  let errors = [];

  for (const regex of importRegexes) {
    if (stat.isDirectory()) {
    while ((match = regex.exec(content))) {
      const importPath = match[1];
      // Check all rules for each import
      for (const rule of rules) {
        if (rule.test(importPath)) {
          errors.push(rule.message(file, importPath));
        }
      }
    }
  }
  return errors;
}

// Recursively walk a directory and return all .ts/.js files
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      // Recurse into subdirectories
      results = results.concat(walk(filePath));
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      results.push(filePath);
    }
  }
  return results;
}

// Main logic: scan all files in target folders
let allErrors = [];
for (const pkg of PACKAGES) {
  const pkgPath = path.join(ROOT, pkg);
  if (!fs.existsSync(pkgPath)) continue; // skip missing folders
  const files = walk(pkgPath);
  for (const file of files) {
    allErrors = allErrors.concat(scanFile(file));
  }
}

// Report results and exit with error if violations found
if (allErrors.length) {
  console.error('github-rest import errors found:');
  for (const err of allErrors) {
    console.error('  ' + err);
  }
  process.exit(1);
} else {
  console.log('All github-rest imports are valid.');
}
