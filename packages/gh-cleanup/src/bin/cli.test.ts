import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectMode } from './cli.js';

describe('printHelp', () => {
  let logSpy: any;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('prints help header and commands', async () => {
    vi.doMock('./commands.js', () => ({
      availableCommands: () => ['alpha', 'beta'],
    }));

    const { printHelp } = await import('./cli.js');
    printHelp();

    const out = logSpy.mock.calls.flat().join(' ');
    expect(out).toContain('gh-cleanup — repository cleanup helpers');
    expect(out).toContain('Commands:');
    expect(out).toContain('alpha, beta');
  });
});

describe('detectMode', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('detects --user and --selected and --mode= values (case-insensitive)', () => {
    expect(detectMode(['--user'])).toBe('user');
    expect(detectMode(['--selected'])).toBe('selected');
    expect(detectMode(['--mode=UsEr'])).toBe('user');
    expect(detectMode(['foo'])).toBeUndefined();
  });
});

describe('main', () => {
  let logSpy: any;
  let errSpy: any;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('prints help and version when no mode provided', async () => {
    const readFileMock = vi.fn(async () => JSON.stringify({ version: '9.9.9' }));
    vi.doMock('fs/promises', () => ({ readFile: readFileMock }));
    vi.doMock('./commands.js', () => ({ runCommand: vi.fn(), availableCommands: () => [] }));
    vi.doMock('../lib/runtime-mode.js', () => ({ setMode: vi.fn() }));

    const { mainWithDeps } = await import('./cli.js');
    await mainWithDeps(['node', '/path/to/cli'], { readFile: readFileMock as any });

    expect(readFileMock).toHaveBeenCalled();
    const out = logSpy.mock.calls.flat().join(' ');
    expect(out).toContain('gh-cleanup — repository cleanup helpers');
    expect(out).toContain('version: 9.9.9');
  });

  it('calls setMode and runCommand for provided mode and command', async () => {
    const runCommandMock: any = vi.fn(async () => undefined);
    const setModeMock = vi.fn();
    const clientObj = { foo: true };

    vi.doMock('./commands.js', () => ({ runCommand: runCommandMock, availableCommands: () => ['summary'] }));
    vi.doMock('../lib/github-auth.js', () => ({ getGitHubClient: () => clientObj }));
    vi.doMock('../lib/runtime-mode.js', () => ({ setMode: setModeMock }));
    vi.doMock('fs/promises', () => ({ readFile: vi.fn(async () => JSON.stringify({ version: '0.0.0' })) }));

    const { mainWithDeps } = await import('./cli.js');
    await mainWithDeps(['node', '/path/to/cli', '--mode=user', 'summary'], {
      runCommand: runCommandMock,
      getGitHubClient: (() => clientObj) as any,
      setMode: setModeMock,
    } as any);

    expect(setModeMock).toHaveBeenCalledWith('user');
    expect(runCommandMock).toHaveBeenCalled();
    const call = (runCommandMock.mock.calls[0] ?? []) as any[];
    const [calledCmd, calledRest, calledClient] = call;
    expect(calledCmd).toBe('summary');
    expect(Array.isArray(calledRest)).toBe(true);
    expect(calledClient).toBe(clientObj);
  });

  it('prints help when rest includes --help and does not call runCommand', async () => {
    const runCommandMock: any = vi.fn(async () => { throw new Error('should not be called'); });
    const setModeMock = vi.fn();

    vi.doMock('./commands.js', () => ({ runCommand: runCommandMock, availableCommands: () => ['summary'] }));
    vi.doMock('../lib/runtime-mode.js', () => ({ setMode: setModeMock }));
    vi.doMock('../lib/github-auth.js', () => ({ getGitHubClient: () => ({}) }));
    vi.doMock('fs/promises', () => ({ readFile: vi.fn(async () => JSON.stringify({ version: '0.0.0' })) }));

    const { mainWithDeps } = await import('./cli.js');
    await mainWithDeps(['node', '/path/to/cli', '--mode=user', 'summary', '--help'], {
      runCommand: runCommandMock,
      setMode: setModeMock,
      getGitHubClient: (() => ({})) as any,
    } as any);

    const out = logSpy.mock.calls.flat().join(' ');
    expect(out).toContain('gh-cleanup — repository cleanup helpers');
    expect(runCommandMock).not.toHaveBeenCalled();
    expect(setModeMock).toHaveBeenCalledWith('user');
  });

  it('calls process.exit when setMode throws', async () => {
    const setModeMock = vi.fn(() => { throw new Error('bad mode'); });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: any) => { throw new Error('exited'); });

    try {
      const { mainWithDeps } = await import('./cli.js');
      await mainWithDeps(['node', '/path/to/cli', '--mode=user', 'summary'], { setMode: setModeMock, runCommand: vi.fn() as any, getGitHubClient: (() => ({})) as any } as any);
    } catch (e) {
      // swallow the thrown error from our mocked process.exit
    }

    expect(setModeMock).toHaveBeenCalledWith('user');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
