# Data dictionary — CS Audit in Primigravida, NMCH Patna

One row per case in the CSV export and the Google Sheet. Category variables are exported as their **labels**. For multi-select questions each option is a separate **0/1** column (`1` = present, `0` = absent, blank = question not answered). Fields that do not apply (e.g. Apgar for a stillbirth) are blank. *Auto* columns are calculated by the app.

| Column | Description | Type | Values / unit |
|---|---|---|---|
| `study_id` | Study ID (CS-001 …) | text |  |
| `status` | Record status | text | draft / complete |
| `created_at` | Record created (UTC) | datetime |  |
| `updated_at` | Record last edited (UTC) | datetime |  |
| **1. Identification & eligibility** | | | |
| `name` | Patient name (required) | text |  |
| `phone` | Phone number | text |  |
| `reg_no` | Hospital Reg. / IPD no. (required) | text |  |
| `adm_date` | Date of admission (required) | date (YYYY-MM-DD) |  |
| `booking` | Booking status | category | Booked; Unbooked; Referred in |
| `residence` | Residence | category | Rural; Urban |
| `ses` | Socio-economic class (Modified Kuppuswamy) | category | Upper; Upper middle; Lower middle; Upper lower; Lower |
| `education` | Education | category | Illiterate; Primary; Secondary; Higher secondary; Graduate & above |
| `el_primi` | Primigravida? (required) | category | Yes; No |
| `el_singleton` | Singleton pregnancy? (required) | category | Yes; No |
| `el_ga28` | Gestational age ≥ 28 weeks? (required) | category | Yes; No |
| `el_nmch` | CS performed at NMCH? (required) | category | Yes; No |
| `el_records` | Records complete / available? (required) | category | Yes; No |
| `el_hyst` | Hysterectomy for non-obstetric cause? (required) | category | Yes; No |
| `eligibility` | Eligibility | auto-calculated |  |
| `excl_reason` | Reason for exclusion (required) | text |  |
| **2. Maternal profile** | | | |
| `age` | Age (required) | number | 12–55 years |
| `elderly_primi` | Elderly primigravida (≥35 y) | auto-calculated |  |
| `height_cm` | Height | number | 120–200 cm |
| `weight_kg` | Weight | number | 30–150 kg |
| `bmi` | BMI | auto-calculated | kg/m² |
| `hb` | Haemoglobin (pre-op) | number | 3–18 g/dL |
| `anaemia_grade` | Anaemia grade (WHO) | auto-calculated |  |
| `anc_visits` | Number of ANC visits | number | 0–30 |
| **3. Obstetric details & Robson** | | | |
| `ga_method` | GA assessed by | category | LMP; Early USG; Clinical |
| `ga_weeks` | Gestational age — weeks (required) | number | 28–44 wk |
| `ga_days` | Gestational age — days | number | 0–6 d |
| `presentation` | Fetal presentation / lie (required) | category | Cephalic; Breech; Transverse / oblique |
| `labour_onset` | Onset of labour (required) | category | Spontaneous; Induced; CS before labour |
| `induction_method_pge2` | Induction method: PGE2 gel | 0/1 |  |
| `induction_method_miso` | Induction method: Misoprostol | 0/1 |  |
| `induction_method_foley` | Induction method: Foley catheter | 0/1 |  |
| `induction_method_arm` | Induction method: ARM | 0/1 |  |
| `induction_method_oxytocin` | Induction method: Oxytocin | 0/1 |  |
| `induction_reason` | Indication for induction | text |  |
| `bishop` | Bishop score before induction | number | 0–13 |
| `membranes` | Membranes at decision | category | Intact; Ruptured |
| `liquor` | Liquor | category | Clear; Meconium-stained; Blood-stained; N/A |
| `cx_dilatation` | Cervical dilatation at decision | number | 0–10 cm |
| `ga_decimal` | GA (decimal weeks) | auto-calculated |  |
| `robson` | Robson group | auto-calculated |  |
| `robson_label` | Robson description | auto-calculated |  |
| **4. Antenatal complications** | | | |
| `ac_none` | Antenatal complications (select all): None | 0/1 |  |
| `ac_ghtn` | Antenatal complications (select all): Gestational hypertension | 0/1 |  |
| `ac_pe` | Antenatal complications (select all): Preeclampsia | 0/1 |  |
| `ac_severe_pe` | Antenatal complications (select all): Severe preeclampsia | 0/1 |  |
| `ac_eclampsia` | Antenatal complications (select all): Eclampsia | 0/1 |  |
| `ac_anaemia` | Antenatal complications (select all): Anaemia | 0/1 |  |
| `ac_gdm` | Antenatal complications (select all): GDM | 0/1 |  |
| `ac_hypothyroid` | Antenatal complications (select all): Hypothyroidism | 0/1 |  |
| `ac_previa` | Antenatal complications (select all): Placenta previa | 0/1 |  |
| `ac_abruption` | Antenatal complications (select all): Abruptio placentae | 0/1 |  |
| `ac_prom` | Antenatal complications (select all): PROM | 0/1 |  |
| `ac_pprom` | Antenatal complications (select all): PPROM | 0/1 |  |
| `ac_oligo` | Antenatal complications (select all): Oligohydramnios | 0/1 |  |
| `ac_poly` | Antenatal complications (select all): Polyhydramnios | 0/1 |  |
| `ac_fgr` | Antenatal complications (select all): FGR | 0/1 |  |
| `ac_postdated` | Antenatal complications (select all): Post-dated (>40 wk) | 0/1 |  |
| `ac_rh_neg` | Antenatal complications (select all): Rh-negative | 0/1 |  |
| `ac_heart` | Antenatal complications (select all): Heart disease | 0/1 |  |
| `ac_other` | Antenatal complications (select all): Other | 0/1 |  |
| `ac_specify` | Other complication (specify) | text |  |
| **5. Caesarean details & indication** | | | |
| `cs_type` | Type of CS (required) | category | Elective; Emergency |
| `urgency` | Urgency category (NICE / Lucas) | category | 1 — Immediate threat to life of mother/fetus; 2 — Compromise, not immediately life-threatening; 3 — Needs early delivery, no compromise; 4 — Delivery at time to suit woman & staff |
| `ind_primary` | Primary indication (required) | category | Fetal distress / non-reassuring FHR; Non-progress of labour / arrest of dilatation; Arrest of descent / prolonged 2nd stage; Cephalopelvic disproportion (CPD); Obstructed labour; Failed induction; Breech presentation; Transverse / oblique lie, other malpresentation; Severe preeclampsia / eclampsia; APH (placenta previa / abruption); Cord prolapse; Suspected macrosomia; Oligohydramnios; FGR with abnormal Doppler; Post-dated with unfavourable cervix; Meconium-stained liquor; Elderly primi / precious pregnancy; Maternal medical disorder; Maternal request (no medical indication); Other |
| `ind_secondary_fetal_distress` | Additional indications: Fetal distress / non-reassuring FHR | 0/1 |  |
| `ind_secondary_nop` | Additional indications: Non-progress of labour / arrest of dilatation | 0/1 |  |
| `ind_secondary_arrest_descent` | Additional indications: Arrest of descent / prolonged 2nd stage | 0/1 |  |
| `ind_secondary_cpd` | Additional indications: Cephalopelvic disproportion (CPD) | 0/1 |  |
| `ind_secondary_obstructed` | Additional indications: Obstructed labour | 0/1 |  |
| `ind_secondary_failed_ind` | Additional indications: Failed induction | 0/1 |  |
| `ind_secondary_breech` | Additional indications: Breech presentation | 0/1 |  |
| `ind_secondary_malpresentation` | Additional indications: Transverse / oblique lie, other malpresentation | 0/1 |  |
| `ind_secondary_severe_pe` | Additional indications: Severe preeclampsia / eclampsia | 0/1 |  |
| `ind_secondary_aph` | Additional indications: APH (placenta previa / abruption) | 0/1 |  |
| `ind_secondary_cord_prolapse` | Additional indications: Cord prolapse | 0/1 |  |
| `ind_secondary_macrosomia` | Additional indications: Suspected macrosomia | 0/1 |  |
| `ind_secondary_oligo` | Additional indications: Oligohydramnios | 0/1 |  |
| `ind_secondary_fgr` | Additional indications: FGR with abnormal Doppler | 0/1 |  |
| `ind_secondary_postdated` | Additional indications: Post-dated with unfavourable cervix | 0/1 |  |
| `ind_secondary_mec` | Additional indications: Meconium-stained liquor | 0/1 |  |
| `ind_secondary_elderly_precious` | Additional indications: Elderly primi / precious pregnancy | 0/1 |  |
| `ind_secondary_med_disorder` | Additional indications: Maternal medical disorder | 0/1 |  |
| `ind_secondary_maternal_request` | Additional indications: Maternal request (no medical indication) | 0/1 |  |
| `ind_secondary_other` | Additional indications: Other | 0/1 |  |
| `ind_other` | Other indication (specify) | text |  |
| `decision_dt` | Date & time of decision for CS | date-time (YYYY-MM-DDTHH:MM) |  |
| `incision_dt` | Date & time of skin incision | date-time (YYYY-MM-DDTHH:MM) |  |
| `dii_min` | Decision-to-incision interval | auto-calculated | min |
| `ddi_min` | Decision-to-delivery interval (uses time of birth, section 9) | auto-calculated | min |
| `anaesthesia` | Anaesthesia | category | Spinal; Epidural; Combined spinal-epidural; General |
| `surgeon` | Operating surgeon | category | Consultant / faculty; Senior resident; PG resident |
| `uterine_incision` | Uterine incision | category | Lower segment transverse; Classical / vertical; Other |
| **6. Audit — appropriateness** | | | |
| `aud_documented` | Indication clearly documented in case sheet? (required) | category | Yes; No |
| `aud_partograph` | Partograph used / correctly plotted? (required) | category | Yes; No; Not applicable |
| `aud_ctg` | Fetal distress confirmed (CTG / repeated auscultation / Doppler)? | category | Yes; No; Not applicable |
| `aud_tol` | Adequate trial of labour given? (required) | category | Yes; No; Not applicable |
| `aud_ecv` | ECV offered / considered for breech? | category | Yes; No; Not applicable |
| `aud_bishop` | Bishop score assessed & ripening used before induction? | category | Yes; No; Not applicable |
| `aud_senior` | Decision reviewed by senior / consultant? (required) | category | Yes; No |
| `aud_consent` | Informed written consent taken? | category | Yes; No |
| `aud_criteria` | Indication meets standard criteria (WHO / FOGSI / NICE)? (required) | category | Yes; Partly; No |
| `aud_verdict` | Overall audit verdict (required) | category | Justified; Doubtful; Not justified |
| `aud_avoidable` | Was this CS potentially avoidable? (required) | category | Yes; No |
| `mod_none` | Modifiable factors (select all): None identified | 0/1 |  |
| `mod_no_tol` | Modifiable factors (select all): No / inadequate trial of labour | 0/1 |  |
| `mod_no_ecv` | Modifiable factors (select all): ECV not offered for breech | 0/1 |  |
| `mod_unfav_ind` | Modifiable factors (select all): Induction with unfavourable cervix | 0/1 |  |
| `mod_fd_unconfirmed` | Modifiable factors (select all): Fetal distress not confirmed | 0/1 |  |
| `mod_no_partograph` | Modifiable factors (select all): Partograph not used | 0/1 |  |
| `mod_maternal_request` | Modifiable factors (select all): Maternal / family request | 0/1 |  |
| `mod_no_senior` | Modifiable factors (select all): No senior review | 0/1 |  |
| `mod_late_referral` | Modifiable factors (select all): Late referral | 0/1 |  |
| `mod_poor_anc` | Modifiable factors (select all): Inadequate ANC | 0/1 |  |
| `mod_resources` | Modifiable factors (select all): Lack of resources (CTG, staff, OT) | 0/1 |  |
| `mod_litigation` | Modifiable factors (select all): Fear of litigation / defensive practice | 0/1 |  |
| `mod_other` | Modifiable factors (select all): Other | 0/1 |  |
| `mod_specify` | Other modifiable factor (specify) | text |  |
| `aud_notes` | Audit notes | text |  |
| **7. Intra-operative** | | | |
| `io_none` | Intra-operative complications (select all): None | 0/1 |  |
| `io_pph` | Intra-operative complications (select all): PPH | 0/1 |  |
| `io_atony` | Intra-operative complications (select all): Uterine atony | 0/1 |  |
| `io_extension` | Intra-operative complications (select all): Extension of uterine incision | 0/1 |  |
| `io_deep_head` | Intra-operative complications (select all): Difficult delivery of deeply engaged head | 0/1 |  |
| `io_bladder` | Intra-operative complications (select all): Bladder injury | 0/1 |  |
| `io_bowel` | Intra-operative complications (select all): Bowel injury | 0/1 |  |
| `io_hysterectomy` | Intra-operative complications (select all): Caesarean hysterectomy | 0/1 |  |
| `io_anaes` | Intra-operative complications (select all): Anaesthetic complication | 0/1 |  |
| `io_other` | Intra-operative complications (select all): Other | 0/1 |  |
| `io_specify` | Other (specify) | text |  |
| `ebl` | Estimated blood loss | number | 0–5000 mL |
| `transfusion` | Blood transfusion? | category | Yes; No |
| `transfusion_units` | Units transfused | number | 1–20 |
| **8. Post-operative & discharge** | | | |
| `po_none` | Post-operative complications (select all): None | 0/1 |  |
| `po_fever` | Post-operative complications (select all): Fever | 0/1 |  |
| `po_wound_infection` | Post-operative complications (select all): Wound infection | 0/1 |  |
| `po_wound_gaping` | Post-operative complications (select all): Wound gaping / dehiscence | 0/1 |  |
| `po_uti` | Post-operative complications (select all): UTI | 0/1 |  |
| `po_sec_pph` | Post-operative complications (select all): Secondary PPH | 0/1 |  |
| `po_ileus` | Post-operative complications (select all): Paralytic ileus | 0/1 |  |
| `po_sepsis` | Post-operative complications (select all): Puerperal sepsis | 0/1 |  |
| `po_dvt` | Post-operative complications (select all): DVT / thromboembolism | 0/1 |  |
| `po_relaparotomy` | Post-operative complications (select all): Re-laparotomy | 0/1 |  |
| `po_icu` | Post-operative complications (select all): ICU admission | 0/1 |  |
| `po_other` | Post-operative complications (select all): Other | 0/1 |  |
| `po_specify` | Other (specify) | text |  |
| `recovery` | Post-operative recovery (required) | category | Uneventful; Complicated |
| `ambulation_hr` | Time to ambulation | number | 0–240 hours |
| `discharge_date` | Date of discharge / death (required) | date (YYYY-MM-DD) |  |
| `stay_days` | Total hospital stay | auto-calculated | days |
| `postop_days` | Post-operative stay | auto-calculated | days |
| `mat_outcome` | Maternal outcome (required) | category | Discharged well; Discharged with morbidity; LAMA; Referred out; Maternal death |
| `mat_death_cause` | Cause of maternal death (required) | text |  |
| **9. Neonatal** | | | |
| `birth_dt` | Date & time of birth (required) | date-time (YYYY-MM-DDTHH:MM) |  |
| `sex` | Sex | category | Male; Female; Ambiguous |
| `birth_status` | Birth status (required) | category | Live birth; Fresh stillbirth; Macerated stillbirth |
| `bw` | Birth weight (required) | number | 400–6000 g |
| `bw_cat` | Birth-weight category | auto-calculated |  |
| `apgar1` | Apgar at 1 min (required) | number | 0–10 |
| `apgar5` | Apgar at 5 min (required) | number | 0–10 |
| `resus` | Resuscitation required? | category | Yes; No |
| `nicu` | NICU admission? (required) | category | Yes; No |
| `nicu_reason` | Reason for NICU admission | text |  |
| `nicu_days` | NICU stay | number | 0–120 days |
| `nc_none` | Neonatal complications (select all): None | 0/1 |  |
| `nc_rds` | Neonatal complications (select all): Respiratory distress (RDS) | 0/1 |  |
| `nc_ttn` | Neonatal complications (select all): Transient tachypnoea (TTN) | 0/1 |  |
| `nc_asphyxia` | Neonatal complications (select all): Birth asphyxia | 0/1 |  |
| `nc_hie` | Neonatal complications (select all): HIE | 0/1 |  |
| `nc_sepsis` | Neonatal complications (select all): Sepsis | 0/1 |  |
| `nc_jaundice` | Neonatal complications (select all): Neonatal jaundice | 0/1 |  |
| `nc_hypoglycaemia` | Neonatal complications (select all): Hypoglycaemia | 0/1 |  |
| `nc_mas` | Neonatal complications (select all): Meconium aspiration (MAS) | 0/1 |  |
| `nc_prematurity` | Neonatal complications (select all): Prematurity complications | 0/1 |  |
| `nc_congenital` | Neonatal complications (select all): Congenital anomaly | 0/1 |  |
| `nc_other` | Neonatal complications (select all): Other | 0/1 |  |
| `nc_specify` | Other (specify) | text |  |
| `bf_1hr` | Breastfeeding initiated within 1 hour? (required) | category | Yes; No |
| `bf_hr` | If not, time to first breastfeed | number | 0–168 hours |
| `neo_outcome` | Neonatal outcome (required) | category | Discharged alive; Early neonatal death (≤7 days); Late neonatal death (>7 days); Referred out; LAMA; Stillbirth |
| `neo_death_cause` | Cause of neonatal death | text |  |
| `perinatal_death` | Perinatal death | auto-calculated |  |
| **10. Remarks** | | | |
| `remarks` | Remarks | text |  |

## Calculation rules for auto columns

- **eligibility**: Included if primigravida, singleton, GA ≥ 28 wk, CS at NMCH, records complete = Yes and non-obstetric hysterectomy = No; otherwise Excluded.
- **elderly_primi**: age ≥ 35 years.
- **bmi**: weight (kg) / height (m)².
- **anaemia_grade** (WHO, pregnancy): Hb ≥ 11 None; 10–10.9 Mild; 7–9.9 Moderate; < 7 Severe.
- **robson** (nulliparous singleton): transverse/oblique lie → 9; breech → 6; cephalic < 37 wk → 10; cephalic ≥ 37 wk with spontaneous labour → 1, induced → 2a, CS before labour → 2b. Groups 3, 4, 5, 7, 8 cannot occur in this study population.
- **dii_min**: skin incision − decision (minutes). **ddi_min**: birth − decision (minutes).
- **stay_days**: discharge date − admission date. **postop_days**: discharge date − date of birth.
- **bw_cat**: < 1000 ELBW; 1000–1499 VLBW; 1500–2499 LBW; 2500–3999 Normal; ≥ 4000 Macrosomia.
- **perinatal_death**: stillbirth (fresh or macerated) or early neonatal death (≤ 7 days).
