/* Derived (auto-calculated) variables. Shared by the app and the Node tests. */
(function (root) {
  'use strict';

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // Gestational age in decimal weeks (weeks + days/7)
  function gaWeeks(r) {
    const w = num(r.ga_weeks);
    if (w === null) return null;
    const d = num(r.ga_days) || 0;
    return w + d / 7;
  }

  /*
   * Robson Ten-Group Classification.
   * Every woman in this study is a primigravida with a singleton pregnancy,
   * i.e. nulliparous with no previous uterine scar, so only groups
   * 1, 2a, 2b, 6, 9 and 10 are possible (3, 4, 5, 7 need parity; 8 needs multiple pregnancy).
   */
  function robson(r) {
    const lie = r.presentation;
    if (lie === 'transverse') return '9';
    if (lie === 'breech') return '6';
    if (lie !== 'cephalic') return '';
    const ga = gaWeeks(r);
    if (ga === null) return '';
    if (ga < 37) return '10';
    if (r.labour_onset === 'spontaneous') return '1';
    if (r.labour_onset === 'induced') return '2a';
    if (r.labour_onset === 'prelabour') return '2b';
    return '';
  }

  const ROBSON_LABELS = {
    '1': 'G1: Nullipara, singleton cephalic, ≥37 wk, spontaneous labour',
    '2a': 'G2a: Nullipara, singleton cephalic, ≥37 wk, induced labour',
    '2b': 'G2b: Nullipara, singleton cephalic, ≥37 wk, CS before labour',
    '6': 'G6: Nullipara, singleton breech',
    '9': 'G9: Singleton transverse/oblique lie',
    '10': 'G10: Singleton cephalic, <37 wk',
  };

  // Minutes between two datetime-local strings ("2025-06-01T10:30")
  function minutesBetween(a, b) {
    if (!a || !b) return null;
    const ta = Date.parse(a), tb = Date.parse(b);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
    return Math.round((tb - ta) / 60000);
  }

  // Whole days between two dates ("2025-06-01" or datetime strings)
  function daysBetween(a, b) {
    if (!a || !b) return null;
    const da = Date.parse(String(a).slice(0, 10) + 'T00:00:00Z');
    const db = Date.parse(String(b).slice(0, 10) + 'T00:00:00Z');
    if (Number.isNaN(da) || Number.isNaN(db)) return null;
    return Math.round((db - da) / 86400000);
  }

  function bmi(r) {
    const h = num(r.height_cm), w = num(r.weight_kg);
    if (!h || !w) return null;
    return Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
  }

  // WHO anaemia in pregnancy (g/dL)
  function anaemiaGrade(r) {
    const hb = num(r.hb);
    if (hb === null) return '';
    if (hb < 7) return 'Severe';
    if (hb < 10) return 'Moderate';
    if (hb < 11) return 'Mild';
    return 'None';
  }

  function bwCategory(r) {
    const bw = num(r.bw);
    if (bw === null) return '';
    if (bw < 1000) return 'ELBW (<1000 g)';
    if (bw < 1500) return 'VLBW (1000-1499 g)';
    if (bw < 2500) return 'LBW (1500-2499 g)';
    if (bw < 4000) return 'Normal (2500-3999 g)';
    return 'Macrosomia (≥4000 g)';
  }

  function elderly(r) {
    const a = num(r.age);
    if (a === null) return '';
    return a >= 35 ? 'Yes' : 'No';
  }

  // Eligible only if every inclusion check is "yes" and the exclusion check is "no"
  function eligibility(r) {
    const inc = ['el_primi', 'el_singleton', 'el_ga28', 'el_nmch', 'el_records'];
    const vals = inc.map((k) => r[k]).concat([r.el_hyst]);
    if (vals.some((v) => !v)) return '';
    if (inc.every((k) => r[k] === 'yes') && r.el_hyst === 'no') return 'Included';
    return 'Excluded';
  }

  function perinatalDeath(r) {
    if (!r.birth_status && !r.neo_outcome) return '';
    if (r.birth_status === 'fsb' || r.birth_status === 'msb') return 'Yes';
    if (r.neo_outcome === 'end') return 'Yes';
    if (!r.neo_outcome) return '';
    return 'No';
  }

  function nonNeg(v) { return v === null ? '' : v; }

  // All computed fields, keyed by the schema ids of type "computed"
  function deriveAll(r) {
    const rb = robson(r);
    return {
      eligibility: eligibility(r),
      elderly_primi: elderly(r),
      bmi: nonNeg(bmi(r)),
      anaemia_grade: anaemiaGrade(r),
      ga_decimal: gaWeeks(r) === null ? '' : Math.round(gaWeeks(r) * 10) / 10,
      robson: rb,
      robson_label: rb ? ROBSON_LABELS[rb] : '',
      ddi_min: nonNeg(minutesBetween(r.decision_dt, r.birth_dt)),
      dii_min: nonNeg(minutesBetween(r.decision_dt, r.incision_dt)),
      stay_days: nonNeg(daysBetween(r.adm_date, r.discharge_date)),
      postop_days: nonNeg(daysBetween(r.birth_dt, r.discharge_date)),
      bw_cat: bwCategory(r),
      perinatal_death: perinatalDeath(r),
    };
  }

  const api = { num, gaWeeks, robson, ROBSON_LABELS, minutesBetween, daysBetween, bmi, anaemiaGrade, bwCategory, elderly, eligibility, perinatalDeath, deriveAll };
  root.Derive = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
