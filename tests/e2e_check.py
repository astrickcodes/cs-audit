"""Browser smoke test (iPhone emulation). Needs: pip install playwright, and Chrome installed.
Start a server first:  python -m http.server 8765   (from the cs-audit-app folder)
Then:                  python tests/e2e_check.py
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = 'http://localhost:8765/index.html'
SHOTS = Path(__file__).parent / 'screenshots'
SHOTS.mkdir(exist_ok=True)


def choose(page, field, label):
    page.locator(f'[data-choice="{field}"] .choice', has_text=label).first.click()


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome')
    ctx = browser.new_context(**p.devices['iPhone 13'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)

    # Create PIN
    page.fill('#pinInput', '1234'); page.click('#pinBtn')
    page.fill('#pinInput', '1234'); page.click('#pinBtn')
    expect(page.locator('#lock')).to_be_hidden()
    page.screenshot(path=SHOTS / '1-home.png')

    # New case
    page.click('#homeNew')
    expect(page.locator('#title')).to_have_text('CS-001')
    page.fill('[data-id="name"]', 'Sunita Devi')
    page.fill('[data-id="phone"]', '9876543210')
    page.fill('[data-id="reg_no"]', 'IPD-4521')
    page.fill('[data-id="adm_date"]', '2025-07-01')
    for f in ['el_primi', 'el_singleton', 'el_ga28', 'el_nmch', 'el_records']:
        choose(page, f, 'Yes')
    choose(page, 'el_hyst', 'No')
    expect(page.locator('[data-computed="eligibility"]')).to_have_text('Included')

    page.click('summary:has-text("3. Obstetric")')
    page.fill('[data-id="ga_weeks"]', '39')
    choose(page, 'presentation', 'Cephalic')
    choose(page, 'labour_onset', 'Induced')
    expect(page.locator('[data-field="bishop"]')).to_be_visible()
    expect(page.locator('#summary')).to_contain_text('G2a')
    choose(page, 'labour_onset', 'Spontaneous')
    expect(page.locator('[data-field="bishop"]')).to_be_hidden()
    expect(page.locator('#summary')).to_contain_text('G1')

    page.click('summary:has-text("2. Maternal")')
    page.fill('[data-id="age"]', '70')
    expect(page.locator('[data-err="age"]')).to_contain_text('between')
    page.fill('[data-id="age"]', '36')
    expect(page.locator('[data-computed="elderly_primi"]')).to_have_text('Yes')

    page.click('summary:has-text("4. Antenatal")')
    choose(page, 'ac', 'Preeclampsia')
    choose(page, 'ac', 'None')  # exclusive: clears preeclampsia
    expect(page.locator('[data-choice="ac"] .choice.on')).to_have_count(1)

    # Try to complete: should list missing items
    page.click('#markComplete')
    expect(page.locator('#completeBox')).to_contain_text('Primary indication')
    page.screenshot(path=SHOTS / '2-case.png', full_page=True)
    page.wait_for_timeout(600)  # autosave debounce

    # Leave and come back: data persisted
    page.click('#doneBtn')
    expect(page.locator('.item')).to_have_count(1)
    expect(page.locator('.item')).to_contain_text('Sunita Devi')
    expect(page.locator('.item')).to_contain_text('Robson 1')
    page.screenshot(path=SHOTS / '3-list.png')

    # Blank new case is discarded when leaving
    page.click('a[data-tab="new"]')
    expect(page.locator('#title')).to_have_text('CS-002')
    page.click('a[data-tab="list"]')
    page.wait_for_timeout(300)
    expect(page.locator('.item')).to_have_count(1)

    # CSV content
    csv = page.evaluate('DB.all().then(Export.toCSV)')
    header, row = csv.lstrip('﻿').split('\r\n')[:2]
    assert 'robson' in header.split(',') and 'ac_none' in header.split(','), header[:200]
    assert 'Sunita Devi' in row and ',1,' in row

    # Sync to a mocked Apps Script endpoint
    sent = []
    def fake_google(route):
        sent.append(route.request.post_data)
        route.fulfill(status=200, content_type='application/json', body='{"ok":true,"written":1,"rows":1}')
    page.route('https://script.google.com/**', fake_google)
    page.click('a[data-tab="settings"]')
    page.fill('#setUrl', 'https://script.google.com/macros/s/TEST/exec')
    page.fill('#setToken', 'secret')
    page.click('#saveSync')
    page.click('#syncNow')
    expect(page.locator('#toast')).to_contain_text('Synced 1 case')
    assert '"token":"secret"' in sent[-1] and 'Sunita Devi' in sent[-1]
    expect(page.locator('#netStatus')).not_to_contain_text('unsynced')
    page.click('#syncNow')
    expect(page.locator('#toast')).to_contain_text('already synced')

    # Offline reload works via service worker
    page.goto('http://localhost:8765/index.html')
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_timeout(500)
    ctx.set_offline(True)
    page.reload()
    expect(page.locator('#lock')).to_be_visible()
    page.fill('#pinInput', '1111'); page.click('#pinBtn')
    expect(page.locator('#lockMsg')).to_have_text('Wrong PIN')
    page.fill('#pinInput', '1234'); page.click('#pinBtn')
    page.click('a[data-tab="list"]')
    expect(page.locator('.item')).to_have_count(1)
    expect(page.locator('#netStatus')).to_contain_text('offline')
    page.screenshot(path=SHOTS / '4-offline-home.png')

    # Sync while offline fails gracefully
    page.click('a[data-tab="home"]')
    page.click('#homeSync')
    expect(page.locator('#toast')).to_contain_text('offline')

    page.goto('about:blank')
    browser.close()

    if errors:
        print('JS errors:', errors)
        sys.exit(1)
    print('E2E OK')
