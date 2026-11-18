#!/usr/bin/env node
'use strict';

// No patient data or secrets live in this repository. Node 18+ provides fetch.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Derive = require('../derive.js');
const Schema = require('../schema.js');
const Sync = require('../sync.js');
const CONFIG_PATH = path.join(os.homedir(), '.config', 'cs-audit', 'sync.json');
const META = new Set(['status', 'createdAt', 'updatedAt', 'syncedAt', 'source']);

function schemaFields() {
  return Schema.FIELDS.map((f) => ({
    id: f.id, type: f.type, label: f.label, section: f.section,
    required: f.req || false,
    ...(f.show ? { conditional: true } : {}),
    ...(f.options ? { options: f.options.map(([value]) => value) } : {}),
    ...(f.min !== undefined ? { min: f.min, max: f.max } : {}),
  }));
}

// Check all keys and all options (including currently hidden fields) before merging.
function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be a JSON object');
  const errors = [];
  const normalized = {};
  for (const [key, original] of Object.entries(input)) {
    const field = Object.hasOwn(Schema.FIELD_BY_ID, key) ? Schema.FIELD_BY_ID[key] : null;
    if (!field && !META.has(key)) {
      errors.push(`${key}: unknown key`);
      continue;
    }
    let value = original;
    const blank = value === null || value === undefined || value === '';
    if (field && field.type === 'number' && !blank) {
      if (typeof value === 'string') value = value.trim();
      if (value === '') value = '';
      else if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value))) errors.push(`${key}: not a number`);
      else value = Number(value);
    }
    if (field && field.type === 'multi') {
      if (blank) value = [];
      else if (!Array.isArray(value)) errors.push(`${key}: expected an array of option values`);
      if (Array.isArray(value)) for (const option of value) {
        if (!field.options.some(([code]) => code === option)) errors.push(`${key}: invalid option ${JSON.stringify(option)}`);
      }
    } else if (field && field.options && !blank) {
      if (!field.options.some(([code]) => code === value)) errors.push(`${key}: invalid option ${JSON.stringify(value)}`);
    } else if (field && !['number', 'computed'].includes(field.type) && !blank && typeof value !== 'string') {
      errors.push(`${key}: expected text`);
    }
    if (field && ['date', 'datetime'].includes(field.type) && !blank) {
      const pattern = field.type === 'date' ? /^\d{4}-\d\d-\d\d$/ : /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/;
      if (typeof value !== 'string' || !pattern.test(value) || !Number.isFinite(Date.parse(value))) errors.push(`${key}: expected ${field.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm (IST, no timezone suffix)'}`);
    }
    if (key === 'study_id' && !blank && !/^CS-(?:B)?\d+$/.test(value)) errors.push('study_id: expected CS-001 or CS-B001 style ID');
    if (key === 'status' && !['draft', 'complete', 'excluded'].includes(value)) errors.push('status: expected draft, complete or excluded (recalculated on save)');
    if (['createdAt', 'updatedAt', 'syncedAt'].includes(key) && !blank && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) errors.push(`${key}: invalid timestamp`);
    if (key === 'source' && !blank && typeof value !== 'string') errors.push('source: expected text');
    normalized[key] = value;
  }
  if (errors.length) throw new Error('Invalid case input:\n' + errors.map((e) => '- ' + e).join('\n'));
  return normalized;
}

