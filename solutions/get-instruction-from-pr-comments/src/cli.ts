#!/usr/bin/env node
import { generateInstructions } from './index.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CLI entry point for generating instructions from PR comments
 * 
 * Usage: get-instruction-from-pr-comments <jsonFile> <systemPromptFile> <userPromptFile> <outputFile> [modelName]
 * 
 * Arguments:
 *   jsonFile         - Path to JSON file containing PR comments (issueComments and reviewComments)
 *   systemPromptFile - Path to text file containing the system prompt
 *   userPromptFile   - Path to text file containing the user prompt template
 *   outputFile       - Path where generated instructions will be written
 *   modelName        - (Optional) LLM model to use (default: from OPENAI_MODEL env var or 'gpt-4')
 * 
 * Environment Variables:
 *   OPENAI_API_KEY   - Required: OpenAI API key for LLM completion
 *   OPENAI_MODEL     - Optional: Default model name if not provided as argument
 */
async function main() {
  // Parse command line arguments
  const [jsonFile, systemPromptFile, userPromptFile, outputFile, modelName] = process.argv.slice(2);

  // Validate required arguments
  if (!jsonFile || !systemPromptFile || !userPromptFile || !outputFile) {
    console.error('Error: Missing required arguments\n');
    console.error('Usage: get-instruction-from-pr-comments <jsonFile> <systemPromptFile> <userPromptFile> <outputFile> [modelName]');
    console.error('\nArguments:');
    console.error('  jsonFile         - Path to JSON file containing PR comments');
    console.error('  systemPromptFile - Path to system prompt text file');
    console.error('  userPromptFile   - Path to user prompt text file');
    console.error('  outputFile       - Path for generated instructions output');
    console.error('  modelName        - (Optional) LLM model name\n');
    console.error('Environment Variables:');
    console.error('  OPENAI_API_KEY   - Required: Your OpenAI API key');
    console.error('  OPENAI_MODEL     - Optional: Default model name');
    process.exit(1);
  }

  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    console.error('Set it in your .env file or export it in your shell');
    process.exit(1);
  }

  // Validate input files exist
  const filesToCheck = [
    { path: jsonFile, name: 'JSON file' },
    { path: systemPromptFile, name: 'System prompt file' },
    { path: userPromptFile, name: 'User prompt file' }
  ];

  for (const file of filesToCheck) {
    if (!fs.existsSync(file.path)) {
      console.error(`Error: ${file.name} not found: ${file.path}`);
      process.exit(1);
    }
  }

  try {
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
    console.log(`Generating instructions...`);

    // Generate instructions
    const result = await generateInstructions({
      jsonFile,
      systemPrompt,
      userPrompt,
      outputFile,
      llmConfig
    });

    // Resolve output path for display
    const absoluteOutputPath = path.resolve(outputFile);
    
    console.log(`\n✓ Instructions generated successfully`);
    console.log(`✓ Output written to: ${absoluteOutputPath}`);
    console.log(`\nPreview (first 200 chars):`);
    console.log(result.substring(0, 200) + (result.length > 200 ? '...' : ''));

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
