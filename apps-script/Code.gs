/**
 * CS Audit — Google Sheet receiver.
 * Paste into Extensions → Apps Script of your Google Sheet, change TOKEN, then
 * Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * The app sends cases here; each case is inserted or updated (by study_id) in the "Data" sheet.
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
      const n = upsert(sheet, body.columns || [], body.textColumns || [], body.rows || []);
      return reply({ ok: true, written: n });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return reply({ ok: true, message: 'CS Audit receiver is running. Use the app to send data.' });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function upsert(sheet, columns, textColumns, rows) {
  if (!rows.length) return 0;

  // Header row: keep existing order, append any new columns at the end
  let headers = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
  const missing = columns.filter((c) => headers.indexOf(c) === -1);
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  const idCol = headers.indexOf('study_id');
  if (idCol === -1) throw new Error('study_id column missing');

  // Text columns (name, phone, reg no…) are stored as plain text so Sheets does not mangle them
  textColumns.forEach((c) => {
    const i = headers.indexOf(c);
    if (i !== -1) sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  });

  const lastRow = sheet.getLastRow();
  const ids = lastRow > 1 ? sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues().map((r) => String(r[0])) : [];
  const rowOf = {};
  ids.forEach((id, i) => { rowOf[id] = i + 2; });

  let appendAt = lastRow + 1;
  rows.forEach((row) => {
    const values = [headers.map((h) => (row[h] === undefined || row[h] === null ? '' : row[h]))];
    const target = rowOf[row.study_id] || appendAt++;
    sheet.getRange(target, 1, 1, headers.length).setValues(values);
    rowOf[row.study_id] = target;
  });
  return rows.length;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
