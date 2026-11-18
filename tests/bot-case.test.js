const test = require('node:test');
const assert = require('node:assert/strict');
const Bot = require('../tools/bot-case.js');
const Sync = require('../sync.js');
const Schema = require('../schema.js');
const Derive = require('../derive.js');
const { fakeSheet, loadAppsScript } = require('./helpers.js');
const token = 'change-me-to-a-long-secret';
const config = { url: 'https://example.test/exec', token };
const OLD = '2026-11-01T10:00:00.000Z';
const NOW = '2026-11-02T10:00:00.000Z';
const included = { el_primi: 'yes', el_singleton: 'yes', el_ga28: 'yes', el_nmch: 'yes', el_records: 'yes', el_hyst: 'no' };
function mockConnection(records = []) {
  const sheet = fakeSheet(), post = loadAppsScript(sheet), requests = [];
  if (records.length) post({ token, columns: Sync.columns(), textColumns: Sync.TEXT_COLUMNS, rows: records.map(Sync.flatten) });
  const fetcher = async (url, options) => {
    assert.equal(url, config.url);
    assert.match(options.headers['Content-Type'], /^text\/plain/);
    const body = JSON.parse(options.body);
    requests.push(body);
    return { json: async () => post(body) };
  };
  return { fetcher, requests, post };
}

test('bot schema: compact option codes/sections/required markers; works without config or network', async () => {
  const output = [];
  await Bot.run(['schema'], { output: (s) => output.push(s), read: () => { throw new Error('No config access'); }, fetcher: () => { throw new Error('No network'); } });
  const fields = output.map(JSON.parse);
  assert.equal(fields.length, Schema.FIELDS.length);
  assert.deepEqual(fields.find((f) => f.id === 'presentation').options, ['cephalic', 'breech', 'transverse']);
  assert.equal(fields.find((f) => f.id === 'name').required, true);
  assert.equal(fields.find((f) => f.id === 'name').section, 'ident');
});

test('bot validation: reports every unknown key and invalid option together; coerces numbers', () => {
  assert.throws(() => Bot.validateInput({ invented: 'x', another: 2, presentation: 'Cephalic', ac: ['pe', 'bogus', 'wrong'], age: 'not numeric' }), (error) => {
    for (const text of ['invented', 'another', 'presentation', 'bogus', 'wrong', 'age']) assert.ok(error.message.includes(text), text);
    return true;
  });
  assert.deepEqual(Bot.validateInput({ age: '32', bw: 0, ga_days: ' 2 ', ac: [] }), { age: 32, bw: 0, ga_days: 2, ac: [] });
  assert.throws(() => Bot.validateInput({ ac: 'pe' }), /expected an array/);
  assert.throws(() => Bot.validateInput({ phone: 1234567 }), /expected text/);
  assert.throws(() => Bot.validateInput({ age: [], name: [], presentation: [], createdAt: [] }), (error) => {
    for (const id of ['age', 'name', 'presentation', 'createdAt']) assert.ok(error.message.includes(id));
    return true;
  });
  assert.throws(() => Bot.validateInput(JSON.parse('{"__proto__":{},"constructor":"x"}')), /__proto__[\s\S]*constructor/);
});

test('bot next ID: numeric phone IDs never affect the independent B sequence', () => {
  assert.equal(Bot.nextId([]), 'CS-B001');
  assert.equal(Bot.nextId([{ study_id: 'CS-999' }, { study_id: 'CS-B002' }, { study_id: 'CS-B010' }]), 'CS-B011');
  assert.equal(Bot.nextId([{ study_id: 'CS-B999' }]), 'CS-B1000');
});

test('bot prepare: fills empties by default, overwrites only supplied fields on request', () => {
  const existing = { study_id: 'CS-012', name: 'Keep', phone: '', age: 30, remarks: 'Keep too', createdAt: OLD, updatedAt: OLD, syncedAt: OLD };
  const result = Bot.prepareRecord({ study_id: 'CS-012', name: 'Replace', phone: '1234567', age: '31' }, [existing], { now: NOW });
  assert.equal(result.record.name, 'Keep');
  assert.equal(result.record.age, 30);
  assert.equal(result.record.phone, '1234567');
  assert.equal(result.record.createdAt, OLD);
  assert.equal(result.record.updatedAt, NOW);
  assert.equal(result.record.source, 'bot');
  assert.equal(result.record.syncedAt, undefined);
  assert.equal(result.record.status, 'draft');
  assert.ok(result.missing.length);
  const overwritten = Bot.prepareRecord({ study_id: 'CS-012', name: '', age: '31' }, [existing], { overwrite: true, now: NOW });
  assert.equal(overwritten.record.name, '');
  assert.equal(overwritten.record.age, 31);
  assert.equal(overwritten.record.remarks, 'Keep too');
  assert.throws(() => Bot.prepareRecord({ study_id: 'CS-001' }, [], { now: NOW }), /New bot cases/);
});

