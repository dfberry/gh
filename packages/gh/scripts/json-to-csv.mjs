#!/usr/bin/env node
// scripts/json-to-csv.mjs
// Small helper to convert JSON output (from examples) into CSV.
// Usage:
//   cat stale.json | node ./scripts/json-to-csv.mjs --path=stale > stale.csv
//   node ./scripts/json-to-csv.mjs --input=stale.json --path=stale > stale.csv

import fs from 'fs';

const argv = process.argv.slice(2);
const inputArg = argv.find(a => a.startsWith('--input='))?.split('=')[1] || null;
const pathArg = argv.find(a => a.startsWith('--path='))?.split('=')[1] || 'stale';

function getByPath(obj, p) {
  if (!p) return obj;
  const parts = p.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function toCsv(rows) {
  if (!Array.isArray(rows)) rows = [rows];
  const keys = [];
  for (const r of rows) {
    if (r && typeof r === 'object') {
      for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
    }
  }
  const escape = v => {
    if (v == null) return '';
    let s = (typeof v === 'object') ? JSON.stringify(v) : String(v);
    if (s.includes('"')) s = s.replace(/"/g, '""');
    if (s.includes(',') || s.includes('\n') || s.includes('"')) return `"${s}"`;
    return s;
  };
  const lines = [];
  lines.push(keys.join(','));
  for (const r of rows) {
    const row = keys.map(k => escape(r?.[k]));
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let text;
  if (inputArg) {
    text = fs.readFileSync(inputArg, 'utf8');
  } else {
    // read from stdin
    const stat = fs.fstatSync(0);
    if (stat && stat.isFIFO()) {
      text = await readStdin();
    } else {
      console.error('No --input provided and no stdin data. Provide JSON via stdin or --input=file');
      process.exit(2);
    }
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error('Failed to parse JSON:', err.message || err);
    process.exit(2);
  }

  const target = getByPath(data, pathArg) ?? data;
  if (target == null) {
    console.error(`Path '${pathArg}' not found in input JSON`);
    process.exit(2);
  }

  if (!Array.isArray(target) && typeof target === 'object') {
    // if it's an object, try to extract first array property
    const arrProp = Object.values(target).find(v => Array.isArray(v));
    if (arrProp) {
      const csv = toCsv(arrProp);
      console.log(csv);
      return;
    }
  }

  if (!Array.isArray(target)) {
    console.error('Target is not an array. Provide a path to an array in the JSON (e.g. --path=stale)');
    process.exit(2);
  }

  const csv = toCsv(target);
  console.log(csv);
}

main().catch(err => { console.error(err); process.exit(1); });
