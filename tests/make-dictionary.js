// Regenerates DATA_DICTIONARY.md from schema.js:  node tests/make-dictionary.js
const fs = require('node:fs');
const path = require('node:path');
require('../derive.js');
const Schema = require('../schema.js');

const meta = [
  ['study_id', 'Study ID (CS-001 …)', 'text', ''],
  ['status', 'Record status', 'text', 'draft / complete'],
  ['created_at', 'Record created (UTC)', 'datetime', ''],
  ['updated_at', 'Record last edited (UTC)', 'datetime', ''],
];
const typeName = { text: 'text', tel: 'text', textarea: 'text', number: 'number', date: 'date (YYYY-MM-DD)', datetime: 'date-time (YYYY-MM-DDTHH:MM)', radio: 'category', select: 'category', computed: 'auto-calculated' };

let out = '# Data dictionary — CS Audit in Primigravida, NMCH Patna\n\n';
out += 'One row per case in the CSV export and the Google Sheet. Category variables are exported as their **labels**. ';
out += 'For multi-select questions each option is a separate **0/1** column (`1` = present, `0` = absent, blank = question not answered). ';
out += 'Fields that do not apply (e.g. Apgar for a stillbirth) are blank. *Auto* columns are calculated by the app.\n\n';
out += '| Column | Description | Type | Values / unit |\n|---|---|---|---|\n';
const row = (c, d, t, v) => { out += `| \`${c}\` | ${d} | ${t} | ${String(v).replace(/\|/g, '/')} |\n`; };
meta.forEach((m) => row(...m));

for (const s of Schema.SECTIONS) {
  out += `| **${s.title}** | | | |\n`;
  for (const f of s.fields) {
    if (f.id === 'study_id') continue;
    if (f.type === 'multi') {
      for (const [code, label] of f.options) row(`${f.id}_${code}`, `${f.label}: ${label}`, '0/1', '');
      continue;
    }
    let vals = f.options ? f.options.map((o) => o[1]).join('; ') : '';
    if (f.type === 'number') vals = `${f.min}–${f.max}${f.unit ? ' ' + f.unit : ''}`;
    if (f.type === 'computed' && f.unit) vals = f.unit;
    row(f.id, f.label + (f.req ? ' (required)' : ''), typeName[f.type], vals);
  }
}

out += '\n## Calculation rules for auto columns\n\n';
out += '- **eligibility**: Included if primigravida, singleton, GA ≥ 28 wk, CS at NMCH, records complete = Yes and non-obstetric hysterectomy = No; otherwise Excluded.\n';
out += '- **elderly_primi**: age ≥ 35 years.\n- **bmi**: weight (kg) / height (m)².\n';
out += '- **anaemia_grade** (WHO, pregnancy): Hb ≥ 11 None; 10–10.9 Mild; 7–9.9 Moderate; < 7 Severe.\n';
out += '- **robson** (nulliparous singleton): transverse/oblique lie → 9; breech → 6; cephalic < 37 wk → 10; cephalic ≥ 37 wk with spontaneous labour → 1, induced → 2a, CS before labour → 2b. Groups 3, 4, 5, 7, 8 cannot occur in this study population.\n';
out += '- **dii_min**: skin incision − decision (minutes). **ddi_min**: birth − decision (minutes).\n';
out += '- **stay_days**: discharge date − admission date. **postop_days**: discharge date − date of birth.\n';
out += '- **bw_cat**: < 1000 ELBW; 1000–1499 VLBW; 1500–2499 LBW; 2500–3999 Normal; ≥ 4000 Macrosomia.\n';
out += '- **perinatal_death**: stillbirth (fresh or macerated) or early neonatal death (≤ 7 days).\n';

fs.writeFileSync(path.join(__dirname, '..', 'DATA_DICTIONARY.md'), out);
console.log('Wrote DATA_DICTIONARY.md with', Schema.columns().length, 'columns');
