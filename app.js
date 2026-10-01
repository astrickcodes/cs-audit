/* CS Audit — UI: lock screen, dashboard, case list, case form, settings. */
(function () {
  'use strict';

  const APP_VERSION = '1.0.0';
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const view = $('#view');
  const LOCK_AFTER_MS = 2 * 60 * 1000;

  let unlocked = false;
  let current = null; // case being edited
  let saveTimer = null;
  let hiddenAt = 0;
  let listQuery = '';
  let listFilter = 'all';

  // ---------- helpers ----------
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const nowIso = () => new Date().toISOString();
  const target = () => Number(localStorage.getItem('target')) || 300;
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 + '%' : '—');

  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function setTitle(t, back) {
    $('#title').textContent = t;
    $('#backBtn').hidden = !back;
    $('#backBtn').onclick = back ? () => { location.hash = back; } : null;
  }

  function setTab(tab) {
    $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  }

  function isExcluded(r) { return Derive.eligibility(r) === 'Excluded'; }

  function isBlank(r) {
    const meta = ['study_id', 'status', 'createdAt', 'updatedAt', 'syncedAt'];
    return Object.keys(r).every((k) => meta.includes(k) || Schema.isEmpty(r[k]));
  }

  function statusOf(r) {
    if (isExcluded(r)) return 'excluded';
    return r.status === 'complete' ? 'complete' : 'draft';
  }

  async function nextStudyId() {
    const all = await DB.all();
    let max = Number(localStorage.getItem('lastSeq')) || 0;
    for (const r of all) {
      const m = /^CS-(\d+)$/.exec(r.study_id);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const n = max + 1;
    localStorage.setItem('lastSeq', String(n));
    return 'CS-' + String(n).padStart(3, '0');
  }

  // ---------- PIN lock ----------
  async function sha256(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function pinSalt() {
    let s = localStorage.getItem('pinSalt');
    if (!s) { s = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'); localStorage.setItem('pinSalt', s); }
    return s;
  }
  const pinHash = (pin) => sha256(pinSalt() + ':' + pin);

  let pinFirst = null;
  function showLock() {
    flushSave();
    unlocked = false;
    pinFirst = null;
    const hasPin = !!localStorage.getItem('pinHash');
    $('#lockTitle').textContent = hasPin ? 'Enter PIN' : 'Create a PIN';
    $('#lockMsg').textContent = hasPin ? '' : 'Choose a 4–6 digit PIN to protect patient data on this phone.';
    $('#pinBtn').textContent = hasPin ? 'Unlock' : 'Next';
    $('#pinForgot').hidden = !hasPin;
    $('#pinInput').value = '';
    $('#lock').hidden = false;
    view.innerHTML = '';
    setTimeout(() => $('#pinInput').focus(), 150);
  }

  async function onPinSubmit() {
    const input = $('#pinInput');
    const pin = input.value.trim();
    const msg = $('#lockMsg');
    if (!/^\d{4,6}$/.test(pin)) { msg.textContent = 'PIN must be 4–6 digits'; return; }
    const h = await pinHash(pin);
    const stored = localStorage.getItem('pinHash');
    input.value = '';
    if (stored) {
      if (h === stored) unlock();
      else msg.textContent = 'Wrong PIN';
      return;
    }
    if (!pinFirst) {
      pinFirst = h;
      $('#lockTitle').textContent = 'Confirm PIN';
      msg.textContent = 'Enter the same PIN again';
      $('#pinBtn').textContent = 'Save PIN';
      return;
    }
    if (h !== pinFirst) {
      pinFirst = null;
      $('#lockTitle').textContent = 'Create a PIN';
      msg.textContent = 'PINs did not match — try again';
      $('#pinBtn').textContent = 'Next';
      return;
    }
    localStorage.setItem('pinHash', h);
    toast('PIN saved');
    unlock();
  }

  function onForgotPin() {
    const token = localStorage.getItem('syncToken');
    if (token) {
      const t = prompt('To reset the PIN, enter your Google Sheet sync token (from Settings / Code.gs):');
      if (t === null) return;
      if (t.trim() !== token) { alert('Token does not match.'); return; }
    } else if (!confirm('Reset the PIN? Your case data will be kept.')) return;
    localStorage.removeItem('pinHash');
    showLock();
  }

  function unlock() {
    unlocked = true;
    $('#lock').hidden = true;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    route();
  }

  // ---------- saving ----------
  function scheduleSave() {
    $('#saveState') && ($('#saveState').textContent = 'Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }

  async function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!current || !current._dirty) return;
    const rec = current;
    delete rec._dirty;
    if (rec.status === 'complete') {
      const v = Schema.validate(rec);
      if (v.errors.length || v.missing.length) {
        rec.status = 'draft';
        toast('Moved back to Draft — some required fields are now missing/invalid');
        updateSummary();
      }
    }
    await DB.put(rec);
    const s = $('#saveState');
    if (s) s.textContent = 'Saved ✓';
    updateNetStatus();
  }

  async function leaveCase() {
    if (!current) return;
    const rec = current;
    await flushSave();
    current = null;
    if (isBlank(rec)) await DB.del(rec.study_id);
  }

  // ---------- router ----------
  async function route() {
    if (!unlocked) return;
    const [, page, id] = (location.hash || '#/home').split('/');
    if (current && !(page === 'case' && decodeURIComponent(id || '') === current.study_id)) await leaveCase();
    window.scrollTo(0, 0);
    switch (page) {
      case 'list': setTab('list'); return renderList();
      case 'new': setTab('new'); return newCase();
      case 'case': setTab('list'); return renderCase(decodeURIComponent(id || ''));
      case 'settings': setTab('settings'); return renderSettings();
      default: setTab('home'); return renderHome();
    }
  }

  // ---------- dashboard ----------
  function table(title, rows, total) {
    if (!rows.length) return '';
    return `<div class="card"><h3>${esc(title)}</h3><table class="stats"><tbody>${rows
      .map(([label, n, base]) => `<tr><td>${esc(label)}</td><td class="num">${n}</td><td class="num muted">${pct(n, base === undefined ? total : base)}</td></tr>`)
      .join('')}</tbody></table></div>`;
  }

  function countBy(recs, fn) {
    const m = new Map();
    for (const r of recs) {
      const k = fn(r);
      if (k === '' || k === undefined || k === null) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }

  function optLabel(fieldId, code) {
    const f = Schema.FIELD_BY_ID[fieldId];
    const o = f && f.options && f.options.find((x) => x[0] === code);
    return o ? o[1] : code;
  }

  function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  async function renderHome() {
    setTitle('CS Audit — NMCH');
    const all = await DB.all();
    const study = all.filter((r) => !isExcluded(r));
    const complete = study.filter((r) => r.status === 'complete');
    const drafts = study.length - complete.length;
    const excluded = all.length - study.length;
    const unsynced = all.filter(Sync.needsSync).length;
    const n = study.length;
    const progress = Math.min(100, Math.round((complete.length / target()) * 100));
    const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    const robson = countBy(study, (r) => Derive.robson(r));
    const robsonRows = ['1', '2a', '2b', '6', '9', '10'].filter((g) => robson.has(g)).map((g) => [Derive.ROBSON_LABELS[g], robson.get(g)]);
    const robsonBase = Array.from(robson.values()).reduce((a, b) => a + b, 0);

    const type = countBy(study, (r) => r.cs_type && optLabel('cs_type', r.cs_type));
    const verdict = countBy(study, (r) => r.aud_verdict && optLabel('aud_verdict', r.aud_verdict));
    const verdictBase = Array.from(verdict.values()).reduce((a, b) => a + b, 0);
    const ind = Array.from(countBy(study, (r) => r.ind_primary && optLabel('ind_primary', r.ind_primary))).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const indBase = ind.length ? study.filter((r) => r.ind_primary).length : 0;

    const yes = (fn) => study.filter(fn).length;
    const anyOf = (r, id) => Array.isArray(r[id]) && r[id].some((c) => c !== 'none');
    const with_ = (id) => study.filter((r) => !Schema.isEmpty(r[id])).length;
    const liveBorn = study.filter((r) => r.birth_status === 'live');
    const ddis = study.filter((r) => r.cs_type === 'emergency').map((r) => Derive.minutesBetween(r.decision_dt, r.birth_dt)).filter((x) => x !== null && x >= 0);
    const stays = study.map((r) => Derive.daysBetween(r.adm_date, r.discharge_date)).filter((x) => x !== null && x >= 0);

    const outcomeRows = [
      ['Avoidable CS (audit)', yes((r) => r.aud_avoidable === 'yes'), with_('aud_avoidable')],
      ['Elderly primigravida', yes((r) => Derive.elderly(r) === 'Yes'), with_('age')],
      ['Any intra-operative complication', yes((r) => anyOf(r, 'io')), with_('io')],
      ['Any post-operative complication', yes((r) => anyOf(r, 'po')), with_('po')],
      ['Blood transfusion', yes((r) => r.transfusion === 'yes'), with_('transfusion')],
      ['Maternal deaths', yes((r) => r.mat_outcome === 'death'), with_('mat_outcome')],
      ['Low birth weight (<2500 g)', yes((r) => Derive.num(r.bw) !== null && Derive.num(r.bw) < 2500), with_('bw')],
      ['Apgar <7 at 5 min (live births)', liveBorn.filter((r) => Derive.num(r.apgar5) !== null && Derive.num(r.apgar5) < 7).length, liveBorn.filter((r) => !Schema.isEmpty(r.apgar5)).length],
      ['NICU admission', yes((r) => r.nicu === 'yes'), liveBorn.filter((r) => r.nicu).length],
      ['Breastfeeding within 1 h', yes((r) => r.bf_1hr === 'yes'), liveBorn.filter((r) => r.bf_1hr).length],
      ['Perinatal deaths', yes((r) => Derive.perinatalDeath(r) === 'Yes'), study.filter((r) => Derive.perinatalDeath(r)).length],
    ].filter((row) => row[2] > 0);

    view.innerHTML = `
      ${standalone ? '' : `<div class="card hint">📲 <b>Install on iPhone:</b> open this page in <b>Safari</b>, tap <b>Share</b> → <b>Add to Home Screen</b>. Then always open the app from the home-screen icon.</div>`}
      <div class="card">
        <div class="progress-head"><b>${complete.length}</b> / ${target()} complete cases <span class="muted">(${progress}%)</span></div>
        <div class="progress"><div style="width:${progress}%"></div></div>
        <div class="kpis">
          <a href="#/list" data-filter="draft"><b>${drafts}</b><span>Drafts</span></a>
          <a href="#/list" data-filter="excluded"><b>${excluded}</b><span>Excluded</span></a>
          <a href="#/list" data-filter="unsynced"><b>${unsynced}</b><span>Not synced</span></a>
        </div>
        <div class="row">
          <button class="btn primary" id="homeNew">＋ New case</button>
          <button class="btn" id="homeSync">⟳ Sync to Sheet</button>
        </div>
        <p class="muted small">Last sync: ${esc(fmtDate(localStorage.getItem('lastSync')) || 'never')}</p>
      </div>
      ${n ? '' : '<div class="card muted">No cases yet. Tap <b>＋ New case</b> to start.</div>'}
      ${table('Robson classification', robsonRows, robsonBase)}
      ${table('Type of CS', Array.from(type), n)}
      ${table('Top primary indications', ind, indBase)}
      ${table('Audit verdict', Array.from(verdict), verdictBase)}
      ${outcomeRows.length ? table('Outcomes (n with data in %)', outcomeRows) : ''}
      ${ddis.length || stays.length ? `<div class="card"><h3>Intervals</h3><table class="stats"><tbody>
        ${ddis.length ? `<tr><td>Median decision-to-delivery (emergency)</td><td class="num">${median(ddis)} min</td><td class="num muted">n=${ddis.length}</td></tr>` : ''}
        ${stays.length ? `<tr><td>Median hospital stay</td><td class="num">${median(stays)} d</td><td class="num muted">n=${stays.length}</td></tr>` : ''}
      </tbody></table></div>` : ''}
      <p class="muted small center">Dashboard counts include drafts. Use the CSV export for thesis analysis.</p>`;

    $('#homeNew').onclick = () => { location.hash = '#/new'; };
    $('#homeSync').onclick = () => doSync();
    $$('.kpis a').forEach((a) => a.addEventListener('click', () => { listFilter = a.dataset.filter; }));
  }

  async function doSync(opts) {
    try {
      toast('Syncing…', 10000);
      const n = await Sync.sync(await DB.all(), opts);
      toast(n ? `Synced ${n} case${n > 1 ? 's' : ''} to Google Sheet ✓` : 'Everything is already synced ✓');
    } catch (e) {
      toast('Sync failed: ' + e.message, 6000);
    }
    updateNetStatus();
    const page = (location.hash || '#/home').split('/')[1];
    if (page === 'home' || !page) renderHome();
    if (page === 'list') renderList();
  }

  // ---------- list ----------
  async function renderList() {
    setTitle('Cases');
    const all = (await DB.all()).sort((a, b) => b.study_id.localeCompare(a.study_id, undefined, { numeric: true }));
    const counts = { all: all.length, draft: 0, complete: 0, excluded: 0, unsynced: 0 };
    all.forEach((r) => { counts[statusOf(r)]++; if (Sync.needsSync(r)) counts.unsynced++; });
    const filters = [['all', 'All'], ['draft', 'Draft'], ['complete', 'Complete'], ['excluded', 'Excluded'], ['unsynced', 'Not synced']];

    view.innerHTML = `
      <div class="searchbar"><input id="q" type="search" placeholder="Search name, Reg. no., Study ID, phone" value="${esc(listQuery)}"></div>
      <div class="chips">${filters.map(([k, l]) => `<button class="chip ${listFilter === k ? 'on' : ''}" data-f="${k}">${l} <span>${counts[k]}</span></button>`).join('')}</div>
      <div id="items"></div>`;

    const draw = () => {
      const q = listQuery.trim().toLowerCase();
      const items = all.filter((r) => {
        if (listFilter === 'unsynced' ? !Sync.needsSync(r) : listFilter !== 'all' && statusOf(r) !== listFilter) return false;
        if (!q) return true;
        return [r.study_id, r.name, r.reg_no, r.phone].some((v) => v && String(v).toLowerCase().includes(q));
      });
      $('#items').innerHTML = items.length
        ? items.map((r) => {
          const st = statusOf(r);
          const rb = Derive.robson(r);
          return `<a class="item" href="#/case/${encodeURIComponent(r.study_id)}">
            <div class="item-main"><b>${esc(r.study_id)}</b> · ${esc(r.name || '(no name)')}
              <div class="muted small">Reg ${esc(r.reg_no || '—')} · ${esc(r.adm_date || '')}${rb ? ' · Robson ' + rb : ''}${r.ind_primary ? ' · ' + esc(optLabel('ind_primary', r.ind_primary)) : ''}</div></div>
            <div class="item-side"><span class="badge ${st}">${st}</span>${Sync.needsSync(r) ? '<span class="dot" title="Not synced"></span>' : ''}</div></a>`;
        }).join('')
        : '<p class="muted center">No cases match.</p>';
    };
    draw();
    $('#q').addEventListener('input', (e) => { listQuery = e.target.value; draw(); });
    $$('.chips .chip').forEach((b) => b.addEventListener('click', () => {
      listFilter = b.dataset.f;
      $$('.chips .chip').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    }));
  }

  // ---------- case form ----------
  async function newCase() {
    const id = await nextStudyId();
    const t = nowIso();
    await DB.put({ study_id: id, status: 'draft', createdAt: t, updatedAt: t });
    location.replace('#/case/' + encodeURIComponent(id));
  }

  function fieldHtml(f, r) {
    const v = r[f.id];
    const req = f.req ? '<span class="req">*</span>' : '';
    const unit = f.unit ? `<span class="unit">${esc(f.unit)}</span>` : '';
    let input;
    switch (f.type) {
      case 'text':
      case 'tel':
        input = `<input type="${f.type}" data-id="${f.id}" value="${esc(v)}" ${f.readonly ? 'readonly' : ''} autocomplete="off" ${f.type === 'tel' ? 'inputmode="tel"' : ''}>`;
        break;
      case 'number':
        input = `<div class="with-unit"><input type="number" inputmode="decimal" step="any" data-id="${f.id}" value="${esc(v)}" placeholder="${f.min !== undefined ? f.min + '–' + f.max : ''}">${unit}</div>`;
        break;
      case 'date':
        input = `<input type="date" data-id="${f.id}" value="${esc(v)}">`;
        break;
      case 'datetime':
        input = `<div class="row tight"><input type="datetime-local" data-id="${f.id}" value="${esc(v)}"><button type="button" class="btn small" data-now="${f.id}">Now</button></div>`;
        break;
      case 'textarea':
        input = `<textarea data-id="${f.id}" rows="3">${esc(v)}</textarea>`;
        break;
      case 'select':
        input = `<select data-id="${f.id}"><option value="">— select —</option>${f.options.map(([c, l]) => `<option value="${esc(c)}" ${v === c ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
        break;
      case 'radio':
      case 'multi': {
        const arr = f.type === 'multi' ? (Array.isArray(v) ? v : []) : [v];
        input = `<div class="choices ${f.type}" data-choice="${f.id}">${f.options.map(([c, l]) => `<button type="button" class="choice ${arr.includes(c) ? 'on' : ''}" data-val="${esc(c)}">${esc(l)}</button>`).join('')}</div>`;
        break;
      }
      case 'computed':
        input = `<output data-computed="${f.id}"></output>${unit}`;
        break;
    }
    return `<div class="field ${f.type === 'computed' ? 'computed' : ''}" data-field="${f.id}"><label>${esc(f.label)}${req}</label>${input}<div class="err" data-err="${f.id}"></div></div>`;
  }

  async function renderCase(id) {
    const rec = await DB.get(id);
    if (!rec) { view.innerHTML = '<p class="card">Case not found.</p>'; setTitle('Case', '#/list'); return; }
    current = rec;
    setTitle(rec.study_id, '#/list');
    const fresh = isBlank(rec);

    view.innerHTML = `
      <div class="card summary" id="summary"></div>
      <div id="warnings"></div>
      <form id="caseForm" autocomplete="off" onsubmit="return false">
        ${Schema.SECTIONS.map((s, i) => `
          <details class="sec" data-sec="${s.id}" ${fresh && i === 0 ? 'open' : ''}>
            <summary><span>${esc(s.title)}</span><span class="sec-badge" data-badge="${s.id}"></span></summary>
            <div class="sec-body">${s.fields.map((f) => fieldHtml(f, rec)).join('')}</div>
          </details>`).join('')}
      </form>
      <div id="completeBox"></div>
      <div class="actions">
        <button class="btn primary" id="markComplete"></button>
        <button class="btn danger" id="deleteCase">Delete case</button>
      </div>
      <div class="savebar"><span id="saveState">Saved ✓</span><button class="btn small" id="doneBtn">Done</button></div>`;

    const form = $('#caseForm');
    form.addEventListener('input', onFieldInput);
    form.addEventListener('change', onFieldInput);
    form.addEventListener('click', onFormClick);
    $('#markComplete').onclick = onToggleComplete;
    $('#deleteCase').onclick = onDelete;
    $('#doneBtn').onclick = () => { location.hash = '#/list'; };
    refresh();
  }

  function onFieldInput(e) {
    const el = e.target;
    const id = el.dataset && el.dataset.id;
    if (!id || !current) return;
    if (current[id] === el.value) return;
    current[id] = el.value;
    changed();
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function localNow() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function onFormClick(e) {
    const nowBtn = e.target.closest('[data-now]');
    if (nowBtn) {
      const id = nowBtn.dataset.now;
      current[id] = localNow();
      $(`[data-id="${id}"]`, view).value = current[id];
      changed();
      return;
    }
    const btn = e.target.closest('.choice');
    if (!btn) return;
    const wrap = btn.closest('[data-choice]');
    const f = Schema.FIELD_BY_ID[wrap.dataset.choice];
    const code = btn.dataset.val;
    if (f.type === 'radio') {
      current[f.id] = current[f.id] === code ? '' : code; // tap again to clear
    } else {
      let arr = Array.isArray(current[f.id]) ? current[f.id].slice() : [];
      if (arr.includes(code)) arr = arr.filter((c) => c !== code);
      else if (f.exclusive && code === f.exclusive) arr = [code];
      else arr = arr.filter((c) => c !== f.exclusive).concat(code);
      current[f.id] = arr;
    }
    const sel = f.type === 'multi' ? current[f.id] : [current[f.id]];
    $$('.choice', wrap).forEach((b) => b.classList.toggle('on', sel.includes(b.dataset.val)));
    changed();
  }

  function changed() {
    current.updatedAt = nowIso();
    current._dirty = true;
    refresh();
    scheduleSave();
  }

  function refresh() {
    if (!current) return;
    const r = current;
    const d = Derive.deriveAll(r);
    const { errors, missing } = Schema.validate(r);
    const errById = {};
    errors.forEach((x) => { errById[x.id] = errById[x.id] || x.msg; });
    const missingIds = new Set(missing.map((m) => m.id));
    const perSec = {};

    for (const f of Schema.FIELDS) {
      const wrap = $(`[data-field="${f.id}"]`, view);
      if (!wrap) continue;
      const vis = Schema.isVisible(f, r);
      wrap.hidden = !vis;
      if (f.type === 'computed') {
        const out = $('output', wrap);
        const val = d[f.id];
        out.textContent = val === '' || val === undefined ? '—' : String(val);
        continue;
      }
      const err = $(`[data-err="${f.id}"]`, wrap);
      err.textContent = vis && errById[f.id] ? errById[f.id] : '';
      wrap.classList.toggle('invalid', !!(vis && errById[f.id]));
      wrap.classList.toggle('missing', vis && missingIds.has(f.id));
      if (vis && (errById[f.id] || missingIds.has(f.id))) perSec[f.section] = (perSec[f.section] || 0) + 1;
    }
    for (const s of Schema.SECTIONS) {
      const b = $(`[data-badge="${s.id}"]`, view);
      const n = perSec[s.id] || 0;
      b.textContent = n ? n + ' to fill' : '✓';
      b.className = 'sec-badge ' + (n ? 'todo' : 'ok');
    }

    const w = Schema.warnings(r);
    $('#warnings').innerHTML = w.length ? `<div class="card warn">⚠️ ${w.map(esc).join('<br>⚠️ ')}</div>` : '';
    updateSummary(d, errors.length + missing.length);
  }

  function updateSummary(d, todo) {
    if (!current || !$('#summary')) return;
    const r = current;
    d = d || Derive.deriveAll(r);
    if (todo === undefined) { const v = Schema.validate(r); todo = v.errors.length + v.missing.length; }
    const st = statusOf(r);
    $('#summary').innerHTML = `
      <div class="sum-row"><b>${esc(r.study_id)}</b> <span class="badge ${st}">${st}</span></div>
      <div class="sum-row">${esc(r.name || '(no name)')}${r.reg_no ? ' · Reg ' + esc(r.reg_no) : ''}</div>
      <div class="sum-row robson ${d.robson ? '' : 'muted'}">${d.robson ? 'Robson ' + esc(d.robson_label) : 'Robson: fill GA, presentation & labour onset'}</div>
      <div class="sum-row muted small">${todo ? todo + ' item(s) still needed to complete' : 'All required items filled'}</div>`;
    const btn = $('#markComplete');
    btn.textContent = r.status === 'complete' ? 'Reopen as draft' : (isExcluded(r) ? 'Save as excluded' : 'Mark case complete');
    btn.hidden = isExcluded(r) && r.status === 'complete';
  }

  function jumpTo(id) {
    const el = $(`[data-field="${id}"]`, view);
    if (!el) return;
    el.closest('details').open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1500);
  }

  async function onToggleComplete() {
    const r = current;
    if (r.status === 'complete') {
      r.status = 'draft';
      r.updatedAt = nowIso();
      r._dirty = true;
      await flushSave();
      refresh();
      toast('Reopened as draft');
      return;
    }
    const { errors, missing } = Schema.validate(r);
    const items = errors.map((e) => ({ id: e.id, text: `${Schema.FIELD_BY_ID[e.id].label}: ${e.msg}` }))
      .concat(missing.map((m) => ({ id: m.id, text: m.label })));
    if (items.length) {
      $('#completeBox').innerHTML = `<div class="card warn"><b>Before marking complete, fill / fix:</b><ul>${items.map((i) => `<li><a href="javascript:void 0" data-jump="${i.id}">${esc(i.text)}</a></li>`).join('')}</ul><p class="muted small">You can leave now — the case is saved as a draft.</p></div>`;
      $$('[data-jump]', view).forEach((a) => a.addEventListener('click', () => jumpTo(a.dataset.jump)));
      $('#completeBox').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    $('#completeBox').innerHTML = '';
    r.status = 'complete';
    r.updatedAt = nowIso();
    r._dirty = true;
    await flushSave();
    refresh();
    toast(isExcluded(r) ? 'Saved as excluded ✓' : 'Case marked complete ✓');
  }

  async function onDelete() {
    const r = current;
    if (!confirm(`Delete ${r.study_id}${r.name ? ' (' + r.name + ')' : ''}? This cannot be undone.`)) return;
    clearTimeout(saveTimer);
    current = null;
    await DB.del(r.study_id);
    toast(r.syncedAt ? 'Deleted. Also delete its row in the Google Sheet.' : 'Deleted', 4000);
    location.hash = '#/list';
  }

  // ---------- settings ----------
  async function renderSettings() {
    setTitle('Settings');
    const s = Sync.settings();
    let persisted = 'unknown';
    try { if (navigator.storage && navigator.storage.persisted) persisted = (await navigator.storage.persisted()) ? 'yes' : 'no'; } catch (e) { /* ignore */ }
    const all = await DB.all();

    view.innerHTML = `
      <div class="card">
        <h3>Google Sheet sync</h3>
        <label>Web-app URL (from Apps Script → Deploy)</label>
        <input id="setUrl" type="url" value="${esc(s.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off">
        <label>Secret token (same as in Code.gs)</label>
        <input id="setToken" type="text" value="${esc(s.token)}" autocomplete="off">
        <div class="row">
          <button class="btn primary" id="saveSync">Save</button>
          <button class="btn" id="testSync">Test connection</button>
        </div>
        <div class="row"><button class="btn" id="syncNow">Sync now</button><button class="btn" id="syncAll">Re-send all cases</button></div>
      </div>
      <div class="card">
        <h3>Export & backup</h3>
        <p class="muted small">CSV opens in Excel / SPSS (one row per case). Backup (.json) can be restored into this app on any phone.</p>
        <div class="row"><button class="btn" id="expCsv">Export CSV</button><button class="btn" id="expJson">Backup (.json)</button></div>
        <div class="row"><label class="btn file">Restore backup<input id="restore" type="file" accept=".json,application/json" hidden></label></div>
      </div>
      <div class="card">
        <h3>Study</h3>
        <label>Target sample size</label>
        <input id="setTarget" type="number" inputmode="numeric" value="${target()}">
      </div>
      <div class="card">
        <h3>Security</h3>
        <div class="row"><button class="btn" id="changePin">Change PIN</button><button class="btn" id="lockNow">Lock now</button></div>
        <p class="muted small">The app locks automatically 2 minutes after you leave it.</p>
      </div>
      <div class="card muted small">
        Cases on this phone: ${all.length} · Persistent storage: ${persisted} · Version ${APP_VERSION}
        <div class="row"><button class="btn danger small" id="wipe">Erase all data on this phone</button></div>
      </div>`;

    $('#saveSync').onclick = () => {
      localStorage.setItem('syncUrl', $('#setUrl').value.trim());
      localStorage.setItem('syncToken', $('#setToken').value.trim());
      toast('Saved');
    };
    $('#testSync').onclick = async () => {
      $('#saveSync').click();
      try { const j = await Sync.test(); toast(`Connected ✓ Sheet has ${j.rows} case row(s)`, 4000); } catch (e) { toast('Failed: ' + e.message, 6000); }
    };
    $('#syncNow').onclick = () => doSync();
    $('#syncAll').onclick = () => { if (confirm('Send every case to the Sheet again (updates existing rows)?')) doSync({ all: true }); };
    $('#expCsv').onclick = async () => Export.exportCSV(await DB.all());
    $('#expJson').onclick = async () => Export.exportBackup(await DB.all());
    $('#restore').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const changes = Export.mergeBackup(await DB.all(), await file.text());
        await DB.putMany(changes);
        changes.forEach((r) => {
          const m = /^CS-(\d+)$/.exec(r.study_id);
          if (m && Number(m[1]) > (Number(localStorage.getItem('lastSeq')) || 0)) localStorage.setItem('lastSeq', m[1]);
        });
        toast(`Restored ${changes.length} case(s)`);
        renderSettings();
      } catch (err) { toast('Restore failed: ' + err.message, 5000); }
    };
    $('#setTarget').onchange = (e) => { const n = Number(e.target.value); if (n > 0) localStorage.setItem('target', String(n)); };
    $('#changePin').onclick = async () => {
      const cur = prompt('Enter current PIN');
      if (cur === null) return;
      if ((await pinHash(cur.trim())) !== localStorage.getItem('pinHash')) { alert('Wrong PIN'); return; }
      localStorage.removeItem('pinHash');
      showLock();
    };
    $('#lockNow').onclick = showLock;
    $('#wipe').onclick = async () => {
      const unsynced = all.filter(Sync.needsSync).length;
      const t = prompt(`${unsynced ? `⚠️ ${unsynced} case(s) are NOT synced and will be lost.\n` : ''}Type DELETE to erase all ${all.length} cases from this phone.`);
      if (t !== 'DELETE') return;
      for (const r of all) await DB.del(r.study_id);
      toast('All data erased from this phone');
      renderSettings();
    };
  }

  // ---------- status, lifecycle ----------
  async function updateNetStatus() {
    const el = $('#netStatus');
    let pending = 0;
    try { pending = (await DB.all()).filter(Sync.needsSync).length; } catch (e) { /* ignore */ }
    el.textContent = (navigator.onLine ? '● online' : '○ offline') + (pending ? ` · ${pending} unsynced` : '');
    el.className = 'net ' + (navigator.onLine ? 'on' : 'off');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      flushSave();
    } else if (unlocked && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) {
      showLock();
    }
  });
  window.addEventListener('pagehide', () => flushSave());
  window.addEventListener('hashchange', route);
  window.addEventListener('online', updateNetStatus);
  window.addEventListener('offline', updateNetStatus);
  $('#pinBtn').addEventListener('click', onPinSubmit);
  $('#pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') onPinSubmit(); });
  $('#pinForgot').addEventListener('click', onForgotPin);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      toast('App updated — changes apply next time you open it', 4000);
    });
  }

  // Remove empty drafts left behind (e.g. app closed right after "New case")
  DB.all().then(async (all) => {
    for (const r of all) if (isBlank(r)) await DB.del(r.study_id);
    updateNetStatus();
  });

  showLock();
})();
