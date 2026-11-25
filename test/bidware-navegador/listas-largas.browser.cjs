/* Prioridad 7 (25-nov-2026): Directorio con búsqueda primero y 25 por página; Listas agrupadas por familia.
 * Datos sintéticos; sin red de producción. Uso: test/bidware-navegador/correr.sh test/bidware-navegador/listas-largas.browser.cjs */
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3300';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const fotos = process.env.FR8BID_FOTOS;
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@heymarksman.com', app_metadata: { roles: ['operator'], permissions: ['vendors:manage'] } };
const vendors = [
  ...Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, vendor_name: `Carrier ${String(i + 1).padStart(2, '0')}`, primary_email: `c${i}@example.test`, base_stage: 'procurement', funnel_stage: 'targeted', effective_funnel_stage: 'targeted', status: 'inactive' })),
  { id: 'omega-t', vendor_name: 'Auto Fletes Omega', primary_email: 'omega@example.test', base_stage: 'procurement', funnel_stage: 'targeted', effective_funnel_stage: 'targeted', status: 'active' },
  { id: 'omega-s', vendor_name: 'Omega Norte', base_stage: 'sourcing', status: 'inactive' },
  { id: 'omega-a', vendor_name: 'Omega Viejo', base_stage: 'archived', status: 'inactive' },
];
const nombres = ['D2D Crossborder - Dry Van', 'D2D Crossborder - Dry Van · Ampliada', 'D2D Crossborder - Flatbed', 'Intramex - Reefer', 'Intramex - Reefer · Ampliada', 'MX Port Drayage - Chassis', 'O-I · 49 carriers · preparación de convocatoria'];
const templates = nombres.map((name, i) => ({ id: `tpl${i}`, name, lifecycle_status: 'active', version: 1, vendor_ids: [], member_count: i + 1, updated_at: '2026-10-25T12:00:00Z',
  description: name.endsWith('Ampliada') ? 'LISTA AMPLIADA creada el 25/10/2026 con OK de Jose.' : i === 2 ? 'Carriers flatbed revisados en la frontera.' : 'Creada el 25/10/2026 con OK de Jose.' }));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(({ user }) => {
    if (window.top !== window.self) return;
    localStorage.setItem('bidware.team.lang', 'es');
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, token_type: 'bearer' }));
  }, { user });
  const unexpected = [], errors = [];
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    const input = req.postDataJSON(); let body;
    switch (input.action) {
      case 'vendor_funnel': { const f = vendors.filter(v => v.base_stage === 'procurement'); body = { rows: f, stages: [{ key: 'targeted', count: f.length }] }; break; }
      case 'list_vendors': { const r = vendors.filter(v => input.ids ? input.ids.includes(v.id) : v.base_stage === input.base_stage); body = { rows: r, total: r.length }; break; }
      case 'list_carrier_list_templates': body = { rows: templates, total: templates.length, has_more: false }; break;
      default: unexpected.push(input.action); return route.fulfill({ status: 501, json: { error: 'Unexpected fixture action' } });
    }
    return route.fulfill({ json: structuredClone(body) });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  const foto = async n => { if (fotos) { fs.mkdirSync(fotos, { recursive: true }); await page.screenshot({ path: path.join(fotos, n), fullPage: true }); } };
  const filas = () => page.locator('table.crm-table tbody tr');

  // Directorio: 61 en Seleccionados → 25 por página.
  await page.goto(origin + '/crm'); await page.waitForLoadState('networkidle');
  await page.getByText('1–25 de 61').waitFor();
  assert.equal(await filas().count(), 25);
  await foto('directorio-pagina-1.png');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('26–50 de 61').waitFor();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('51–61 de 61').waitFor();
  assert.equal(await filas().count(), 11);
  assert.equal(await page.getByRole('button', { name: 'Siguiente', exact: true }).isDisabled(), true);
  // Seleccionar la página y luego todos los de la etapa.
  await page.getByRole('checkbox', { name: 'Seleccionar visibles', exact: true }).check();
  await page.locator('.crm-selection b', { hasText: '11 seleccionados' }).waitFor();
  await page.getByRole('button', { name: /Seleccionar los 61/ }).click();
  await page.locator('.crm-selection b', { hasText: '61 seleccionados' }).waitFor();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  // Buscar primero: la búsqueda está antes de las etapas, vuelve a la página 1 y dice dónde más hay.
  const buscar = page.getByRole('searchbox', { name: 'Buscar por nombre, dominio o correo…' });
  const orden = await page.evaluate(() => { const b = document.querySelector('.crm-search'), n = document.querySelector('.crm-stages'); return !!(b && n && (b.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)); });
  assert.equal(orden, true, 'la búsqueda va antes de las etapas');
  await buscar.fill('omega');
  assert.equal(await filas().count(), 1);
  assert.equal(await page.locator('.crm-paginas').count(), 0);
  await page.locator('.crm-otras').getByText(/También en/).waitFor();
  await foto('directorio-busqueda.png');
  await page.locator('.crm-otras').getByRole('button', { name: /\(1\)/ }).first().click();
  await page.getByRole('cell', { name: /Omega (Norte|Viejo)/ }).first().waitFor();
  assert.equal(await buscar.inputValue(), 'omega');
  await page.setViewportSize({ width: 390, height: 844 });
  await foto('directorio-telefono.png');
  const anchoCrm = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(anchoCrm <= 1, `Directorio sin desplazamiento horizontal en teléfono (${anchoCrm}px)`);
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Listas: agrupadas por familia, cerradas al entrar, sin bitácora repetida.
  await page.goto(origin + '/templates'); await page.waitForLoadState('networkidle');
  const familias = page.locator('.tpl-familia-boton');
  await familias.first().waitFor();
  assert.deepEqual((await familias.locator('b').allTextContents()), ['D2D Crossborder', 'Intramex', 'MX Port Drayage', 'Otras listas']);
  assert.equal(await page.locator('.tpl-name').count(), 0);
  await foto('listas-cerradas.png');
  await page.getByRole('button', { name: /D2D Crossborder/ }).click();
  assert.deepEqual(await page.locator('.tpl-name').allTextContents(), ['Dry Van', 'Dry VanAmpliada', 'Flatbed']);
  assert.equal(await page.getByText('LISTA AMPLIADA creada', { exact: false }).count(), 0);
  await page.getByText('Carriers flatbed revisados en la frontera.').waitFor();
  await foto('listas-abierta.png');
  // La ficha de una ampliada manda su nota a Historial.
  await page.locator('.tpl-name', { hasText: 'Ampliada' }).click();
  await page.locator('.tpl-side summary', { hasText: 'Historial' }).waitFor();
  // Con búsqueda se abren las familias con resultados.
  await page.getByPlaceholder('Buscar listas…').fill('reefer');
  assert.deepEqual(await page.locator('.tpl-name').allTextContents(), ['Reefer', 'ReeferAmpliada']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByPlaceholder('Buscar listas…').fill('');
  await foto('listas-telefono.png');
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(ancho <= 1, `sin desplazamiento horizontal en teléfono (${ancho}px)`);

  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  await browser.close();
  console.log('ok listas-largas');
})().catch(e => { console.error(e); process.exit(1); });
