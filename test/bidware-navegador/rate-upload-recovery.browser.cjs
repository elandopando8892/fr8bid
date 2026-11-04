// Real UI/services with synthetic multipart, interpretation and staging responses.
// No provider, production upload, model interpretation or commercial rate approval.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3041';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve('.test-output/rate-upload-recovery');
const probe = process.argv.includes('--probe');

async function scenario(browser, lang, kind) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: [kind === 'viewer' ? 'viewer' : 'operator'] } };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await context.addInitScript(({ user, lang }) => {
    localStorage.setItem('bidware.team.lang', lang);
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, token_type: 'bearer' }));
  }, { user, lang });
  const uploadId = '00000000-0000-4000-8000-000000000001';
  const vendor = { id: '00000000-0000-4000-8000-000000000002', vendor_name: 'Controlled carrier', primary_email: 'controlled@example.test' };
  const existing = { id: uploadId, original_filename: 'controlled.pdf', document_type: 'pdf', status: 'uploaded', created_at: '2026-10-01T12:00:00Z', vendor_hint: vendor.vendor_name };
  const snapshot = { ...existing, id: 'snapshot-fixture', original_filename: 'RFx-control-carrier-bid-11111111-1111-4111-8111-111111111111.json', status: 'staged', interpreted_rate_rows: 1 };
  const uploads = kind === 'recovery' ? [] : [existing, snapshot];
  const staging = [], calls = [], unexpected = [], errors = [];
  let rejectUpload = true, rejectInterpretation = true, denyReprocess = false;
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/create-raw-upload')) {
      assert.equal(user.app_metadata.roles[0], 'operator');
      assert.match(req.headers()['content-type'], /^multipart\/form-data; boundary=/);
      const body = req.postDataBuffer().toString('utf8');
      assert.match(body, /filename="controlled\.pdf"/);
      assert.match(body, /name="document_type"\r\n\r\npdf/);
      assert.match(body, /RFx-LOCAL/);
      calls.push({ action: 'create_raw_upload' });
      if (rejectUpload) { rejectUpload = false; return route.fulfill({ status: 503, json: {} }); }
      assert.equal(uploads.length, 0, 'Recovery must not create another file');
      uploads.push({ ...existing, rfx_hint: 'RFx-LOCAL' });
      return route.fulfill({ json: { raw_upload: uploads[0] } });
    }
    const input = req.postDataJSON();
    if (!input?.action) { unexpected.push(`${req.method()} ${url.pathname}`); return route.fulfill({ status: 501, json: { error: 'Unexpected fixture endpoint' } }); }
    calls.push(structuredClone(input));
    switch (input.action) {
      case 'list_uploads': return route.fulfill({ json: { rows: uploads, total: uploads.length } });
      case 'list_vendors': return route.fulfill({ json: { rows: [vendor], total: 1 } });
      case 'interpret_upload': {
        assert.equal(user.app_metadata.roles[0], 'operator');
        assert.equal(input.raw_upload_id, uploadId);
        if (denyReprocess) return route.fulfill({ status: 403, json: { error: 'Synthetic approved-rate protection', code: 'role_forbidden' } });
        if (rejectInterpretation) { rejectInterpretation = false; return route.fulfill({ status: 503, json: { error: 'Synthetic interpretation unavailable' } }); }
        assert.equal(staging.length, 0);
        Object.assign(uploads[0], { status: 'staged', interpreted_at: '2026-10-01T12:01:00Z', interpreted_rate_rows: 1 });
        staging.push({ id: 'staging-fixture', raw_upload_id: uploadId, status: 'pending_review', vendors: { vendor_name: vendor.vendor_name }, origin: 'Monterrey', destination: 'Dallas', all_in_rate: '800', currency: 'USD' });
        return route.fulfill({ json: { staged_rows: 1 } });
      }
      case 'list_staging':
        assert.equal(input.status, 'pending_review');
        return route.fulfill({ json: { rows: staging, total: staging.length } });
      case 'list_catalog_values': return route.fulfill({ json: { rows: [] } });
      case 'list_rfx_events': return route.fulfill({ json: { rows: [] } });
      default: unexpected.push(input.action); return route.fulfill({ status: 501, json: { error: 'Unexpected fixture action' } });
    }
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  const text = (es, en) => lang === 'es' ? es : en;
  const fileInput = () => page.locator('input[type=file]');
  const upload = () => page.getByRole('button', { name: text('Subir y leer', 'Upload and read'), exact: true });
  const row = () => page.getByRole('row').filter({ hasText: 'controlled.pdf' }); const abrirMas = async () => { const d = row().locator('details.qd-more'); if (await d.count() && !(await d.evaluate(e => e.open))) await d.locator('summary').click(); };
  const writes = () => calls.filter(c => !/^(list_|get_)/.test(c.action));
  const open = async url => { await page.goto(origin + url); await page.waitForLoadState('networkidle'); };
  try {
    await open('/archivos');
    if (kind === 'recovery') {
      await fileInput().setInputFiles({ name: 'unsupported.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic only') });
      assert(await upload().isDisabled()); assert.equal(writes().length, 0);
      await fileInput().setInputFiles({ name: 'controlled.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Synthetic fixture, not a valid rate document') });
      await page.getByRole('textbox', { name: text('RFx (opcional)', 'RFx (optional)'), exact: true }).fill('RFx-LOCAL');
      await upload().click();
      await page.getByText(text(/No se pudo subir el archivo \(503\)/, /Could not upload the file \(503\)/)).waitFor();
      assert.equal(uploads.length, 0); assert.equal(await fileInput().evaluate(el => el.files.length), 1);
      assert(await upload().isEnabled());
      await upload().click();
      await page.getByText(text(/El archivo se guardó, pero no se pudo leer/, /The file was saved but could not be read/)).waitFor();
      await row().waitFor();
      assert.equal(uploads.length, 1);
      assert.equal(await fileInput().evaluate(el => el.files.length), 0, 'Confirmed upload must clear the file picker even if interpretation fails');
      assert(await upload().isDisabled());
      await abrirMas(); await row().getByRole('button', { name: text('Leer', 'Read'), exact: true }).click();
      await page.getByText(text(/1 tarifa\(s\) listas para revisar/, /1 rate\(s\) ready for review/)).waitFor();
      assert.equal(staging.length, 1); assert.equal(staging[0].raw_upload_id, uploadId);
      await page.reload(); await page.waitForLoadState('networkidle');
      await abrirMas(); await row().getByRole('button', { name: text('Leer de nuevo', 'Read again'), exact: true }).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      await dialog.getByRole('button', { name: text('Cancelar', 'Cancel'), exact: true }).click();
      assert.equal(calls.filter(c => c.action === 'interpret_upload').length, 2);
      denyReprocess = true;
      await abrirMas(); await row().getByRole('button', { name: text('Leer de nuevo', 'Read again'), exact: true }).click();
      await dialog.getByRole('textbox').fill('Controlled reprocess; synthetic only');
      await dialog.getByRole('button', { name: text('Continuar', 'Continue'), exact: true }).click();
      await page.getByText(/Synthetic approved-rate protection/).waitFor();
      assert.equal(staging.length, 1); assert.equal(staging[0].status, 'pending_review');
      assert.equal(calls.at(-1).action, 'list_uploads');
      await page.screenshot({ path: path.join(output, `${lang}-interpretation-recovery.png`), fullPage: true });
      await page.locator('.bw header').first().getByRole('link', { name: text('Revisión de tarifas', 'Rate review'), exact: true }).click();
      await page.getByText('Controlled carrier', { exact: true }).first().waitFor();
      assert(calls.some(c => c.action === 'list_staging')); assert.equal(staging[0].raw_upload_id, uploadId);
      assert.equal(calls.filter(c => c.action === 'create_raw_upload').length, 2, 'One rejected upload and one confirmed upload; no upload for interpretation recovery');
      assert.equal(calls.filter(c => c.action === 'interpret_upload').length, 3);
    } else if (kind === 'viewer') {
      assert(await fileInput().isDisabled()); assert(await upload().isDisabled());
      await abrirMas(); for (const label of [text('Leer', 'Read'), text('Archivar', 'Archive'), text('Borrar', 'Delete')]) assert(await row().getByRole('button', { name: label, exact: true }).isDisabled());
      assert.equal(writes().length, 0);
    } else {
      await page.locator('button, [role=tab]').filter({ hasText: text(/^Ofertas del Bid Room/, /^Bid Room offers/) }).first().click();
      const snapshotRow = page.getByRole('row').filter({ hasText: snapshot.original_filename });
      await snapshotRow.waitFor();
      assert.equal(await snapshotRow.getByRole('button').count(), 1);
      assert.equal(await snapshotRow.getByRole('button', { name: text('Ver archivo', 'View file'), exact: true }).count(), 1);
      assert.equal(writes().length, 0);
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    assert(!calls.some(c => /send|approve|remove_|archive_|bulk_update|shortlist/.test(c.action)));
    await page.screenshot({ path: path.join(output, `${lang}-${kind}.png`), fullPage: true });
    return { lang, kind, syntheticWrites: writes().length, uploads: uploads.length, stagingRows: staging.length, productionRequests: 0, unexpected, errors };
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${lang}-${kind}-failure.png`), fullPage: true });
    throw error;
  } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const lang of probe ? ['es'] : ['es', 'en']) for (const kind of probe ? ['recovery'] : ['recovery', 'viewer', 'snapshot']) results.push(await scenario(browser, lang, kind));
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
