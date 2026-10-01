// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Derive = require('../derive.js');
const Schema = require('../schema.js');

const base = { el_primi: 'yes', el_singleton: 'yes', el_ga28: 'yes', el_nmch: 'yes', el_records: 'yes', el_hyst: 'no' };

test('Robson: every reachable group for primigravida singleton', () => {
  const R = (o) => Derive.robson(Object.assign({}, base, o));
  assert.equal(R({ presentation: 'transverse', ga_weeks: 30 }), '9');
  assert.equal(R({ presentation: 'transverse' }), '9'); // lie alone is enough
  assert.equal(R({ presentation: 'breech', ga_weeks: 32 }), '6');
  assert.equal(R({ presentation: 'breech', ga_weeks: 39, labour_onset: 'induced' }), '6');
  assert.equal(R({ presentation: 'cephalic', ga_weeks: 36, ga_days: 6, labour_onset: 'spontaneous' }), '10');
  assert.equal(R({ presentation: 'cephalic', ga_weeks: 37, ga_days: 0, labour_onset: 'spontaneous' }), '1');
  assert.equal(R({ presentation: 'cephalic', ga_weeks: 40, labour_onset: 'induced' }), '2a');
  assert.equal(R({ presentation: 'cephalic', ga_weeks: 38, labour_onset: 'prelabour' }), '2b');
  assert.equal(R({ presentation: 'cephalic', ga_weeks: 34, labour_onset: 'prelabour' }), '10');
});

test('Robson: unclassifiable when inputs missing', () => {
  assert.equal(Derive.robson({}), '');
  assert.equal(Derive.robson({ presentation: 'cephalic' }), '');
  assert.equal(Derive.robson({ presentation: 'cephalic', ga_weeks: 39 }), '');
  assert.equal(Derive.robson({ presentation: 'cephalic', ga_weeks: '' , labour_onset: 'induced' }), '');
});

test('intervals: DDI, stay', () => {
  assert.equal(Derive.minutesBetween('2025-06-01T23:40', '2025-06-02T00:25'), 45);
  assert.equal(Derive.minutesBetween('', '2025-06-02T00:25'), null);
  assert.equal(Derive.daysBetween('2025-06-01', '2025-06-06'), 5);
  assert.equal(Derive.daysBetween('2025-06-01', '2025-06-01T10:00'), 0);
  assert.equal(Derive.daysBetween('2025-02-27', '2025-03-02'), 3);
  const d = Derive.deriveAll({ adm_date: '2025-06-01', decision_dt: '2025-06-02T10:00', incision_dt: '2025-06-02T10:20', birth_dt: '2025-06-02T10:28', discharge_date: '2025-06-07' });
  assert.equal(d.ddi_min, 28);
  assert.equal(d.dii_min, 20);
  assert.equal(d.stay_days, 6);
  assert.equal(d.postop_days, 5);
});

test('other derived variables', () => {
  assert.equal(Derive.elderly({ age: '35' }), 'Yes');
  assert.equal(Derive.elderly({ age: '34' }), 'No');
  assert.equal(Derive.elderly({}), '');
  assert.equal(Derive.bmi({ height_cm: 150, weight_kg: 60 }), 26.7);
  assert.equal(Derive.anaemiaGrade({ hb: '6.9' }), 'Severe');
  assert.equal(Derive.anaemiaGrade({ hb: '9.9' }), 'Moderate');
  assert.equal(Derive.anaemiaGrade({ hb: '10.5' }), 'Mild');
  assert.equal(Derive.anaemiaGrade({ hb: '11' }), 'None');
  assert.equal(Derive.bwCategory({ bw: 2499 }), 'LBW (1500-2499 g)');
  assert.equal(Derive.bwCategory({ bw: 2500 }), 'Normal (2500-3999 g)');
  assert.equal(Derive.bwCategory({ bw: 4000 }), 'Macrosomia (≥4000 g)');
  assert.equal(Derive.perinatalDeath({ birth_status: 'fsb' }), 'Yes');
  assert.equal(Derive.perinatalDeath({ birth_status: 'live', neo_outcome: 'end' }), 'Yes');
  assert.equal(Derive.perinatalDeath({ birth_status: 'live', neo_outcome: 'lnd' }), 'No');
  assert.equal(Derive.perinatalDeath({ birth_status: 'live' }), '');
  assert.equal(Derive.eligibility(base), 'Included');
  assert.equal(Derive.eligibility(Object.assign({}, base, { el_singleton: 'no' })), 'Excluded');
  assert.equal(Derive.eligibility(Object.assign({}, base, { el_hyst: 'yes' })), 'Excluded');
  assert.equal(Derive.eligibility({ el_primi: 'yes' }), '');
});

const full = Object.assign({}, base, {
  study_id: 'CS-001', name: 'Test, "Patient"', phone: '+91 98765 43210', reg_no: '0012/25', adm_date: '2025-06-01',
  age: '36', ga_weeks: '39', ga_days: '2', presentation: 'cephalic', labour_onset: 'induced', induction_method: ['miso'],
  ac: ['pe', 'anaemia'], cs_type: 'emergency', urgency: '2', ind_primary: 'failed_ind', decision_dt: '2025-06-02T10:00', birth_dt: '2025-06-02T10:50',
  aud_documented: 'yes', aud_partograph: 'yes', aud_tol: 'yes', aud_senior: 'yes', aud_criteria: 'yes', aud_verdict: 'justified', aud_avoidable: 'no',
  aud_bishop: 'yes', mod: ['none'], io: ['none'], po: ['fever'], recovery: 'complicated', discharge_date: '2025-06-07', mat_outcome: 'well',
  birth_status: 'live', bw: '2400', apgar1: '6', apgar5: '8', nicu: 'no', nc: ['none'], bf_1hr: 'yes', neo_outcome: 'discharged',
});

