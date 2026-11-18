/**
 * CS Audit — two-way Google Sheet sync.
 * Paste into Extensions → Apps Script, keep your TOKEN, then redeploy a new version.
 * _json is the raw record used by the phone and bot; other columns are for analysis.
 */

// CHANGE THIS to your own long random secret, and enter the same value in the app's Settings.
const TOKEN = 'change-me-to-a-long-secret';
const SHEET_NAME = 'Data';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || body.token !== TOKEN) return reply({ ok: false, error: 'Wrong token' });
    const sheet = getSheet();
    if (body.ping) return reply({ ok: true, rows: Math.max(0, sheet.getLastRow() - 1) });

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (body.pull) return reply({ ok: true, rows: pull(sheet) });
      const result = upsert(sheet, body.columns || [], body.textColumns || [], body.rows || []);
      return reply({ ok: true, written: result.written, skipped: result.skipped });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return reply({ ok: true, message: 'CS Audit receiver is running. Use authenticated POST to sync.' });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function rawRecord(value) {
  if (!value) return null;
  const record = JSON.parse(String(value));
  if (!record || typeof record !== 'object' || Array.isArray(record) || !record.study_id) {
    throw new Error('Invalid _json record; restore its study_id before syncing');
  }
  return record;
}

function pull(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const jsonCol = data[0].indexOf('_json');
  if (jsonCol === -1) return [];
  return data.slice(1).map((row) => rawRecord(row[jsonCol])).filter(Boolean);
}

// UTC in _json is authoritative. Legacy rows only have an IST updated_at cell.
function updatedTime(record, value) {
  const raw = record && Date.parse(record.updatedAt || '');
  if (Number.isFinite(raw)) return raw;
  if (value instanceof Date) return value.getTime();
  const s = String(value || '');
  const t = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s) ? s.replace(' ', 'T') + '+05:30' : s);
  return Number.isFinite(t) ? t : 0;
}

function upsert(sheet, columns, textColumns, rows) {
  if (!rows.length) return { written: 0, skipped: [] };
  const oldHeaders = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
  const oldRows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, oldHeaders.length).getValues() : [];
  // Keep analysis columns in their existing order; move _json last even after new fields appear.
  const headers = Array.from(new Set(oldHeaders.concat(columns).filter((c) => c && c !== '_json'))).concat('_json');
  const idCol = headers.indexOf('study_id');
  if (idCol === -1) throw new Error('study_id column missing');
  const jsonCol = headers.indexOf('_json');
  const timeCol = headers.indexOf('updated_at');
  const stored = oldRows.map((row) => headers.map((h) => oldHeaders.includes(h) ? row[oldHeaders.indexOf(h)] : ''));

  // Apply text formatting before writing, including during header migration.
  Array.from(new Set(['study_id', '_json'].concat(textColumns))).forEach((c) => {
    const i = headers.indexOf(c);
    if (i !== -1) sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  });
  if (JSON.stringify(headers) !== JSON.stringify(oldHeaders)) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (stored.length) sheet.getRange(2, 1, stored.length, headers.length).setValues(stored);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  const rowOf = new Map();
  stored.forEach((row, i) => rowOf.set(String(row[idCol]), i));
  const skipped = [];
  let written = 0;
  rows.forEach((row) => {
    if (!row.study_id) throw new Error('Row is missing study_id');
    const incoming = rawRecord(row._json);
    if (incoming && incoming.study_id !== row.study_id) throw new Error('_json study_id does not match row');
    let index = rowOf.get(String(row.study_id));
    const previous = index === undefined ? null : stored[index];
    const existing = previous && rawRecord(previous[jsonCol]);
    const previousTime = previous ? updatedTime(existing, previous[timeCol]) : 0;
    if (previous && previousTime > updatedTime(incoming, row.updated_at)) {
      skipped.push(existing || { study_id: row.study_id, updatedAt: new Date(previousTime).toISOString() });
      return;
    }
    // An old cached push-only app cannot keep _json in step with its analysis columns.
    if (existing && !incoming) throw new Error('Update the CS Audit app before sending this case (missing _json)');
    if (index === undefined) index = stored.length;
    const values = headers.map((h) => row[h] === undefined || row[h] === null ? '' : row[h]);
    sheet.getRange(index + 2, 1, 1, headers.length).setValues([values]);
    stored[index] = values;
    rowOf.set(String(row.study_id), index);
    written++;
  });
  return { written, skipped };
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
