const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fakeSheet() {
  const cells = []; // 2-D array, 1-based access via helpers
  const sheet = {
    cells,
    formats: [],
    getLastRow: () => cells.length,
    getLastColumn: () => cells.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxRows: () => 1000,
    setFrozenRows() {},
    getRange(row, col, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((cells[row - 1 + i] || [])[col - 1 + j] ?? ''))),
        setValues: (vals) => vals.forEach((r, i) => r.forEach((v, j) => { (cells[row - 1 + i] = cells[row - 1 + i] || [])[col - 1 + j] = v; })),
        setNumberFormat(format) { sheet.formats.push({ row, col, nr, nc, format }); return this; },
        setFontWeight() { return this; },
      };
    },
  };
  return sheet;
}

function loadAppsScript(sheet) {
  const locks = { acquired: 0, released: 0 };
  sheet.locks = locks;
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    LockService: { getScriptLock: () => ({ waitLock() { locks.acquired++; }, releaseLock() { locks.released++; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => ({ body: JSON.parse(s) }) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
  return (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body;
}


module.exports = { fakeSheet, loadAppsScript };
