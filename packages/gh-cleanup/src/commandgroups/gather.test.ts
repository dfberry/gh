import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./base.js', () => ({
  runGroupCommand: vi.fn(),
  writeGroupOutput: vi.fn(),
  parseArgs: vi.fn((argv: string[]) => ({ argv })),
}));

import { runCommand, writeOutput, parseArgs, gatherCommand } from './gather.js';

describe('gather group command', () => {
  describe('runCommand', () => {
    beforeEach(async () => {
      vi.resetAllMocks();
      const base = await import('./base.js');
      (base.runGroupCommand as any).mockResolvedValue({ step: 'gather', repos: [], summary: {} });
    });

    afterEach(() => { vi.resetAllMocks(); });

    it('calls runGroupCommand', async () => {
      const client = {} as any;
      const args = { out: './out' } as any;
      const res = await runCommand(client, args);
      expect(res).toBeTruthy();
      expect((await import('./base.js')).runGroupCommand).toHaveBeenCalled();
    });
  });

  describe('writeOutput', () => {
    beforeEach(async () => {
      vi.resetAllMocks();
      const base = await import('./base.js');
      (base.writeGroupOutput as any).mockResolvedValue(undefined);
    });

    afterEach(() => { vi.resetAllMocks(); });

    it('calls writeGroupOutput with expected args', async () => {
      const result = { step: 'gather' } as any;
      const args = { out: './out' } as any;
      await writeOutput(result, args);
      expect((await import('./base.js')).writeGroupOutput).toHaveBeenCalledWith(result, args, 'gather', 'gather-dryrun');
    });
  });

  describe('gatherCommand wrapper', () => {
    beforeEach(async () => {
      vi.resetAllMocks();
      const base = await import('./base.js');
      (base.runGroupCommand as any).mockResolvedValue({ step: 'gather', repos: [], summary: {} });
      (base.writeGroupOutput as any).mockResolvedValue(undefined);
    });

    afterEach(() => { vi.resetAllMocks(); });

    it('invokes runCommand and writeOutput', async () => {
      const client = {} as any;
      await gatherCommand(['--out=./out'], client);
      expect((await import('./base.js')).runGroupCommand).toHaveBeenCalled();
      expect((await import('./base.js')).writeGroupOutput).toHaveBeenCalled();
    });
  });
});
