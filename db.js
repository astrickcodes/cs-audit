/* Tiny IndexedDB wrapper: one object store "cases" keyed by study_id. */
(function (root) {
  'use strict';
  let dbPromise;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('cs-audit', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('cases', { keyPath: 'study_id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cases', mode);
      const req = fn(tx.objectStore('cases'));
      tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  root.DB = {
    all: () => run('readonly', (s) => s.getAll()),
    get: (id) => run('readonly', (s) => s.get(id)),
    put: (rec) => run('readwrite', (s) => s.put(rec)),
    del: (id) => run('readwrite', (s) => s.delete(id)),
    putMany: (recs) => run('readwrite', (s) => { recs.forEach((r) => s.put(r)); return null; }),
    // Delete old keys and write new records in one transaction (used to change study IDs)
    replace: (oldIds, recs) => run('readwrite', (s) => { oldIds.forEach((id) => s.delete(id)); recs.forEach((r) => s.put(r)); return null; }),
  };
})(window);
