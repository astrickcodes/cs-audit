/*
 * Single source of truth for the data-collection proforma.
 * Each field: { id, label, type, options?, min?, max?, step?, unit?, req?, show?, hint? }
 *   type: text | tel | number | date | datetime | radio | select | multi | textarea | computed
 *   req:  true or fn(record) -> required before the case can be marked "Complete"
 *   show: fn(record) -> whether the field is visible (hidden fields are not required)
 * Field ids are the CSV / Google Sheet column names. Do not rename them once data collection starts.
 */
(function (root) {
  'use strict';

  const YN = [['yes', 'Yes'], ['no', 'No']];
  const YNNA = [['yes', 'Yes'], ['no', 'No'], ['na', 'Not applicable']];
  const has = (r, id, code) => Array.isArray(r[id]) && r[id].includes(code);
  const live = (r) => r.birth_status !== 'fsb' && r.birth_status !== 'msb';

  const INDICATIONS = [
    ['fetal_distress', 'Fetal distress / non-reassuring FHR'],
    ['nop', 'Non-progress of labour / arrest of dilatation'],
    ['arrest_descent', 'Arrest of descent / prolonged 2nd stage'],
    ['cpd', 'Cephalopelvic disproportion (CPD)'],
    ['obstructed', 'Obstructed labour'],
    ['failed_ind', 'Failed induction'],
    ['breech', 'Breech presentation'],
    ['malpresentation', 'Transverse / oblique lie, other malpresentation'],
    ['severe_pe', 'Severe preeclampsia / eclampsia'],
    ['aph', 'APH (placenta previa / abruption)'],
    ['cord_prolapse', 'Cord prolapse'],
    ['macrosomia', 'Suspected macrosomia'],
    ['oligo', 'Oligohydramnios'],
    ['fgr', 'FGR with abnormal Doppler'],
    ['postdated', 'Post-dated with unfavourable cervix'],
    ['mec', 'Meconium-stained liquor'],
    ['elderly_precious', 'Elderly primi / precious pregnancy'],
    ['med_disorder', 'Maternal medical disorder'],
    ['maternal_request', 'Maternal request (no medical indication)'],
    ['other', 'Other'],
  ];

  const SECTIONS = [
    {
      id: 'ident', title: '1. Identification & eligibility',
      fields: [
        { id: 'study_id', label: 'Study ID', type: 'text', readonly: true },
        { id: 'name', label: 'Patient name', type: 'text', req: true },
        { id: 'phone', label: 'Phone number', type: 'tel' },
        { id: 'reg_no', label: 'Hospital Reg. / IPD no.', type: 'text', req: true },
        { id: 'adm_date', label: 'Date of admission', type: 'date', req: true },
        { id: 'booking', label: 'Booking status', type: 'radio', options: [['booked', 'Booked'], ['unbooked', 'Unbooked'], ['referred', 'Referred in']] },
        { id: 'residence', label: 'Residence', type: 'radio', options: [['rural', 'Rural'], ['urban', 'Urban']] },
        { id: 'ses', label: 'Socio-economic class (Modified Kuppuswamy)', type: 'select', options: [['upper', 'Upper'], ['upper_middle', 'Upper middle'], ['lower_middle', 'Lower middle'], ['upper_lower', 'Upper lower'], ['lower', 'Lower']] },
        { id: 'education', label: 'Education', type: 'select', options: [['illiterate', 'Illiterate'], ['primary', 'Primary'], ['secondary', 'Secondary'], ['higher_secondary', 'Higher secondary'], ['graduate', 'Graduate & above']] },
        { id: 'el_primi', label: 'Primigravida?', type: 'radio', options: YN, req: 'always' },
        { id: 'el_singleton', label: 'Singleton pregnancy?', type: 'radio', options: YN, req: 'always' },
        { id: 'el_ga28', label: 'Gestational age ≥ 28 weeks?', type: 'radio', options: YN, req: 'always' },
        { id: 'el_nmch', label: 'CS performed at NMCH?', type: 'radio', options: YN, req: 'always' },
        { id: 'el_records', label: 'Records complete / available?', type: 'radio', options: YN, req: 'always' },
        { id: 'el_hyst', label: 'Hysterectomy for non-obstetric cause?', type: 'radio', options: YN, req: 'always' },
        { id: 'eligibility', label: 'Eligibility', type: 'computed' },
        { id: 'excl_reason', label: 'Reason for exclusion', type: 'textarea', show: (r) => Derive.eligibility(r) === 'Excluded', req: 'always' },
      ],
    },
    {
      id: 'maternal', title: '2. Maternal profile',
      fields: [
        { id: 'age', label: 'Age', type: 'number', unit: 'years', min: 12, max: 55, req: true },
        { id: 'elderly_primi', label: 'Elderly primigravida (≥35 y)', type: 'computed' },
        { id: 'height_cm', label: 'Height', type: 'number', unit: 'cm', min: 120, max: 200 },
        { id: 'weight_kg', label: 'Weight', type: 'number', unit: 'kg', min: 30, max: 150, step: 0.1 },
        { id: 'bmi', label: 'BMI', type: 'computed', unit: 'kg/m²' },
        { id: 'hb', label: 'Haemoglobin (pre-op)', type: 'number', unit: 'g/dL', min: 3, max: 18, step: 0.1 },
        { id: 'anaemia_grade', label: 'Anaemia grade (WHO)', type: 'computed' },
        { id: 'anc_visits', label: 'Number of ANC visits', type: 'number', min: 0, max: 30 },
      ],
    },
    {
      id: 'obstetric', title: '3. Obstetric details & Robson',
      fields: [
        { id: 'ga_method', label: 'GA assessed by', type: 'radio', options: [['lmp', 'LMP'], ['usg', 'Early USG'], ['clinical', 'Clinical']] },
        { id: 'ga_weeks', label: 'Gestational age — weeks', type: 'number', unit: 'wk', min: 28, max: 44, req: true },
        { id: 'ga_days', label: 'Gestational age — days', type: 'number', unit: 'd', min: 0, max: 6 },
        { id: 'presentation', label: 'Fetal presentation / lie', type: 'radio', options: [['cephalic', 'Cephalic'], ['breech', 'Breech'], ['transverse', 'Transverse / oblique']], req: true },
        { id: 'labour_onset', label: 'Onset of labour', type: 'radio', options: [['spontaneous', 'Spontaneous'], ['induced', 'Induced'], ['prelabour', 'CS before labour']], req: true },
        { id: 'induction_method', label: 'Induction method', type: 'multi', options: [['pge2', 'PGE2 gel'], ['miso', 'Misoprostol'], ['foley', 'Foley catheter'], ['arm', 'ARM'], ['oxytocin', 'Oxytocin']], show: (r) => r.labour_onset === 'induced' },
        { id: 'induction_reason', label: 'Indication for induction', type: 'text', show: (r) => r.labour_onset === 'induced' },
        { id: 'bishop', label: 'Bishop score before induction', type: 'number', min: 0, max: 13, show: (r) => r.labour_onset === 'induced' },
        { id: 'membranes', label: 'Membranes at decision', type: 'radio', options: [['intact', 'Intact'], ['ruptured', 'Ruptured']] },
        { id: 'liquor', label: 'Liquor', type: 'radio', options: [['clear', 'Clear'], ['mec', 'Meconium-stained'], ['blood', 'Blood-stained'], ['na', 'N/A']] },
        { id: 'cx_dilatation', label: 'Cervical dilatation at decision', type: 'number', unit: 'cm', min: 0, max: 10, show: (r) => r.labour_onset !== 'prelabour' },
        { id: 'ga_decimal', label: 'GA (decimal weeks)', type: 'computed' },
        { id: 'robson', label: 'Robson group', type: 'computed' },
        { id: 'robson_label', label: 'Robson description', type: 'computed' },
      ],
    },
    {
      id: 'antenatal', title: '4. Antenatal complications',
      fields: [
        {
          id: 'ac', label: 'Antenatal complications (select all)', type: 'multi', req: true, exclusive: 'none',
          options: [['none', 'None'], ['ghtn', 'Gestational hypertension'], ['pe', 'Preeclampsia'], ['severe_pe', 'Severe preeclampsia'], ['eclampsia', 'Eclampsia'], ['anaemia', 'Anaemia'], ['gdm', 'GDM'], ['hypothyroid', 'Hypothyroidism'], ['previa', 'Placenta previa'], ['abruption', 'Abruptio placentae'], ['prom', 'PROM'], ['pprom', 'PPROM'], ['oligo', 'Oligohydramnios'], ['poly', 'Polyhydramnios'], ['fgr', 'FGR'], ['postdated', 'Post-dated (>40 wk)'], ['rh_neg', 'Rh-negative'], ['heart', 'Heart disease'], ['other', 'Other']],
        },
        { id: 'ac_specify', label: 'Other complication (specify)', type: 'text', show: (r) => has(r, 'ac', 'other') },
      ],
    },
    {
      id: 'cs', title: '5. Caesarean details & indication',
      fields: [
        { id: 'cs_type', label: 'Type of CS', type: 'radio', options: [['elective', 'Elective'], ['emergency', 'Emergency']], req: true },
        { id: 'urgency', label: 'Urgency category (NICE / Lucas)', type: 'select', options: [['1', '1 — Immediate threat to life of mother/fetus'], ['2', '2 — Compromise, not immediately life-threatening'], ['3', '3 — Needs early delivery, no compromise'], ['4', '4 — Delivery at time to suit woman & staff']] },
        { id: 'ind_primary', label: 'Primary indication', type: 'select', options: INDICATIONS, req: true },
        { id: 'ind_secondary', label: 'Additional indications', type: 'multi', options: INDICATIONS },
        { id: 'ind_other', label: 'Other indication (specify)', type: 'text', show: (r) => r.ind_primary === 'other' || has(r, 'ind_secondary', 'other') },
        { id: 'decision_dt', label: 'Date & time of decision for CS', type: 'datetime' },
        { id: 'incision_dt', label: 'Date & time of skin incision', type: 'datetime' },
        { id: 'dii_min', label: 'Decision-to-incision interval', type: 'computed', unit: 'min' },
        { id: 'ddi_min', label: 'Decision-to-delivery interval (uses time of birth, section 9)', type: 'computed', unit: 'min' },
        { id: 'anaesthesia', label: 'Anaesthesia', type: 'radio', options: [['spinal', 'Spinal'], ['epidural', 'Epidural'], ['cse', 'Combined spinal-epidural'], ['ga', 'General']] },
        { id: 'surgeon', label: 'Operating surgeon', type: 'radio', options: [['consultant', 'Consultant / faculty'], ['sr', 'Senior resident'], ['pg', 'PG resident']] },
        { id: 'uterine_incision', label: 'Uterine incision', type: 'radio', options: [['lscs', 'Lower segment transverse'], ['classical', 'Classical / vertical'], ['other', 'Other']] },
      ],
    },
    {
      id: 'audit', title: '6. Audit — appropriateness',
      fields: [
        { id: 'aud_documented', label: 'Indication clearly documented in case sheet?', type: 'radio', options: YN, req: true },
        { id: 'aud_partograph', label: 'Partograph used / correctly plotted?', type: 'radio', options: YNNA, req: true },
        { id: 'aud_ctg', label: 'Fetal distress confirmed (CTG / repeated auscultation / Doppler)?', type: 'radio', options: YNNA, show: (r) => r.ind_primary === 'fetal_distress' || has(r, 'ind_secondary', 'fetal_distress') },
        { id: 'aud_tol', label: 'Adequate trial of labour given?', type: 'radio', options: YNNA, req: true },
        { id: 'aud_ecv', label: 'ECV offered / considered for breech?', type: 'radio', options: YNNA, show: (r) => r.presentation === 'breech' },
        { id: 'aud_bishop', label: 'Bishop score assessed & ripening used before induction?', type: 'radio', options: YNNA, show: (r) => r.labour_onset === 'induced' },
        { id: 'aud_senior', label: 'Decision reviewed by senior / consultant?', type: 'radio', options: YN, req: true },
        { id: 'aud_consent', label: 'Informed written consent taken?', type: 'radio', options: YN },
        { id: 'aud_criteria', label: 'Indication meets standard criteria (WHO / FOGSI / NICE)?', type: 'radio', options: [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']], req: true },
        { id: 'aud_verdict', label: 'Overall audit verdict', type: 'radio', options: [['justified', 'Justified'], ['doubtful', 'Doubtful'], ['not_justified', 'Not justified']], req: true },
        { id: 'aud_avoidable', label: 'Was this CS potentially avoidable?', type: 'radio', options: YN, req: true },
        {
          id: 'mod', label: 'Modifiable factors (select all)', type: 'multi', exclusive: 'none', req: true,
          options: [['none', 'None identified'], ['no_tol', 'No / inadequate trial of labour'], ['no_ecv', 'ECV not offered for breech'], ['unfav_ind', 'Induction with unfavourable cervix'], ['fd_unconfirmed', 'Fetal distress not confirmed'], ['no_partograph', 'Partograph not used'], ['maternal_request', 'Maternal / family request'], ['no_senior', 'No senior review'], ['late_referral', 'Late referral'], ['poor_anc', 'Inadequate ANC'], ['resources', 'Lack of resources (CTG, staff, OT)'], ['litigation', 'Fear of litigation / defensive practice'], ['other', 'Other']],
        },
        { id: 'mod_specify', label: 'Other modifiable factor (specify)', type: 'text', show: (r) => has(r, 'mod', 'other') },
        { id: 'aud_notes', label: 'Audit notes', type: 'textarea' },
      ],
    },
    {
      id: 'intraop', title: '7. Intra-operative',
      fields: [
        {
          id: 'io', label: 'Intra-operative complications (select all)', type: 'multi', exclusive: 'none', req: true,
          options: [['none', 'None'], ['pph', 'PPH'], ['atony', 'Uterine atony'], ['extension', 'Extension of uterine incision'], ['deep_head', 'Difficult delivery of deeply engaged head'], ['bladder', 'Bladder injury'], ['bowel', 'Bowel injury'], ['hysterectomy', 'Caesarean hysterectomy'], ['anaes', 'Anaesthetic complication'], ['other', 'Other']],
        },
        { id: 'io_specify', label: 'Other (specify)', type: 'text', show: (r) => has(r, 'io', 'other') },
        { id: 'ebl', label: 'Estimated blood loss', type: 'number', unit: 'mL', min: 0, max: 5000 },
        { id: 'transfusion', label: 'Blood transfusion?', type: 'radio', options: YN },
        { id: 'transfusion_units', label: 'Units transfused', type: 'number', min: 1, max: 20, show: (r) => r.transfusion === 'yes' },
      ],
    },
    {
      id: 'postop', title: '8. Post-operative & discharge',
      fields: [
        {
          id: 'po', label: 'Post-operative complications (select all)', type: 'multi', exclusive: 'none', req: true,
          options: [['none', 'None'], ['fever', 'Fever'], ['wound_infection', 'Wound infection'], ['wound_gaping', 'Wound gaping / dehiscence'], ['uti', 'UTI'], ['sec_pph', 'Secondary PPH'], ['ileus', 'Paralytic ileus'], ['sepsis', 'Puerperal sepsis'], ['dvt', 'DVT / thromboembolism'], ['relaparotomy', 'Re-laparotomy'], ['icu', 'ICU admission'], ['other', 'Other']],
        },
        { id: 'po_specify', label: 'Other (specify)', type: 'text', show: (r) => has(r, 'po', 'other') },
        { id: 'recovery', label: 'Post-operative recovery', type: 'radio', options: [['uneventful', 'Uneventful'], ['complicated', 'Complicated']], req: true },
        { id: 'ambulation_hr', label: 'Time to ambulation', type: 'number', unit: 'hours', min: 0, max: 240 },
        { id: 'discharge_date', label: 'Date of discharge / death', type: 'date', req: true },
        { id: 'stay_days', label: 'Total hospital stay', type: 'computed', unit: 'days' },
        { id: 'postop_days', label: 'Post-operative stay', type: 'computed', unit: 'days' },
        { id: 'mat_outcome', label: 'Maternal outcome', type: 'radio', options: [['well', 'Discharged well'], ['morbidity', 'Discharged with morbidity'], ['lama', 'LAMA'], ['referred', 'Referred out'], ['death', 'Maternal death']], req: true },
        { id: 'mat_death_cause', label: 'Cause of maternal death', type: 'text', show: (r) => r.mat_outcome === 'death', req: true },
      ],
    },
    {
      id: 'neonatal', title: '9. Neonatal',
      fields: [
        { id: 'birth_dt', label: 'Date & time of birth', type: 'datetime', req: true },
        { id: 'sex', label: 'Sex', type: 'radio', options: [['m', 'Male'], ['f', 'Female'], ['amb', 'Ambiguous']] },
        { id: 'birth_status', label: 'Birth status', type: 'radio', options: [['live', 'Live birth'], ['fsb', 'Fresh stillbirth'], ['msb', 'Macerated stillbirth']], req: true },
        { id: 'bw', label: 'Birth weight', type: 'number', unit: 'g', min: 400, max: 6000, req: true },
        { id: 'bw_cat', label: 'Birth-weight category', type: 'computed' },
        { id: 'apgar1', label: 'Apgar at 1 min', type: 'number', min: 0, max: 10, req: true, show: live },
        { id: 'apgar5', label: 'Apgar at 5 min', type: 'number', min: 0, max: 10, req: true, show: live },
        { id: 'resus', label: 'Resuscitation required?', type: 'radio', options: YN, show: live },
        { id: 'nicu', label: 'NICU admission?', type: 'radio', options: YN, req: true, show: live },
        { id: 'nicu_reason', label: 'Reason for NICU admission', type: 'text', show: (r) => live(r) && r.nicu === 'yes' },
        { id: 'nicu_days', label: 'NICU stay', type: 'number', unit: 'days', min: 0, max: 120, show: (r) => live(r) && r.nicu === 'yes' },
        {
          id: 'nc', label: 'Neonatal complications (select all)', type: 'multi', exclusive: 'none', req: true, show: live,
          options: [['none', 'None'], ['rds', 'Respiratory distress (RDS)'], ['ttn', 'Transient tachypnoea (TTN)'], ['asphyxia', 'Birth asphyxia'], ['hie', 'HIE'], ['sepsis', 'Sepsis'], ['jaundice', 'Neonatal jaundice'], ['hypoglycaemia', 'Hypoglycaemia'], ['mas', 'Meconium aspiration (MAS)'], ['prematurity', 'Prematurity complications'], ['congenital', 'Congenital anomaly'], ['other', 'Other']],
        },
        { id: 'nc_specify', label: 'Other (specify)', type: 'text', show: (r) => has(r, 'nc', 'other') },
        { id: 'bf_1hr', label: 'Breastfeeding initiated within 1 hour?', type: 'radio', options: YN, req: true, show: live },
        { id: 'bf_hr', label: 'If not, time to first breastfeed', type: 'number', unit: 'hours', min: 0, max: 168, show: (r) => live(r) && r.bf_1hr === 'no' },
        { id: 'neo_outcome', label: 'Neonatal outcome', type: 'radio', options: [['discharged', 'Discharged alive'], ['end', 'Early neonatal death (≤7 days)'], ['lnd', 'Late neonatal death (>7 days)'], ['referred', 'Referred out'], ['lama', 'LAMA'], ['stillbirth', 'Stillbirth']], req: true },
        { id: 'neo_death_cause', label: 'Cause of neonatal death', type: 'text', show: (r) => r.neo_outcome === 'end' || r.neo_outcome === 'lnd' },
        { id: 'perinatal_death', label: 'Perinatal death', type: 'computed' },
      ],
    },
    {
      id: 'remarks', title: '10. Remarks',
      fields: [{ id: 'remarks', label: 'Remarks', type: 'textarea' }],
    },
  ];

  const FIELDS = SECTIONS.flatMap((s) => s.fields.map((f) => Object.assign({ section: s.id }, f)));
  const FIELD_BY_ID = Object.fromEntries(FIELDS.map((f) => [f.id, f]));

  function isVisible(f, r) { return !f.show || f.show(r); }

  function isEmpty(v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0); }

  /*
   * Returns { errors: [{id, msg}], missing: [{id, label}] }.
   * errors  = invalid values (block saving as Complete, shown in red)
   * missing = required-but-empty fields for completion
   */
  function validate(r) {
    const errors = [], missing = [];
    const excluded = Derive.eligibility(r) === 'Excluded';
    for (const f of FIELDS) {
      if (f.type === 'computed' || !isVisible(f, r)) continue;
      const v = r[f.id];
      if (f.type === 'number' && !isEmpty(v)) {
        const n = Number(v);
        if (!Number.isFinite(n)) errors.push({ id: f.id, msg: 'Not a number' });
        else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) errors.push({ id: f.id, msg: `Must be between ${f.min} and ${f.max}` });
      }
      if (f.type === 'tel' && !isEmpty(v) && !/^[+\d][\d\s-]{6,15}$/.test(String(v))) errors.push({ id: f.id, msg: 'Check phone number' });
      const needed = f.req === 'always' || (f.req === true && !excluded);
      if (needed && isEmpty(v)) missing.push({ id: f.id, label: f.label });
    }
    if (!excluded) {
      const dii = Derive.minutesBetween(r.decision_dt, r.incision_dt);
      if (dii !== null && dii < 0) errors.push({ id: 'incision_dt', msg: 'Incision is before decision time' });
      const ddi = Derive.minutesBetween(r.decision_dt, r.birth_dt);
      if (ddi !== null && ddi < 0) errors.push({ id: 'birth_dt', msg: 'Birth is before decision time' });
      const stay = Derive.daysBetween(r.adm_date, r.discharge_date);
      if (stay !== null && stay < 0) errors.push({ id: 'discharge_date', msg: 'Discharge is before admission' });
      const bdays = Derive.daysBetween(r.adm_date, r.birth_dt);
      if (bdays !== null && bdays < 0) errors.push({ id: 'birth_dt', msg: 'Birth is before admission' });
      if (r.neo_outcome === 'stillbirth' && r.birth_status === 'live') errors.push({ id: 'neo_outcome', msg: 'Outcome "Stillbirth" but birth status is live' });
      if ((r.birth_status === 'fsb' || r.birth_status === 'msb') && r.neo_outcome && r.neo_outcome !== 'stillbirth') errors.push({ id: 'neo_outcome', msg: 'Birth status is stillbirth — outcome should be Stillbirth' });
    }
    return { errors, missing };
  }

  /* Soft warnings: plausible but unusual values worth double-checking. */
  function warnings(r) {
    const w = [];
    const ddi = Derive.minutesBetween(r.decision_dt, r.birth_dt);
    if (r.urgency === '1' && ddi !== null && ddi > 30) w.push(`Category 1 CS with DDI ${ddi} min (> 30 min standard)`);
    if (r.urgency === '2' && ddi !== null && ddi > 75) w.push(`Category 2 CS with DDI ${ddi} min (> 75 min standard)`);
    if (r.cs_type === 'elective' && r.labour_onset === 'spontaneous') w.push('Elective CS but labour onset is spontaneous — check');
    if (r.ind_primary === 'breech' && r.presentation && r.presentation !== 'breech') w.push('Indication breech but presentation is not breech');
    if (r.ind_primary === 'failed_ind' && r.labour_onset !== 'induced') w.push('Indication failed induction but labour was not induced');
    if (r.apgar5 !== undefined && r.apgar5 !== '' && r.apgar1 !== '' && Number(r.apgar5) < Number(r.apgar1)) w.push('Apgar at 5 min is lower than at 1 min');
    if (Derive.gaWeeks(r) !== null && Derive.gaWeeks(r) < 28) w.push('GA < 28 weeks — not eligible');
    return w;
  }

  /* Stored UTC ISO timestamp → "YYYY-MM-DD HH:MM:SS" in IST (UTC+5:30, no daylight saving). */
  function toIST(iso) {
    const t = Date.parse(iso || '');
    if (Number.isNaN(t)) return iso || '';
    return new Date(t + 330 * 60000).toISOString().slice(0, 19).replace('T', ' ');
  }

  /* Flatten one record into CSV/Sheet columns (labels for single choice, 0/1 per option for multi). */
  function flatten(r) {
    const d = Derive.deriveAll(r);
    const row = {
      study_id: r.study_id,
      status: r.status || 'draft',
      created_at: toIST(r.createdAt),
      updated_at: toIST(r.updatedAt),
    };
    for (const f of FIELDS) {
      if (f.id === 'study_id') continue;
      if (f.type === 'computed') { row[f.id] = d[f.id] === undefined ? '' : d[f.id]; continue; }
      // Values left in fields that are now hidden (e.g. induction method after onset changed) are not exported
      const v = isVisible(f, r) ? r[f.id] : undefined;
      if (f.type === 'multi') {
        const arr = Array.isArray(v) ? v : [];
        for (const [code] of f.options) row[`${f.id}_${code}`] = arr.length ? (arr.includes(code) ? 1 : 0) : '';
      } else if (f.options) {
        const opt = f.options.find((o) => o[0] === v);
        row[f.id] = opt ? opt[1] : (v || '');
      } else {
        row[f.id] = isEmpty(v) ? '' : v;
      }
    }
    return row;
  }

  function columns() {
    const cols = ['study_id', 'status', 'created_at', 'updated_at'];
    for (const f of FIELDS) {
      if (f.id === 'study_id') continue;
      if (f.type === 'multi') for (const [code] of f.options) cols.push(`${f.id}_${code}`);
      else cols.push(f.id);
    }
    return cols;
  }

  const api = { SECTIONS, FIELDS, FIELD_BY_ID, INDICATIONS, isVisible, isEmpty, validate, warnings, flatten, columns, toIST };
  root.Schema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