test('validate: complete record has no missing/errors', () => {
  const v = Schema.validate(full);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.missing.map((m) => m.id), []);
});

test('validate: catches ranges, order of times, missing fields', () => {
  const r = Object.assign({}, full, { age: '70', birth_dt: '2025-06-02T09:00', apgar5: '' });
  const v = Schema.validate(r);
  const ids = v.errors.map((e) => e.id);
  assert.ok(ids.includes('age'));
  assert.ok(ids.includes('birth_dt'));
  assert.ok(v.missing.some((m) => m.id === 'apgar5'));
});

test('validate: stillbirth does not require Apgar / NICU / BF', () => {
  const r = Object.assign({}, full, { birth_status: 'msb', neo_outcome: 'stillbirth', apgar1: '', apgar5: '', nicu: '', nc: [], bf_1hr: '' });
  const v = Schema.validate(r);
  assert.deepEqual(v.missing.map((m) => m.id), []);
  assert.deepEqual(v.errors, []);
});

test('validate: excluded case only needs eligibility + reason', () => {
  const r = { study_id: 'CS-002', el_primi: 'no', el_singleton: 'yes', el_ga28: 'yes', el_nmch: 'yes', el_records: 'yes', el_hyst: 'no' };
  assert.deepEqual(Schema.validate(r).missing.map((m) => m.id), ['excl_reason']);
  r.excl_reason = 'Multigravida';
  assert.deepEqual(Schema.validate(r).missing, []);
});

test('flatten: labels, 0/1 multi columns, derived, hidden values dropped', () => {
  const row = Schema.flatten(Object.assign({}, full, { labour_onset: 'spontaneous' })); // induction now hidden
  assert.equal(row.presentation, 'Cephalic');
  assert.equal(row.ac_pe, 1);
  assert.equal(row.ac_gdm, 0);
  assert.equal(row.induction_method_miso, '');
  assert.equal(row.robson, '1');
  assert.equal(row.elderly_primi, 'Yes');
  assert.equal(row.ddi_min, 50);
  assert.equal(row.bw_cat, 'LBW (1500-2499 g)');
  const cols = Schema.columns();
  assert.equal(new Set(cols).size, cols.length, 'column names unique');
  assert.deepEqual(Object.keys(row).sort(), cols.slice().sort());
});

test('schema: every option list has unique codes, every show/req is valid', () => {
  for (const f of Schema.FIELDS) {
    if (f.options) assert.equal(new Set(f.options.map((o) => o[0])).size, f.options.length, f.id);
    if (f.show) assert.equal(typeof f.show({}), 'boolean', f.id);
    if (f.req !== undefined) assert.ok(f.req === true || f.req === 'always', f.id);
  }
});

test('warnings flag audit-relevant inconsistencies', () => {
  const w = Schema.warnings(Object.assign({}, full, { urgency: '1', ind_primary: 'breech' }));
  assert.ok(w.some((x) => x.includes('Category 1')));
  assert.ok(w.some((x) => x.includes('breech')));
});

// ---------- Apps Script upsert with a fake SpreadsheetApp ----------
function fakeSheet() {
  const cells = []; // 2-D array, 1-based access via helpers
  const sheet = {
    cells,
    getLastRow: () => cells.length,
    getLastColumn: () => cells.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxRows: () => 1000,
    setFrozenRows() {},
    getRange(row, col, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((cells[row - 1 + i] || [])[col - 1 + j] ?? ''))),
        setValues: (vals) => vals.forEach((r, i) => r.forEach((v, j) => { (cells[row - 1 + i] = cells[row - 1 + i] || [])[col - 1 + j] = v; })),
        setNumberFormat() { return this; },
        setFontWeight() { return this; },
      };
    },
  };
  return sheet;
}

function loadAppsScript(sheet) {
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => ({ body: JSON.parse(s) }) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
  return (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body;
}

test('Apps Script: token check, insert, then update without duplicating', () => {
  const sheet = fakeSheet();
  const post = loadAppsScript(sheet);
  const token = 'change-me-to-a-long-secret';
  assert.equal(post({ token: 'wrong', rows: [] }).ok, false);
  assert.deepEqual(post({ token, ping: true }), { ok: true, rows: 0 });

  const columns = Schema.columns();
  const r1 = Schema.flatten(full);
  const r2 = Schema.flatten(Object.assign({}, full, { study_id: 'CS-002', name: 'Second' }));
  assert.equal(post({ token, columns, textColumns: ['name'], rows: [r1, r2] }).written, 2);
  assert.equal(sheet.getLastRow(), 3);

  const edited = Schema.flatten(Object.assign({}, full, { bw: '3100' }));
  post({ token, columns, rows: [edited] });
  assert.equal(sheet.getLastRow(), 3, 'no duplicate row');
  const headers = sheet.cells[0];
  assert.equal(sheet.cells[1][headers.indexOf('bw')], '3100');
  assert.equal(sheet.cells[2][headers.indexOf('name')], 'Second');

  // A new column added in a later app version is appended to the header
  post({ token, columns: columns.concat('new_col'), rows: [Object.assign({}, edited, { new_col: 'x' })] });
  assert.equal(sheet.cells[0].at(-1), 'new_col');
  assert.equal(sheet.cells[1].at(-1), 'x');
  assert.deepEqual(post({ token, ping: true }), { ok: true, rows: 2 });
});
