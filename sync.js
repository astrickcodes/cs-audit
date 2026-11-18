/* Pull/merge, then push through the Apps Script web app (apps-script/Code.gs). */
(function (root) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) require('./derive.js');
  const Schema = root.Schema || require('./schema.js');
  const BACKFILL_KEY = 'syncJsonBackfillV1';
  const TEXT_COLUMNS = ['study_id'].concat(
    Schema.FIELDS.filter((f) => ['text', 'tel', 'textarea'].includes(f.type)).map((f) => f.id), '_json'
  );

  function settings() {
    return { url: localStorage.getItem('syncUrl') || '', token: localStorage.getItem('syncToken') || '' };
  }

  function needsSync(r) {
    return !r.syncedAt || timestamp(r.updatedAt) > timestamp(r.syncedAt);
  }

  function timestamp(value) { return Date.parse(value || '') || 0; }
  function nextTimestamp(...values) {
    return new Date(Math.max(Date.now(), ...values.map((v) => timestamp(v) + 1))).toISOString();
  }

  // Unsynced local values always win; otherwise the newer record wins. Blanks never erase values.
  // syncedAt is a local acknowledgement, never a field to copy between devices.
  function mergeRecord(local, sheet) {
    if (!local) {
      const record = Object.assign({}, sheet, { syncedAt: sheet.updatedAt || '' });
      delete record._dirty;
      return record;
    }
    // Unsynced phone edits are never overridden: the Sheet may only fill their empty fields.
    const localDirty = needsSync(local);
    const sheetNewer = timestamp(sheet.updatedAt) >= timestamp(local.updatedAt);
    const sheetWins = !localDirty && timestamp(sheet.updatedAt) > timestamp(local.updatedAt);
    const primary = sheetWins ? sheet : local;
    const secondary = sheetWins ? local : sheet;
    const merged = Object.assign({}, primary);
    delete merged._dirty;
    let filled = false;
    for (const key of Object.keys(secondary)) {
      if (key === 'syncedAt' || key === '_dirty') continue;
      if (Schema.isEmpty(merged[key]) && !Schema.isEmpty(secondary[key])) {
        merged[key] = secondary[key];
        filled = true;
      }
    }
    if (filled || (localDirty && sheetNewer)) {
      // Bump past the Sheet copy so the server's stale-write guard accepts the phone's edits.
      merged.updatedAt = nextTimestamp(local.updatedAt, sheet.updatedAt);
      delete merged.syncedAt; // The combined record must be pushed back.
    } else if (sheetWins) merged.syncedAt = sheet.updatedAt || '';
    return merged;
  }

  // Shared by the browser and bot: CSV flattening stays unchanged, _json is Sheet-only.
  function flatten(record) {
    return Object.assign(Schema.flatten(record), { _json: JSON.stringify(record) });
  }
  function columns() { return Schema.columns().concat('_json'); }

  async function post(url, body, fetcher = root.fetch.bind(root)) {
    // text/plain avoids a CORS pre-flight, which Apps Script does not answer.
    const res = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('Unexpected reply from Google (check the web-app URL and that access is "Anyone")'); }
    if (!json.ok) throw new Error(json.error || 'Sync failed');
    return json;
  }

  async function mergeIntoDB(sheet) {
    if (!sheet || !sheet.study_id) throw new Error('Sheet returned a record without study_id');
    const local = await DB.get(sheet.study_id);
    const record = mergeRecord(local, sheet);
    if (JSON.stringify(local) === JSON.stringify(record)) return false;
    await DB.put(record);
    // Bot CS-Bnnn IDs are deliberately outside the phone's numeric sequence.
    const match = /^CS-(\d+)$/.exec(record.study_id);
    if (match && Number(match[1]) > (Number(localStorage.getItem('lastSeq')) || 0)) localStorage.setItem('lastSeq', match[1]);
    return true;
  }

  async function performSync({ all = false } = {}) {
    const { url, token } = settings();
    if (!url || !token) throw new Error('Set the Google Sheet URL and token in Settings first');
    if (!navigator.onLine) throw new Error('You are offline — sync when connected');
    const backfill = localStorage.getItem(BACKFILL_KEY) !== url;
    const originalIds = new Set((await DB.all()).map((r) => r.study_id));
    // Pull is optional until the Sheet script is upgraded; uploads must still work.
    let twoWay = false, pulled = 0, sent = 0, skipped = 0;
    const controller = new AbortController();
    const pullTimeout = setTimeout(() => controller.abort(), 10000);
    try {
      const incoming = await post(url, { token, pull: true }, (target, options) =>
        root.fetch(target, Object.assign({}, options, { signal: controller.signal })));
      clearTimeout(pullTimeout);
      if (Array.isArray(incoming.rows)) {
        for (const record of incoming.rows) if (await mergeIntoDB(record)) pulled++;
        twoWay = true;
      }
    } catch (e) {
      // Silently retain legacy push-only sync on any pull failure.
    } finally { clearTimeout(pullTimeout); }
    // Re-read: never push the stale snapshot supplied before the pull (or an intervening edit).
    const pending = (await DB.all()).filter((r) => all || needsSync(r) || (twoWay && backfill && originalIds.has(r.study_id)));
    for (let i = 0; i < pending.length; i += 50) {
      const batch = pending.slice(i, i + 50);
      const result = await post(url, { token, columns: columns(), textColumns: TEXT_COLUMNS, rows: batch.map(flatten) });
      const conflicts = result.skipped || [];
      const skipIds = new Set(conflicts.map((r) => r.study_id));
      for (const record of conflicts) if (await mergeIntoDB(record)) pulled++;
      for (const record of batch) {
        if (skipIds.has(record.study_id)) continue;
        const current = await DB.get(record.study_id);
        if (!current) continue;
        // Acknowledging only the version sent keeps edits made in flight pending.
        current.syncedAt = record.updatedAt || '';
        await DB.put(current);
      }
      sent += result.written === undefined ? batch.length - conflicts.length : result.written;
      skipped += conflicts.length;
    }
    if (twoWay) localStorage.setItem(BACKFILL_KEY, url);
    localStorage.setItem('lastSync', new Date().toISOString());
    return { pulled, sent, skipped };
  }

  let activeSync;
  function sync(records, options) {
    if (activeSync) return activeSync;
    activeSync = performSync(options).finally(() => { activeSync = null; });
    return activeSync;
  }

  async function test() {
    const { url, token } = settings();
    if (!url || !token) throw new Error('Enter URL and token first');
    return post(url, { token, ping: true });
  }

  const api = { sync, test, needsSync, settings, mergeRecord, flatten, columns, TEXT_COLUMNS, post };
  root.Sync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
