#!/usr/bin/env node
'use strict';
// Back up the Google Sheet to a dated CSV on this computer. No data or secrets live in the repo.
// Uses the Sheet's own cells when the script supports {export:true}; otherwise rebuilds rows from _json.
// Usage: node tools/backup-sheet.js [--dir ~/cs-audit-backups]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Sync = require('../sync.js');

const args = process.argv.slice(2);
const dirArg = args.indexOf('--dir');
const DIR = dirArg >= 0 ? args[dirArg + 1] : path.join(os.homedir(), 'cs-audit-backups');
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'cs-audit', 'sync.json'), 'utf8'));

const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCSV = (rows) => '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

function stamp() {
  const d = new Date(Date.now() + 330 * 60000); // IST
  return d.toISOString().slice(0, 16).replace('T', '_').replace(':', '');
}

(async () => {
  let rows; let mode;
  const exp = await Sync.post(cfg.url, { token: cfg.token, export: true });
  if (Array.isArray(exp.values)) { rows = exp.values; mode = 'sheet'; }
  else {
    const pulled = (await Sync.post(cfg.url, { token: cfg.token, pull: true })).rows || [];
    const cols = Sync.columns();
    rows = [cols].concat(pulled.map((r) => { const f = Sync.flatten(r); return cols.map((c) => f[c]); }));
    mode = 'json';
  }
  const cases = Math.max(0, rows.length - 1);
  if (!cases) { console.error('No case rows returned (' + mode + ' mode); nothing written.'); process.exit(2); }
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(DIR, 0o700);
  const csv = toCSV(rows);
  const latest = path.join(DIR, 'latest.csv');
  if (fs.existsSync(latest) && fs.readFileSync(latest, 'utf8') === csv) { console.log('Unchanged since last backup (' + cases + ' cases).'); return; }
  const file = path.join(DIR, 'cs-audit-' + stamp() + '.csv');
  fs.writeFileSync(file, csv, { mode: 0o600 });
  fs.writeFileSync(latest, csv, { mode: 0o600 });
  console.log('Saved ' + file + ' (' + cases + ' cases, ' + mode + ' mode)');
})().catch((e) => { console.error('Backup failed: ' + e.message); process.exit(1); });
