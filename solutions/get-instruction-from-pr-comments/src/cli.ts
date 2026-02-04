#!/usr/bin/env node
import { generateInstructions } from './index.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CLI entry point for generating instructions from PR comments
 * 
 * Usage: get-instruction-from-pr-comments <jsonFile> <systemPromptFile> <userPromptFile> <owner> <repo> <prNumber> [options]
 * 
 * Arguments:
 *   jsonFile         - Path to JSON file containing PR comments (issueComments and reviewComments)
 *   systemPromptFile - Path to text file containing the system prompt
 *   userPromptFile   - Path to text file containing the user prompt template
 *   owner            - GitHub organization/owner name (for output filename)
 *   repo             - GitHub repository name (for output filename)
 *   prNumber         - PR number (for output filename and context)
 * 
 * Options:
 *   --model <name>     - LLM model to use (default: from OPENAI_MODEL env var or 'gpt-4')
 *   --max-comments <n> - Maximum comments to include per type (default: 40)
 *   --summary-mode     - Truncate comment bodies to 300 chars for faster processing
 * 
 * Output:
 *   Generates JSON file: {owner}-{repo}-pr-{prNumber}.json
 * 
 * Environment Variables:
 *   OPENAI_API_KEY   - Required: OpenAI API key for LLM completion
 *   OPENAI_MODEL     - Optional: Default model name if not provided as argument
 */
async function main() {
  // Parse command line arguments
  const [jsonFile, systemPromptFile, userPromptFile, owner, repo, prNumberStr, ...restArgs] = process.argv.slice(2);

  // Validate required arguments
  if (!jsonFile || !systemPromptFile || !userPromptFile || !owner || !repo || !prNumberStr) {
    console.error('Error: Missing required arguments\n');
    console.error('Usage: get-instruction-from-pr-comments <jsonFile> <systemPromptFile> <userPromptFile> <owner> <repo> <prNumber> [options]');
    console.error('\nArguments:');
    console.error('  jsonFile         - Path to JSON file containing PR comments');
    console.error('  systemPromptFile - Path to system prompt text file');
    console.error('  userPromptFile   - Path to user prompt text file');
    console.error('  owner            - GitHub organization/owner name');
    console.error('  repo             - GitHub repository name');
    console.error('  prNumber         - PR number\n');
    console.error('Options:');
    console.error('  --model <name>     - LLM model (default: OPENAI_MODEL env or gpt-4)');
    console.error('  --max-comments <n> - Max comments per type (default: 40)');
    console.error('  --summary-mode     - Truncate comments to 300 chars\n');
    console.error('Environment Variables:');
    console.error('  OPENAI_API_KEY   - Required: Your OpenAI API key');
    console.error('  OPENAI_MODEL     - Optional: Default model name');
    process.exit(1);
  }

  // Parse optional arguments
  let modelName: string | undefined;
  let maxComments = 40;
  let summaryMode = false;

  for (let i = 0; i < restArgs.length; i++) {
    if (restArgs[i] === '--model' && restArgs[i + 1]) {
      modelName = restArgs[i + 1];
      i++;
    } else if (restArgs[i] === '--max-comments' && restArgs[i + 1]) {
      maxComments = parseInt(restArgs[i + 1], 10);
      i++;
    } else if (restArgs[i] === '--summary-mode') {
      summaryMode = true;
    }
  }

  // Validate PR number is numeric
  const prNumber = Number(prNumberStr);
  if (isNaN(prNumber)) {
    console.error('Error: prNumber must be a number');
    process.exit(1);
  }

  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    console.error('Set it in your .env file or export it in your shell');
    process.exit(1);
  }

  try {
    // Validate input files exist asynchronously
    const filesToCheck = [
      { path: jsonFile, name: 'JSON file' },
      { path: systemPromptFile, name: 'System prompt file' },
      { path: userPromptFile, name: 'User prompt file' }
    ];

    console.log('Validating input files...');
    for (const file of filesToCheck) {
      try {
        await fs.promises.access(file.path, fs.constants.R_OK);
      } catch (error) {
        console.error(`Error: ${file.name} not found or not readable: ${file.path}`);
        process.exit(1);
      }
    }

    // Read prompt files
    console.log(`Reading system prompt from: ${systemPromptFile}`);
    const systemPrompt = await fs.promises.readFile(systemPromptFile, 'utf8');
    
    console.log(`Reading user prompt from: ${userPromptFile}`);
    const userPrompt = await fs.promises.readFile(userPromptFile, 'utf8');
    
    console.log(`Reading PR comments from: ${jsonFile}`);

    // Build LLM config with higher token limit for instruction generation
    const llmConfig = {
      apiKey,
      model: modelName || process.env.OPENAI_MODEL || 'gpt-4',
      maxTokens: 16000 // Higher limit needed for generating detailed instructions
    };

    console.log(`Using LLM model: ${llmConfig.model}`);
    console.log(`Generating instructions for ${owner}/${repo}#${prNumber}...`);

    // Generate instructions with token reduction options
    const instructionsMarkdown = await generateInstructions({
      jsonFile,
      systemPrompt,
      userPrompt,
      llmConfig,
      maxComments,
      summaryMode
    });

    // Generate output filename: org-repo-pr-prnumber.md
    const outputFileName = `${owner}-${repo}-pr-${prNumber}.md`;
    
    // Write markdown file with instructions
    await fs.promises.writeFile(outputFileName, instructionsMarkdown, 'utf8');
    
    const absoluteOutputPath = path.resolve(outputFileName);
    
    console.log(`\n✓ Instructions generated successfully`);
    console.log(`✓ Output written to: ${absoluteOutputPath}`);
    console.log(`\nPreview (first 300 chars):`);
    console.log(instructionsMarkdown.substring(0, 300) + (instructionsMarkdown.length > 300 ? '...' : ''));

  } catch (error) {
    // Handle errors with detailed messages
    if (error instanceof Error) {
      console.error(`\nError: ${error.message}`);
      
      // Provide helpful context for common errors
      if (error.message.includes('ENOENT')) {
        console.error('\nFile not found. Check that all file paths are correct.');
      } else if (error.message.includes('JSON')) {
        console.error('\nInvalid JSON format. Check that the JSON file is properly formatted.');
      } else if (error.message.includes('API') || error.message.includes('401')) {
        console.error('\nAPI error. Check that your OPENAI_API_KEY is valid.');
      }
      
      // Show stack trace in verbose mode
      if (process.env.VERBOSE) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('\nUnexpected error:', error);
    }
    
    process.exit(2);
  }
}

// Run the CLI
main();