function nextId(records) {
  let max = 0;
  for (const record of records) {
    const match = /^CS-B(\d+)$/.exec(record.study_id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return 'CS-B' + String(max + 1).padStart(3, '0');
}

function prepareRecord(input, records, { overwrite = false, now = new Date().toISOString() } = {}) {
  const data = validateInput(input);
  const id = data.study_id || nextId(records);
  const existing = records.find((r) => r.study_id === id);
  if (!existing && !/^CS-B\d+$/.test(id)) throw new Error('New bot cases must use CS-Bnnn IDs; omit study_id to allocate one');
  const record = Object.assign({}, existing);
  for (const [key, value] of Object.entries(data)) {
    if (META.has(key) || key === 'study_id' || Schema.FIELD_BY_ID[key].type === 'computed') continue;
    if (overwrite || Schema.isEmpty(record[key])) record[key] = value;
  }
  record.study_id = id;
  record.createdAt = (existing && existing.createdAt) || data.createdAt || now;
  record.updatedAt = now;
  record.source = 'bot';
  delete record.syncedAt;
  delete record._dirty;
  const validation = Schema.validate(record);
  // Excluded cases use status=complete once their required exclusion details are filled,
  // just like the app; the displayed status is derived from eligibility.
  record.status = validation.errors.length || validation.missing.length ? 'draft' : 'complete';
  Object.assign(record, Derive.deriveAll(record));
  return { record, missing: validation.missing, errors: validation.errors };
}

function loadConfig(read = fs.readFileSync) {
  let config;
  try { config = JSON.parse(read(CONFIG_PATH, 'utf8')); }
  catch (error) { throw new Error(`Create ${CONFIG_PATH} with {"url":"YOUR_WEB_APP_URL","token":"YOUR_TOKEN"}; config is missing or invalid`); }
  if (!config || typeof config.url !== 'string' || !config.url || typeof config.token !== 'string' || !config.token) throw new Error(`Missing url or token in ${CONFIG_PATH}`);
  return config;
}

async function pull(config, fetcher) {
  const result = await Sync.post(config.url, { token: config.token, pull: true }, fetcher);
  if (!Array.isArray(result.rows)) throw new Error('Redeploy the updated Code.gs before using the bot');
  return result.rows;
}

async function upsert(input, { overwrite = false, dryRun = false } = {}, { config, fetcher = globalThis.fetch, now } = {}) {
  // Validate before touching the network so every malformed key is reported together.
  const data = validateInput(input);
  const records = await pull(config, fetcher);
  const prepared = prepareRecord(data, records, { overwrite, now });
  if (dryRun) return { ...prepared, dryRun: true };
  const result = await Sync.post(config.url, {
    token: config.token, columns: Sync.columns(), textColumns: Sync.TEXT_COLUMNS,
    rows: [Sync.flatten(prepared.record)],
  }, fetcher);
  if ((result.skipped || []).length) throw new Error('Sheet has a newer edit; nothing was overwritten. Re-run to merge against the latest case.');
  return { ...prepared, written: result.written };
}

const USAGE = 'Usage: node tools/bot-case.js schema | list | get <id> | next-id | upsert <file.json> [--overwrite] [--dry-run]';
async function run(argv, { config, fetcher = globalThis.fetch, output = (s) => process.stdout.write(s + '\n'), read = fs.readFileSync, now } = {}) {
  const [command, ...args] = argv;
  if (command === 'schema' && !args.length) {
    // One compact field per line for easy LLM ingestion, without needing a token.
    for (const field of schemaFields()) output(JSON.stringify(field));
    return;
  }
  if (!['list', 'get', 'next-id', 'upsert'].includes(command)) throw new Error(USAGE);
  if (command === 'get' ? args.length !== 1 : command !== 'upsert' && args.length) throw new Error(USAGE);
  if (command === 'upsert' && (!args[0] || args[0].startsWith('--') || args.slice(1).some((s) => !['--overwrite', '--dry-run'].includes(s)))) throw new Error(USAGE);
  let input;
  if (command === 'upsert') input = validateInput(JSON.parse(read(args[0], 'utf8')));
  const connection = config || loadConfig(read);
  if (command === 'upsert') {
    const result = await upsert(input, { overwrite: args.includes('--overwrite'), dryRun: args.includes('--dry-run') }, { config: connection, fetcher, now });
    output(JSON.stringify(result, null, 2));
    return result;
  }
  const records = await pull(connection, fetcher);
  if (command === 'next-id') { const id = nextId(records); output(id); return id; }
  if (command === 'get') {
    const record = records.find((r) => r.study_id === args[0]);
    if (!record) throw new Error(`Case not found: ${args[0]}`);
    output(JSON.stringify(record, null, 2));
    return record;
  }
  const list = records.slice().sort((a, b) => a.study_id.localeCompare(b.study_id, undefined, { numeric: true })).map((r) => ({
    study_id: r.study_id, name: r.name || '', reg_no: r.reg_no || '',
    status: Derive.eligibility(r) === 'Excluded' ? 'excluded' : r.status || 'draft', updatedAt: r.updatedAt || '',
  }));
  output(JSON.stringify(list, null, 2));
  return list;
}

if (require.main === module) {
  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') process.exit(0); // Allow piping `schema` to head.
    throw error;
  });
  run(process.argv.slice(2)).catch((error) => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
module.exports = { schemaFields, validateInput, nextId, prepareRecord, pull, upsert, run, CONFIG_PATH };
