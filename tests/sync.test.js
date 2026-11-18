const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Derive = require('../derive.js');
const Schema = require('../schema.js');
const Sync = require('../sync.js');
const { fakeSheet, loadAppsScript } = require('./helpers.js');

const OLD = '2026-11-01T10:00:00.000Z';
const NEW = '2026-11-02T10:00:00.000Z';
const LATEST = '2026-11-03T10:00:00.000Z';
const token = 'change-me-to-a-long-secret';
const config = { syncUrl: 'https://example.test/exec', syncToken: token };
const clone = (v) => v === undefined ? undefined : structuredClone(v);
const plain = (v) => JSON.parse(JSON.stringify(v));
function save(post, ...records) {
  return post({ token, columns: Sync.columns(), textColumns: Sync.TEXT_COLUMNS, rows: records.map(Sync.flatten) });
}
function browser(records, handler, storage = {}, globals = {}) {
  const data = new Map(records.map((r) => [r.study_id, clone(r)]));
  const values = new Map(Object.entries({ ...config, ...storage }));
  const requests = [];
  const DB = {
    all: async () => clone([...data.values()]),
    get: async (id) => clone(data.get(id)),
    put: async (record) => data.set(record.study_id, clone(record)),
  };
  const context = {
    Schema, Derive, DB, AbortController, setTimeout, clearTimeout, navigator: { onLine: true },
    localStorage: { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)) },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return { json: async () => handler(body, DB, options) };
    },
  };
  Object.assign(context, globals);
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'sync.js'), 'utf8'), context);
  return { Sync: context.Sync, DB, values, requests };
}

test('merge: a new Sheet record is inserted without a needless re-push', () => {
  const remote = { study_id: 'CS-B001', name: 'Remote', updatedAt: NEW, syncedAt: LATEST, _dirty: true };
  const result = Sync.mergeRecord(null, remote);
  assert.equal(result.syncedAt, NEW);
  assert.equal(result._dirty, undefined);
  assert.equal(Sync.needsSync(result), false);
  assert.equal(remote._dirty, true, 'merge must not mutate input');
});

test('merge: newer Sheet wins but local non-empty values survive missing/empty Sheet fields', () => {
  const local = { study_id: 'CS-001', name: 'Old', phone: '1234567', bw: 0, ac: ['pe'], updatedAt: OLD, syncedAt: OLD };
  const remote = { study_id: 'CS-001', name: 'New', phone: '', ac: [], updatedAt: NEW };
  assert.equal(Sync.needsSync(local), false, 'equal updatedAt and syncedAt means the phone copy is clean');
  const result = Sync.mergeRecord(local, remote);
  assert.equal(result.name, 'New');
  assert.equal(result.phone, '1234567');
  assert.equal(result.bw, 0);
  assert.deepEqual(result.ac, ['pe']);
  assert.ok(result.updatedAt > NEW);
  assert.ok(Sync.needsSync(result), 'combined fields must reach the Sheet');
  const replaced = Sync.mergeRecord({ study_id: 'CS-001', name: 'Old', updatedAt: OLD, syncedAt: OLD }, remote);
  assert.equal(replaced.name, 'New');
  assert.equal(replaced.syncedAt, NEW);
  assert.equal(Sync.needsSync(replaced), false);
});

test('merge: local wins timestamp ties and newer edits, only empty fields are filled', () => {
  for (const updatedAt of [OLD, NEW]) {
    const local = { study_id: 'CS-001', name: 'Local', age: 0, phone: '', ac: [], updatedAt, syncedAt: updatedAt };
    const remote = { study_id: 'CS-001', name: 'Sheet', age: 40, phone: '1234567', ac: ['pe'], updatedAt: OLD, syncedAt: LATEST };
    const result = Sync.mergeRecord(local, remote);
    assert.equal(result.name, 'Local');
    assert.equal(result.age, 0, 'zero is not empty');
    assert.equal(result.phone, '1234567');
    assert.deepEqual(result.ac, ['pe']);
    assert.ok(Sync.needsSync(result));
  }
  const local = { study_id: 'CS-001', name: 'Local', updatedAt: NEW, syncedAt: NEW };
  assert.deepEqual(Sync.mergeRecord(local, { ...local, name: 'Old', updatedAt: OLD, syncedAt: LATEST }), local);
});

