/* Push records to the Google Sheet through the Apps Script web app (see apps-script/Code.gs). */
(function (root) {
  'use strict';

  function settings() {
    return { url: localStorage.getItem('syncUrl') || '', token: localStorage.getItem('syncToken') || '' };
  }

  function needsSync(r) {
    return !r.syncedAt || (r.updatedAt || '') > r.syncedAt;
  }

  const TEXT_COLUMNS = ['study_id'].concat(
    Schema.FIELDS.filter((f) => ['text', 'tel', 'textarea'].includes(f.type)).map((f) => f.id)
  );

  async function post(url, body) {
    // text/plain avoids a CORS pre-flight, which Apps Script does not answer
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('Unexpected reply from Google (check the web-app URL and that access is "Anyone")'); }
    if (!json.ok) throw new Error(json.error || 'Sync failed');
    return json;
  }

  // Sends records in batches; returns number of records synced
  async function sync(records, { all = false } = {}) {
    const { url, token } = settings();
    if (!url || !token) throw new Error('Set the Google Sheet URL and token in Settings first');
    if (!navigator.onLine) throw new Error('You are offline — sync when connected');
    const pending = records.filter((r) => all || needsSync(r));
    if (!pending.length) return 0;
    const columns = Schema.columns();
    const BATCH = 50;
    let done = 0;
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const startedAt = new Date().toISOString();
      await post(url, { token, columns, textColumns: TEXT_COLUMNS, rows: batch.map((r) => Schema.flatten(r)) });
      // Re-read before marking, so an edit made while the request was in flight is not overwritten
      // (its updatedAt is later than startedAt, so it stays pending for the next sync)
      for (const r of batch) {
        const cur = await DB.get(r.study_id);
        if (!cur) continue;
        cur.syncedAt = startedAt;
        await DB.put(cur);
      }
      done += batch.length;
    }
    localStorage.setItem('lastSync', new Date().toISOString());
    return done;
  }

  async function test() {
    const { url, token } = settings();
    if (!url || !token) throw new Error('Enter URL and token first');
    return post(url, { token, ping: true });
  }

  root.Sync = { sync, test, needsSync, settings };
})(window);
