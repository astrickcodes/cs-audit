/* CSV export and JSON backup / restore. */
(function (root) {
  'use strict';

  function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(records) {
    const cols = Schema.columns();
    const lines = [cols.join(',')];
    for (const r of records) {
      const row = Schema.flatten(r);
      lines.push(cols.map((c) => csvCell(row[c])).join(','));
    }
    return '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 correctly
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  // On iPhone the share sheet is the most reliable way to save a file (Files, Drive, WhatsApp, Mail…)
  async function saveFile(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function exportCSV(records) {
    await saveFile(`cs-audit_${stamp()}.csv`, toCSV(records), 'text/csv');
  }

  async function exportBackup(records) {
    const data = { app: 'cs-audit', version: 1, exportedAt: new Date().toISOString(), records };
    await saveFile(`cs-audit-backup_${stamp()}.json`, JSON.stringify(data, null, 1), 'application/json');
  }

  // Merge a backup into existing records: the newer updatedAt wins
  function mergeBackup(existing, text) {
    const data = JSON.parse(text);
    if (!data || data.app !== 'cs-audit' || !Array.isArray(data.records)) throw new Error('Not a CS Audit backup file');
    const byId = new Map(existing.map((r) => [r.study_id, r]));
    const changed = [];
    for (const r of data.records) {
      if (!r || !r.study_id) continue;
      const cur = byId.get(r.study_id);
      if (!cur || (r.updatedAt || '') > (cur.updatedAt || '')) changed.push(r);
    }
    return changed;
  }

  root.Export = { toCSV, exportCSV, exportBackup, mergeBackup };
})(window);
