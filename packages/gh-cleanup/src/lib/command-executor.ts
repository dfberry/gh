import { reportError, extractStatus, getDebugConfig } from './debug.js';

/**
 * Runs a command function with centralized error handling and logging.
 * - fn: the command function (async, returns result or throws)
 * - args: command arguments
 * - debugConfig: { debug: boolean }
 * Returns: { result, error, status }
 */
export async function runWithErrorHandling(fn: Function, args: any, debugConfig?: { debug: boolean }) {
  try {
    const result = await fn(args);
    return { result, error: null, status: 'ok' };
  } catch (err: any) {
    return {
      result: null,
      error: reportError(err, debugConfig || getDebugConfig()),
      status: extractStatus(err)
    };
  }
}
