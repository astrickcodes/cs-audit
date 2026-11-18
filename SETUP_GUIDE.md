# CS Audit app: setup guide

This is an iPhone app for collecting thesis data for *"Importance of auditing caesarean section to improve maternal and fetal outcome in primigravida at NMCH, Patna"*.

What the app does:
- Works **offline** in the labour room. Cases are saved on the phone as you type.
- Calculates the **Robson group**, decision-to-delivery interval, hospital stay, elderly primigravida, BMI, anaemia grade, birth-weight category and perinatal death for you.
- Lets you save a case as a **Draft** now and finish it later. Discharge and neonatal outcome data usually come in a few days after surgery.
- **Syncs both ways** with your own private Google Sheet when you have internet, and **exports to CSV** for Excel or SPSS.

You only need to do the setup once. It takes about 30 minutes, and Steps 1 and 2 are easiest on a laptop.

---

## Step 1: Put the app online (free, GitHub Pages)

The app is just a folder of files. It needs an `https://` web address so the iPhone can install it.

1. Create a free account at <https://github.com>.
2. Click **+ → New repository**. Name it `cs-audit` and choose **Public**. Free GitHub Pages needs a public repository. Only the app's *code* goes here, and patient data never leaves your phone or your Google account. Click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Drag in **everything inside** the `cs-audit-app` folder: `index.html`, `app.js`, `schema.js`, `derive.js`, `db.js`, `export.js`, `sync.js`, `styles.css`, `manifest.json`, `sw.js`, and the `icons` folder. You can skip `tests`, `apps-script` and the `.md` files. Click **Commit changes**.
5. Go to **Settings → Pages**. Under *Branch*, choose `main` and `/ (root)`, then click **Save**.
6. After 1–2 minutes the page shows your address, for example `https://yourname.github.io/cs-audit/`. Write it down.

> Alternative: <https://app.netlify.com/drop>. Create a free account and drag the `cs-audit-app` folder onto the page. It gives you an https address straight away.

## Step 2: Create the Google Sheet and connect it

1. Open <https://sheets.google.com>, create a **blank spreadsheet**, and name it `CS Audit Data`.
2. Click **Extensions → Apps Script**.
3. Delete everything in the editor. Open `apps-script/Code.gs` from this folder, copy all of it, and paste it in.
4. On the line `const TOKEN = 'change-me-to-a-long-secret';`, replace the text inside the quotes with your own long password. Example: `nmch-cs-2025-k7Qp9xLm2`. **Write it down.** This token stops anyone else from sending data to your Sheet.
5. Click **💾 Save**.
6. Click **Deploy → New deployment**, then click the ⚙️ icon and choose **Web app**. Set:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**. This is required so the iPhone can reach the script without a Google login. The secret token still protects it.
7. Click **Deploy**. Google will ask you to authorise:
   - Choose your account, then **Advanced → Go to (unsafe) → Allow**.
   - This warning is normal for your own scripts.
8. Copy the **Web app URL**. It ends in `/exec`.

> If you change `Code.gs` later, use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. This keeps the same URL.

## Updating the Google Sheet script (two-way sync)

1. In the existing Sheet, open **Extensions → Apps Script** and paste the new `apps-script/Code.gs`. **Keep her existing `const TOKEN = ...` line** (the same token saved on the iPhone).
2. Save, then **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. This updates the **same URL**; do not create a new deployment.
3. Reopen the iPhone app online to pick up version 1.1.0, then tap **Sync**. It pulls Sheet/bot changes first and sends phone changes afterwards. The first updated sync also re-sends existing phone records to backfill `_json`.

If the Sheet script has not been updated, or pulling fails/times out, Sync silently falls back to uploading pending phone cases as before. The one-time full backfill waits until pull is supported. Unsynced phone edits always keep their non-empty values, even against a newer Sheet copy; the Sheet may only fill empty fields. Once phone edits are synced, newer Sheet values can replace them. Sync never deletes or renumbers cases.

The last Sheet column, `_json`, holds the complete raw record; do not edit it by hand. Bot updates keep it and the analysis columns consistent. Editing ordinary analysis cells alone does **not** update what the phone pulls. Legacy Sheet rows without `_json` become pullable after the phone holding those cases syncs once.

### Bot CLI (Node 18+, no dependencies)

On the bot host, create `~/.config/cs-audit/sync.json` yourself, outside this repository, with `{"url":"YOUR_EXISTING_WEB_APP_URL","token":"YOUR_EXISTING_TOKEN"}`. Restrict it to your account (`chmod 600 ~/.config/cs-audit/sync.json`). Do not commit credentials or patient input files.

```sh
node tools/bot-case.js schema
node tools/bot-case.js list
node tools/bot-case.js get CS-B001
node tools/bot-case.js next-id
node tools/bot-case.js upsert /private/path/case.json --dry-run
node tools/bot-case.js upsert /private/path/case.json
node tools/bot-case.js upsert /private/path/follow-up.json --overwrite
```

An input is one JSON object using schema field IDs and option **codes**, not labels. Omit `study_id` for a new case; supply it to complete an existing one. Date/times use `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` in IST. Unknown keys, invalid options and malformed numbers are reported together. By default only empty fields are filled; `--overwrite` replaces supplied fields, including explicit blanks, without touching unspecified fields. Computed values and completion status are recalculated; incomplete/invalid cases stay drafts. `--dry-run` pulls for merging and prints the proposed record, missing required fields and validation errors, but never posts it. `schema` needs no config or network.