test('Sheet: authenticated pull preserves raw codes, and _json remains last after schema growth', () => {
  const sheet = fakeSheet(), post = loadAppsScript(sheet);
  assert.equal(post({ token: 'wrong', pull: true }).ok, false);
  assert.deepEqual(post({ token, pull: true }), { ok: true, rows: [] });
  const a = { study_id: 'CS-B001', name: 'Raw', ac: ['pe'], presentation: 'cephalic', updatedAt: OLD };
  const b = { study_id: 'CS-002', name: 'Untouched', updatedAt: OLD };
  assert.equal(save(post, a, b).written, 2);
  assert.deepEqual(post({ token, pull: true }).rows, [a, b]);
  const row = { ...Sync.flatten({ ...a, updatedAt: NEW }), extra: 'new field' };
  post({ token, columns: [...Sync.columns(), 'extra'], textColumns: Sync.TEXT_COLUMNS, rows: [row] });
  assert.equal(sheet.cells[0].at(-1), '_json');
  assert.equal(sheet.cells[0].at(-2), 'extra');
  assert.deepEqual(post({ token, pull: true }).rows[1], b, 'header reordering must preserve untouched raw records');
  const jsonCol = sheet.cells[0].indexOf('_json') + 1;
  assert.ok(sheet.formats.some((f) => f.col === jsonCol && f.format === '@'));
  assert.equal(sheet.locks.acquired, sheet.locks.released);
});

test('Sheet: stale writes are skipped and return the full newer record; ties can update', () => {
  const sheet = fakeSheet(), post = loadAppsScript(sheet);
  const newer = { study_id: 'CS-001', name: 'Bot edit', ac: ['pe'], updatedAt: NEW };
  save(post, newer);
  const stale = save(post, { ...newer, name: 'Stale phone', updatedAt: OLD });
  assert.equal(stale.written, 0);
  assert.deepEqual(stale.skipped, [newer]);
  assert.deepEqual(post({ token, pull: true }).rows, [newer]);
  assert.equal(save(post, { ...newer, name: 'Equal timestamp' }).written, 1);
  assert.equal(post({ token, ping: true }).rows, 1);
  assert.equal(sheet.locks.acquired, sheet.locks.released);
});

test('Sheet: legacy IST timestamp guard and migration do not erase newer rows', () => {
  const sheet = fakeSheet(), post = loadAppsScript(sheet);
  const legacy = Schema.flatten({ study_id: 'CS-001', name: 'Legacy', updatedAt: NEW });
  post({ token, columns: Schema.columns(), rows: [legacy] });
  const skipped = save(post, { study_id: 'CS-001', name: 'Stale', updatedAt: OLD });
  assert.equal(skipped.written, 0);
  assert.equal(skipped.skipped[0].updatedAt, NEW);
  assert.deepEqual(post({ token, pull: true }).rows, []);
  save(post, { study_id: 'CS-001', name: 'Backfilled', updatedAt: NEW });
  const missingJson = post({ token, columns: Schema.columns(), rows: [Schema.flatten({ study_id: 'CS-001', name: 'Old app', updatedAt: LATEST })] });
  assert.equal(missingJson.ok, false);
  assert.match(missingJson.error, /missing _json/);
  assert.equal(post({ token, pull: true }).rows[0].name, 'Backfilled');
  assert.equal(sheet.locks.acquired, sheet.locks.released, 'errors must release the lock');
});