test('bot completion/derived values match the app, including excluded cases', () => {
  const excluded = { ...included, el_primi: 'no', excl_reason: 'Not eligible' };
  const complete = Bot.prepareRecord(excluded, [], { now: NOW });
  assert.equal(complete.record.status, 'complete');
  assert.equal(Derive.eligibility(complete.record), 'Excluded');
  const incomplete = Bot.prepareRecord({ ...excluded, excl_reason: '' }, [], { now: NOW });
  assert.equal(incomplete.record.status, 'draft');
  assert.deepEqual(incomplete.missing.map((f) => f.id), ['excl_reason']);
  const prepared = Bot.prepareRecord({ ...included, ga_weeks: '39', ga_days: '2', presentation: 'cephalic', labour_onset: 'induced', robson: 'WRONG', transfusion: 'yes', tx_product: ['prbc', 'ffp'], prbc_units: '2', ffp_units: '1' }, [], { now: NOW });
  const computed = Derive.deriveAll(prepared.record);
  for (const [id, value] of Object.entries(computed)) assert.deepEqual(prepared.record[id], value, id);
  assert.equal(prepared.record.robson, '2a');
  assert.equal(prepared.record.transfusion_units, 3);
});

test('bot upsert: actual POST flattening matches browser/Schema, then record is pullable', async () => {
  const mock = mockConnection();
  const input = { ...included, name: 'Synthetic fixture', reg_no: '0001', age: '32', ac: ['pe'], presentation: 'cephalic', ga_weeks: '39', labour_onset: 'spontaneous' };
  const result = await Bot.upsert(input, {}, { config, fetcher: mock.fetcher, now: NOW });
  assert.equal(result.written, 1);
  assert.equal(mock.requests.length, 2);
  assert.equal(mock.requests[0].pull, true);
  const sent = mock.requests[1];
  assert.deepEqual(sent.columns, Sync.columns());
  assert.deepEqual(sent.textColumns, Sync.TEXT_COLUMNS);
  assert.deepEqual(sent.rows[0], Sync.flatten(result.record));
  const { _json, ...flat } = sent.rows[0];
  assert.deepEqual(flat, Schema.flatten(result.record));
  assert.deepEqual(JSON.parse(_json), result.record);
  assert.equal(flat.created_at, '2026-11-02 15:30:00');
  assert.equal(flat.ac_pe, 1);
  assert.equal(flat.ac_gdm, 0);
  assert.equal(flat.presentation, 'Cephalic');
  assert.deepEqual(mock.post({ token, pull: true }).rows[0], result.record);
});

test('bot dry-run only pulls and shows missing fields; malformed input never fetches', async () => {
  const mock = mockConnection([{ study_id: 'CS-B004', name: 'Existing', updatedAt: OLD }]);
  const output = [];
  await Bot.run(['upsert', '/virtual/input.json', '--dry-run'], { config, fetcher: mock.fetcher, read: () => '{"name":"Synthetic fixture"}', output: (s) => output.push(s), now: NOW });
  const proposed = JSON.parse(output[0]);
  assert.equal(proposed.record.study_id, 'CS-B005');
  assert.ok(proposed.missing.some((f) => f.id === 'reg_no'));
  assert.equal(proposed.dryRun, true);
  assert.equal(mock.requests.length, 1);
  await assert.rejects(Bot.upsert({ bad_field: 1, presentation: 'bad' }, {}, { config, fetcher: mock.fetcher }), /bad_field[\s\S]*presentation/);
  assert.equal(mock.requests.length, 1);
});

test('bot list/get/next-id commands pull records and display excluded status', async () => {
  const record = { ...included, study_id: 'CS-B002', name: 'Fixture', reg_no: '1', el_primi: 'no', updatedAt: OLD, status: 'draft' };
  const mock = mockConnection([record]);
  const output = [];
  const options = { config, fetcher: mock.fetcher, output: (s) => output.push(s) };
  const list = await Bot.run(['list'], options);
  assert.deepEqual(list[0], { study_id: 'CS-B002', name: 'Fixture', reg_no: '1', status: 'excluded', updatedAt: OLD });
  assert.deepEqual(await Bot.run(['get', 'CS-B002'], options), record);
  assert.equal(await Bot.run(['next-id'], options), 'CS-B003');
  await assert.rejects(Bot.run(['get', 'CS-B999'], options), /Case not found/);
});

test('bot stale-write guard: conflict is reported without replacing a newer Sheet edit', async () => {
  let calls = 0;
  const fetcher = async (url, options) => ({ json: async () => {
    calls++;
    const body = JSON.parse(options.body);
    return body.pull ? { ok: true, rows: [] } : { ok: true, written: 0, skipped: [{ study_id: 'CS-B001', updatedAt: NOW }] };
  } });
  await assert.rejects(Bot.upsert({ name: 'Fixture' }, {}, { config, fetcher, now: OLD }), /newer edit/);
  assert.equal(calls, 2);
});