New bot cases use `CS-B001`, `CS-B002`… independently of phone `CS-001` IDs; pulled numeric IDs count towards the phone's next ID. Run bot creation serially: `next-id` is advisory, not a reservation. **Renumber cases from CS-001** includes bot IDs, orders all phone cases by creation time and converts them to numeric IDs. Renumbering does not remove old Sheet rows: delete the old-ID rows **before the next sync**, or the pull will restore those old IDs as additional cases. Local deletion is also not propagated; delete the Sheet row as well or a later pull restores it. No sync operation deletes local cases.

If another writer updates a case between pull and push, the server skips the stale write. The phone merges the returned newer record; any combined fields still pending go out on the next sync. The CLI reports the conflict so it can be re-run. Device clocks should be correct, since conflicts use `updatedAt`. For a legacy row whose `_json` has not yet been backfilled, only its ID/timestamp can be returned on a stale-write conflict.

## Step 3: Install on the iPhone

1. Open the address from Step 1 in **Safari**. It must be Safari, not Chrome.
2. Tap the **Share** button (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. **Always open the app from the new home-screen icon "CS Audit".**
   - The copy in the Safari tab keeps its own separate data.
   - iOS can also delete website data that hasn't been used for a while. Home-screen apps are protected from this.
4. Create a **PIN** (4–6 digits). The app asks for it whenever it has been in the background for more than 2 minutes.
5. Go to **Settings ⚙️**:
   - paste the **Web app URL** and type the **token**
   - tap **Save**, then **Test connection**. You should see "Connected ✓".
6. Make sure you have used the app at least once with internet. After that it works fully offline.

---

## Daily use

| When | What to do |
|---|---|
| After a CS | **＋ New case** → fill sections 1–6 (identification, profile, obstetric, antenatal, indication, audit) and 7 (intra-op). Everything saves automatically as a draft. |
| During the stay / at discharge | **Cases** → tap the case → fill 8 (post-op, discharge) and 9 (neonatal) → **Mark case complete**. If anything is missing, the app lists it; tap an item to jump to it. |
| Patient not eligible | Answer the eligibility questions. If any answer makes her ineligible, the case is marked **Excluded**. Write the reason and tap **Save as excluded**. |
| When you have Wi-Fi/data | **Home → ⟳ Sync to Sheet**. The top bar shows how many cases are not yet synced. |
| Every week | **Settings → Backup (.json)** and save it to Files, Google Drive or email. This is a second safety copy. |

Tips:
- Each section header shows **"✓"** or **"n to fill"**. Required items are marked with **\***.
- **Yellow warnings** flag things worth re-checking. For example, a Category 1 CS with a decision-to-delivery interval over 30 min, or the indication "breech" when the presentation is cephalic.
- Tap a selected choice again to clear it.
- The **Now** button fills in the current date and time.
- Editing a synced case marks it as unsynced again. The next sync **updates the same row** in the Sheet rather than adding a new one.
- If you delete a case in the app, also delete its row in the Google Sheet before syncing, or the pull restores it.

## Analysis

- Use **Settings → Export CSV**, or download the Google Sheet as `.xlsx`/`.csv`.
- Every multi-select question (antenatal complications, modifiable factors, complications) is split into **0/1 columns**. You can count or cross-tabulate them directly in Excel pivot tables or SPSS.
- `DATA_DICTIONARY.md` explains every column and how each auto-calculated value is worked out. You can use it in the *Material & Methods* chapter.
- Robson report: the `robson` column shows how the caesareans are spread across the groups, i.e. what share of all CS each group makes up. This study only records caesareans. For a full Robson table (each group's **CS rate** and its contribution to the hospital's overall CS rate), you also need the number of primigravida deliveries in each group, by any mode, from the labour room register for the same period.

## Privacy and safety notes

- Patient names and phone numbers are stored **on the phone** and in **your own Google Sheet** only. Keep the Sheet unshared, apart from your guide if needed.
- The PIN is a deterrent, not encryption. Also keep a passcode or Face ID on the iPhone itself.
- If you forget the PIN, tap **Forgot PIN?** and enter your sync token. Your case data is kept.
- Make sure your ethics committee approval and consent form mention that data is stored digitally (on the phone and in Google Sheets).

## Troubleshooting

| Problem | Fix |
|---|---|
| "Unexpected reply from Google" | Check that the URL ends in `/exec` and that *Who has access* is **Anyone**. Redeploy if needed. |
| "Wrong token" | The token in Settings must exactly match `TOKEN` in Code.gs, including capital letters. |
| App shows old version after an update | Close the app fully (swipe it away) and open it again. Updates load in the background. |
| Got a new phone | On the old phone, Backup (.json). Install on the new phone, then **Settings → Restore backup**. |

---

### For whoever maintains the app
- No build step is needed; the code is plain HTML and JavaScript. All questions are defined in `schema.js`.
- Don't rename field ids after data collection starts, because they are the column names.
- After changing app files, bump `VERSION` in `sw.js` so phones pick up the update.
- To run the tests: `node --test tests/`.
- To run the browser test, start `python -m http.server 8765`, then run `python tests/e2e_check.py`.
- To regenerate the dictionary: `node tests/make-dictionary.js`.
