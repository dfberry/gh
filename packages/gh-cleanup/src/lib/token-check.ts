import { checkTokenStatus } from '../commands/check-token.js';

export async function checkAndReportToken() {
  const result = await checkTokenStatus();
  if (result.status === 'missing') {
    console.warn('[Token Check] No GitHub token found. Some commands may fail or have limited access.');
  } else if (result.status === 'invalid') {
    console.warn(`[Token Check] Invalid GitHub token: ${result.message}`);
  } else if (result.status === 'ok') {
    const user = result.user as { login?: string };
    if (user && typeof user.login === 'string') {
      console.log(`[Token Check] Authenticated as: ${user.login}`);
    } else {
      console.log('[Token Check] Authenticated, but could not determine user login.');
    }
    if (Array.isArray(result.scopes)) {
      console.log(`[Token Check] Token scopes: ${result.scopes.join(', ') || '(none found)'}`);
    }
  }
  return result;
}