test('Sheet: repeated IDs within a batch see earlier writes in that batch', () => {
  const sheet = fakeSheet(), post = loadAppsScript(sheet);
  const result = save(post, { study_id: 'CS-B001', name: 'New', updatedAt: NEW }, { study_id: 'CS-B001', name: 'Old', updatedAt: OLD });
  assert.equal(result.written, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(sheet.getLastRow(), 2);
  assert.equal(post({ token, pull: true }).rows[0].name, 'New');
});

test('sync: pull first; backfill existing local records once; keep absent local cases; new pulled IDs do not re-push', async () => {
  const sheet = fakeSheet(), post = loadAppsScript(sheet);
  save(post, { study_id: 'CS-B003', name: 'Bot', updatedAt: NEW }, { study_id: 'CS-042', name: 'Other phone', updatedAt: NEW });
  const local = { study_id: 'CS-001', name: 'Phone only', updatedAt: OLD, syncedAt: OLD };
  const app = browser([local], (body) => post(body));
  const first = await app.Sync.sync([local]);
  assert.deepEqual(plain(first), { pulled: 2, sent: 1, skipped: 0 });
  assert.equal(app.requests[0].pull, true);
  assert.equal(app.requests[1].rows[0].study_id, 'CS-001');
  assert.equal((await app.DB.all()).length, 3, 'pull never deletes local-only cases');
  assert.equal(app.values.get('lastSeq'), '042');
  assert.equal(Sync.needsSync(await app.DB.get('CS-B003')), false);
  const second = await app.Sync.sync(await app.DB.all());
  assert.deepEqual(plain(second), { pulled: 0, sent: 0, skipped: 0 });
  assert.equal(app.requests.length, 3, 'second sync only pulls');
});

test('sync: a newer Sheet copy replaces a clean phone copy without a needless push', async () => {
  const sheet = fakeSheet(), post = loadAppsScript(sheet);
  const local = { study_id: 'CS-001', name: 'Synced phone', updatedAt: OLD, syncedAt: OLD };
  const remote = { study_id: 'CS-001', name: 'Newer Sheet', updatedAt: NEW };
  save(post, remote);
  assert.equal(Sync.needsSync(local), false, 'syncedAt equal to updatedAt is not dirty');
  const app = browser([local], (body) => post(body), { syncJsonBackfillV1: config.syncUrl });
  const result = await app.Sync.sync([local]);
  assert.deepEqual(plain(result), { pulled: 1, sent: 0, skipped: 0 });
  assert.deepEqual(await app.DB.get(local.study_id), { ...remote, syncedAt: NEW });
  assert.equal(Sync.needsSync(await app.DB.get(local.study_id)), false);
  assert.equal(app.requests.length, 1, 'a clean pulled record only needs the pull request');
});

test('sync: old deployment falls back to push-only, pushes unsynced cases, keeps the backfill pending', async () => {
  const synced = { study_id: 'CS-001', name: 'Done', updatedAt: OLD, syncedAt: OLD };
  const unsynced = { study_id: 'CS-002', name: 'Offline case', updatedAt: NEW };
  const app = browser([synced, unsynced], (body) => ({ ok: true, written: body.rows ? body.rows.length : 0 }));
  const result = await app.Sync.sync([]);
  assert.equal(result.pulled, 0);
  assert.equal(result.sent, 1);
  assert.deepEqual(app.requests[1].rows.map((r) => r.study_id), ['CS-002']);
  assert.equal(app.values.has('syncJsonBackfillV1'), false);
  assert.equal(Sync.needsSync(await app.DB.get('CS-002')), false);
});

test('sync: any pull error never blocks the push or consumes backfill', async () => {
  for (const reply of [
    () => ({ ok: false, error: 'Unknown action' }),
    () => { throw new Error('Network failure'); },
    () => { throw new SyntaxError('Malformed JSON'); },
    () => ({ ok: true, rows: [null] }),
  ]) {
    const unsynced = { study_id: 'CS-002', name: 'Offline case', updatedAt: NEW };
    const app = browser([unsynced], (body) => body.pull ? reply() : { ok: true, written: 1 });
    const result = await app.Sync.sync([]);
    assert.equal(result.sent, 1);
    assert.equal(app.values.has('syncJsonBackfillV1'), false);
    assert.equal((await app.DB.get('CS-002')).name, 'Offline case');
  }
});

test('sync: a hanging pull times out silently and still uploads phone cases', async () => {
  const unsynced = { study_id: 'CS-002', name: 'Offline case', updatedAt: NEW };
  const app = browser([unsynced], (body, DB, options) => {
    if (!body.pull) return { ok: true, written: 1 };
    return new Promise((resolve, reject) => {
      if (options.signal.aborted) reject(new Error('Aborted'));
      else options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
  }, {}, { setTimeout: (callback) => setTimeout(callback, 0) });
  const result = await app.Sync.sync([]);
  assert.equal(result.sent, 1);
  assert.equal(app.values.has('syncJsonBackfillV1'), false);
});

test('sync: unsynced phone values survive newer Sheet data, without deletion or renumbering', async () => {
  const sheet = fakeSheet(), post = loadAppsScript(sheet);
  save(post, { study_id: 'CS-007', name: 'Bot edit', phone: '1234567', updatedAt: NEW });
  const local = { study_id: 'CS-007', name: 'Unsynced phone', phone: '', updatedAt: OLD };
  const absent = { study_id: 'CS-B001', name: 'Phone only', updatedAt: OLD };
  const app = browser([local, absent], (body) => post(body));
  const result = await app.Sync.sync([]);
  assert.equal(result.sent, 2);
  assert.equal(result.skipped, 0);
  assert.deepEqual((await app.DB.all()).map((r) => r.study_id), ['CS-007', 'CS-B001']);
  assert.equal((await app.DB.get('CS-007')).name, 'Unsynced phone');
  assert.equal((await app.DB.get('CS-007')).phone, '1234567');
  assert.equal(post({ token, pull: true }).rows[0].name, 'Unsynced phone');
});

test('merge: unsynced phone edits beat a newer Sheet copy; Sheet only fills blanks; result pushes past the guard', () => {
  const local = { study_id: 'CS-001', name: 'Phone edit', hb: 9, updatedAt: NEW, syncedAt: OLD };
  const remote = { study_id: 'CS-001', name: 'Bot value', hb: 11, bw: 2800, updatedAt: LATEST };
  const result = Sync.mergeRecord(local, remote);
  assert.equal(result.name, 'Phone edit');
  assert.equal(result.hb, 9);
  assert.equal(result.bw, 2800);
  assert.ok(Date.parse(result.updatedAt) > Date.parse(LATEST));
  assert.equal(Sync.needsSync(result), true);
});

test('sync: edits made in flight are retained and stay pending', async () => {
  const local = { study_id: 'CS-001', name: 'Sent', updatedAt: OLD };
  const app = browser([local], async (body, DB) => {
    if (body.pull) return { ok: true, rows: [] };
    await DB.put({ ...local, name: 'Edited while syncing', updatedAt: NEW });
    return { ok: true, written: 1, skipped: [] };
  });
  await app.Sync.sync([local]);
  const stored = await app.DB.get(local.study_id);
  assert.equal(stored.name, 'Edited while syncing');
  assert.equal(stored.syncedAt, OLD);
  assert.equal(Sync.needsSync(stored), true);
});

test('sync: a newer bot edit between pull and push survives, retained phone fields push next time', async () => {
  const sheet = fakeSheet(), post = loadAppsScript(sheet);
  const local = { study_id: 'CS-001', name: 'Phone', phone: '1234567', updatedAt: OLD };
  let race = true;
  const app = browser([local], (body) => {
    if (!body.pull && race) {
      race = false;
      save(post, { study_id: 'CS-001', name: 'Newer bot', updatedAt: NEW });
    }
    return post(body);
  });
  const result = await app.Sync.sync([local]);
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
  const merged = await app.DB.get(local.study_id);
  assert.equal(merged.name, 'Phone', 'unsynced phone values survive a conflict');
  assert.equal(merged.phone, '1234567');
  assert.ok(Sync.needsSync(merged));
  assert.equal(post({ token, pull: true }).rows[0].name, 'Newer bot');
  const retry = await app.Sync.sync(await app.DB.all());
  assert.equal(retry.sent, 1);
  assert.equal(post({ token, pull: true }).rows[0].phone, '1234567');
});

test('sync: overlapping button presses share one sync request', async () => {
  const app = browser([], () => ({ ok: true, rows: [] }));
  const first = app.Sync.sync([]), second = app.Sync.sync([]);
  assert.equal(first, second);
  await first;
  assert.equal(app.requests.length, 1);
});
