#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function load(file) {
  if (!file) return null;
  try {
    await fs.access(file);
  } catch (err) {
    return null;
  }
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

function sanitize(obj) {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) return obj.map(sanitize);
    const out = {};
    Object.keys(obj).sort().forEach((k) => {
      if (k === 'name' && obj === rootObj) {
        // skip root name
        return;
      }
      const v = obj[k];
      if (k === 'peer' && v === true) return; // drop peer:true metadata
      out[k] = sanitize(v);
    });
    return out;
  }
  return obj;
}

function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort(), 2);
}

const aFile = process.argv[2];
const bFile = process.argv[3];
if (!aFile || !bFile) {
  console.error('Usage: compare-lockfiles.js <committed.json> <generated.json>');
  process.exit(2);
}

(async () => {
  const a = await load(aFile);
  const b = await load(bFile);
  if (!a) {
    console.error('Committed lockfile not found:', aFile);
    process.exit(1);
  }
  if (!b) {
    console.error('Generated lockfile not found:', bFile);
    process.exit(1);
  }

// Provide access to rootObj for sanitize to skip root.name
  global.rootObj = a;
  const sanA = sanitize(a);
  global.rootObj = b;
  const sanB = sanitize(b);

  const sa = stableStringify(sanA);
  const sb = stableStringify(sanB);

  if (sa === sb) {
    console.log('Lockfiles are equivalent after sanitization.');
    process.exit(0);
  }

  console.error('Lockfiles differ after sanitization.');
  // Write sanitized copies for debugging
  await fs.writeFile('package-lock.sanitized.committed.json', sa, 'utf8');
  await fs.writeFile('package-lock.sanitized.generated.json', sb, 'utf8');
  console.error('Wrote package-lock.sanitized.*.json for inspection.');
  process.exit(1);
})();
