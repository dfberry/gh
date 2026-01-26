import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRunner, runCommand, commands, availableCommands } from './commands.js';

beforeEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).__MAKE_RUNNER_CALLED;
  delete (globalThis as any).__RUN;
});

describe('makeRunner', () => {
  it('invokes exported function with argv and client', async () => {
    const spy = vi.fn();
    const mockImport = vi.fn(async (_: string) => ({ testCommand: spy }));

    const runner = makeRunner('unused', 'testCommand', mockImport);
    const argv = ['a', 'b'];
    const client = { ok: true } as any;
    await runner(argv, client);
    expect(spy).toHaveBeenCalledWith(argv, client);
    expect(mockImport).toHaveBeenCalledWith('unused');
  });

  it('throws when export is missing', async () => {
    const mockImport = vi.fn(async () => ({}));
    const runner = makeRunner('unused', 'missingExport', mockImport);
    await expect(runner([], {} as any)).rejects.toThrow(/not found/);
  });
});

describe('runCommand', () => {
  it('prints help when name is undefined', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCommand(undefined, []);
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain('gh-cleanup CLI');
    expect(log.mock.calls[1][0]).toContain('Commands:');
    expect(error).not.toHaveBeenCalled();
  });

  it('prints error for unknown command', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCommand('no-such', []);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
    expect(log.mock.calls[0][0]).toContain('Commands:');
  });

  it('calls runner when command exists (custom registry)', async () => {
    const mockRunner = vi.fn(async (argv: string[], client?: any) => {});
    const registry = { 'test-cmd': mockRunner } as Record<string, any>;
    const argv = ['x'];
    const client = { a: 1 } as any;
    await runCommand('test-cmd', argv, client, registry);
    expect(mockRunner).toHaveBeenCalledWith(argv, client);
  });

  it('availableCommands contains expected entries', () => {
    const list = availableCommands();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toContain('summary');
  });
});
