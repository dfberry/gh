import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'os';

import { resolveOutFile, ensureDir, readJsonFile } from './files.js';

const tmpBase = path.join(os.tmpdir(), `gh-cleanup-test-${Date.now()}`);
const created: string[] = [];

afterEach(async () => {
  // cleanup created files/dirs
    for (const p of created.reverse()) {
      try {
        const st = await fs.stat(p).catch(() => null);
        if (!st) continue;
        if (st.isDirectory()) await fs.rm(p, { recursive: true, force: true }).catch(() => null);
        else await fs.unlink(p).catch(() => null);
      } catch {
        // ignore
      }
    }
  created.length = 0;
});

describe('files utils', () => {
  it('resolveOutFile returns file inside directory when outArg is directory', async () => {
    const dir = path.join(tmpBase, 'outdir1');
    await fs.mkdir(dir, { recursive: true });
    created.push(dir);
    const out = await resolveOutFile(dir, 'prefix-', 'default.json');
    expect(out).toBe(path.join(dir, 'prefix-default.json'));
  });

  it('resolveOutFile returns same path when outArg is an existing file', async () => {
    const dir = path.join(tmpBase, 'outdir2');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, 'somefile.json');
    await fs.writeFile(file, '{}', 'utf8');
    created.push(dir);
    const out = await resolveOutFile(file, 'prefix-', 'default.json');
    expect(out).toBe(file);
  });

  it('resolveOutFile returns outArg when path does not exist', async () => {
    const non = path.join(tmpBase, 'does-not-exist', 'file.json');
    const out = await resolveOutFile(non, 'p-', 'd.json');
    expect(out).toBe(non);
  });

  it('ensureDir creates nested directory', async () => {
    const dir = path.join(tmpBase, 'a', 'b', 'c');
    await ensureDir(dir);
    created.push(path.join(tmpBase, 'a'));
    const st = await fs.stat(dir);
    expect(st.isDirectory()).toBe(true);
  });

  it('readJsonFile parses JSON and returns null on invalid/missing', async () => {
    const dir = path.join(tmpBase, 'jsons');
    await fs.mkdir(dir, { recursive: true });
    created.push(dir);
    const good = path.join(dir, 'good.json');
    await fs.writeFile(good, JSON.stringify({ a: 1 }), 'utf8');
    const parsed = await readJsonFile<any>(good);
    expect(parsed).toEqual({ a: 1 });

    const bad = path.join(dir, 'bad.json');
    await fs.writeFile(bad, '{notjson', 'utf8');
    const parsedBad = await readJsonFile<any>(bad);
    expect(parsedBad).toBeNull();

    const missing = path.join(dir, 'missing.json');
    const parsedMissing = await readJsonFile<any>(missing);
    expect(parsedMissing).toBeNull();
  });
});
