// Central debug switch for all commands/command groups
// Returns debug config from env or param
export function getDebugConfig(param?: boolean): { debug: boolean } {
  if (typeof param === 'boolean') return { debug: param };
  return { debug: process.env.GH_CLEANUP_DEBUG === 'true' };
}

// Central error reporting utility

export type DebugConfig = { debug: boolean };

export function reportError(err: any, debugConfig?: DebugConfig): object {
  if (!err) return {};
  const status = extractStatus(err);
  const message = err?.message || String(err);
  const errorObj: any = { status, message };
  if (debugConfig?.debug) {
    errorObj.debug = {
      stack: err?.stack,
      ...((err && typeof err === 'object') ? err : {})
    };
  }
  return errorObj;
}

/**
 * Centralized API error/status/debug handler for command files.
 * Usage: const { result, status, message, errorObj } = await handleApiError(() => apiCall(...), debugConfig)
 * - result: the API result (or null if error)
 * - status: always set (from extractStatus)
 * - message: error message if any
 * - errorObj: error object for output (null if no error)
 */
export async function handleApiError<T>(fn: () => Promise<T>, debugConfig?: DebugConfig): Promise<{
  result: T | null;
  status: {
    code: number;
    message: string;
    error?: object | null;
  };
}> {
  try {
    const result = await fn();
    let code = 200;
    if (result && typeof result === 'object' && 'status' in result && typeof (result as any).status === 'number') {
      code = (result as any).status;
    }
    return { result, status: { code, message: 'ok' } };
  } catch (err: any) {
    const code = typeof err?.status === 'number' ? err.status : 500;
    const message = err?.message || String(err);
    const errorObj = reportError(err, debugConfig);
    return { result: null, status: { code, message, error: errorObj } };
  }
}

// Central status extraction utility
export function extractStatus(error: any): { code: number; message: string } {
  if (!error) return { code: 200, message: 'ok' };
  if (error.body && typeof error.body.message === 'string') {
    if (error.body.status) {
      return { code: error.body.status, message: error.body.message };
    }
    return { code: 500, message: error.body.message };
  }
  if (typeof error.status === 'number') {
    let msg = 'error';
    if (error.status === 403) msg = 'forbidden';
    else if (error.status === 404) msg = 'not-found';
    return { code: error.status, message: msg };
  }
  return { code: 500, message: `error-${error.status || 'unknown'}` };
}
