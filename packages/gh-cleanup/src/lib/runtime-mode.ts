let mode: 'selected' | 'user' | undefined = undefined;

export function setMode(m: string | undefined): void {
  if (!m) {
    mode = undefined;
    return;
  }
  const low = m.toLowerCase();
  if (low !== 'selected' && low !== 'user') {
    throw new Error(`Invalid mode: ${m}`);
  }
  mode = low as 'selected' | 'user';
}

export function getMode(): 'selected' | 'user' | undefined {
  return mode;
}

export function ensureMode(): 'selected' | 'user' {
  if (!mode) throw new Error('Mode not set; call setMode() before using runtime mode');
  return mode;
}

export default { setMode, getMode, ensureMode };
