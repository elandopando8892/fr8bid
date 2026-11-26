/* Prioridad 8 (26-nov-2026): perfil del carrier, perfil del shipper y solicitud que leen documentos.
 * Datos sintéticos; /api/documentos se responde aquí (no hay IA ni red de producción).
 * Uso: test/bidware-navegador/correr.sh test/bidware-navegador/perfiles-leen-documentos.browser.cjs
 * FR8BID_FOTOS=<carpeta> guarda capturas; con FR8BID_ANTES=1 solo toma las de cada página al abrir (para main). */
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3300';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const fotos = process.env.FR8BID_FOTOS;
const soloAntes = process.env.FR8BID_ANTES === '1';
const sufijo = soloAntes ? 'antes' : 'despues';

const vendor = { id: 'v1', vendor_name: 'Transportes del Norte', primary_email: 'trafico@tdn.example', contact_name: 'Ana Ruiz', profile_data: { general: { full_name: 'Ana Ruiz' } } };
const shipper = { id: 's1', shipper_name: 'Vidrio Industrial', legal_name: null, domain: null, website: null, industry: null, headquarters_city: null, headquarters_state: null, headquarters_country: null, profile_data: {} };
const proyecto = { id: 'p1', title: 'Programa 2027', customer_name: 'Vidrio Industrial', customer_contact_name: 'Luis Pérez', opportunity_type: 'rfq', due_date: null, status: 'open' };

const leidoCarrier = {
  resumen: 'Constancia de situación fiscal y autoridad MC de Transportes del Norte.',
  campos: [
    { clave: 'identity.legal_name', valores: ['Transportes del Norte S.A. de C.V.'], cita: 'csf.pdf: Denominación/Razón Social' },
    { clave: 'identity.rfc', valores: ['TNO010101AB1'], cita: 'csf.pdf: RFC TNO010101AB1' },
    { clave: 'identity.fiscal_address', valores: ['Av. Constitución 100, Monterrey, NL 64000'], cita: 'csf.pdf: Domicilio' },
    { clave: 'identity.usdot_number', valores: ['3456789'], cita: 'mc.pdf: USDOT 3456789' },
    { clave: 'identity.mc_number', valores: ['MC-123456'], cita: 'mc.pdf: MC-123456' },
    { clave: 'general.company_type', valores: ['Persona Moral'], cita: 'csf.pdf: Régimen General de Ley Personas Morales' },
    { clave: 'company.primary_email', valores: ['contabilidad@tdn.example'], cita: 'csf.pdf: correo' },
  ],
  rutas: [],
  dudas: ['La constancia tiene fecha de 2025: confirma que el domicilio siga igual.'],
};
const leidoShipper = {
  resumen: 'W-9 de Vidrio Industrial.',
  campos: [
    { clave: 'shipper.legal_name', valores: ['Vidrio Industrial de México S.A. de C.V.'], cita: 'w9.pdf: Name' },
    { clave: 'billing.usa_ein', valores: ['12-3456789'], cita: 'w9.pdf: EIN' },
    { clave: 'shipper.headquarters_city', valores: ['Monterrey'], cita: 'w9.pdf: City' },
  ],
  rutas: [],
  dudas: [],
};
const ruta = (o, d, n) => ({ campos: [
  { clave: 'origin', valores: [o], cita: 'correo pegado' }, { clave: 'destination', valores: [d], cita: 'correo pegado' },
  { clave: 'equipment', valores: ['Dry Van'], cita: 'correo pegado' }, ...(n ? [{ clave: 'loads', valores: [n], cita: `${n} cargas por semana` }] : []),
  { clave: 'commodity', valores: ['Vidrio'], cita: 'correo pegado' }, { clave: 'weight', valores: ['40000'], cita: '40,000 lb' },
] });
const leidoSolicitud = { resumen: 'Tres rutas semanales desde enero.', campos: [], rutas: [ruta('Monterrey, NL, MX', 'Laredo, TX, US', '5'), ruta('Saltillo, COAH, MX', 'Dallas, TX, US', '3'), ruta('Querétaro, QRO, MX', 'Laredo, TX, US', '')], dudas: ['La tercera ruta no dice cuántas cargas por semana.'] };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const unexpected = [], errors = [], lecturas = [], envios = [];
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin && url.pathname === '/api/documentos') {
      const input = req.postDataJSON();
      lecturas.push(input);
      const lectura = input.origen === 'perfil_carrier' ? leidoCarrier : input.origen === 'perfil_shipper' ? leidoShipper : leidoSolicitud;
      return route.fulfill({ json: { lectura } });
    }
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'bidware-fixture.supabase.co') { unexpected.push(url.origin); return route.abort(); }
    const input = req.postDataJSON(); let body;
    switch (input.action) {
      case 'get_profile':
        body = url.pathname.endsWith('carrier-profile-api')
          ? { request: { id: 'r1', status: 'active', expires_at: '2026-12-31T00:00:00Z' }, vendor, support_tickets: [] }
          : { request: { id: 'r2', status: 'active', expires_at: '2026-12-31T00:00:00Z' }, shipper, contacts: [], locations: [] };
        break;
      case 'submit_profile': envios.push(input); body = { submitted: true, vendor: { ...vendor, ...input.vendor, profile_data: { ...vendor.profile_data, ...input.profile_data } }, support_tickets: [] }; break;
      case 'get_customer_rfi': body = { project: proyecto, link: { id: 'l1', status: 'active', expires_at: null, submitted_at: null }, submission: null, lanes: [] }; break;
      case 'save_customer_rfi': body = { saved: true }; break;
      case 'customer_rfi_search_locations': body = { rows: [] }; break;
      default: unexpected.push(input.action); return route.fulfill({ status: 501, json: { error: 'Unexpected fixture action' } });
    }
    return route.fulfill({ json: structuredClone(body) });
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  const foto = async n => { if (fotos) { await page.waitForTimeout(400); fs.mkdirSync(fotos, { recursive: true }); await page.screenshot({ path: path.join(fotos, n), fullPage: true }); } };
  const telefono = async n => { await page.setViewportSize({ width: 390, height: 844 }); await foto(n);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(ancho <= 1, `${n}: sin desplazamiento horizontal en teléfono (${ancho}px)`);
    await page.setViewportSize({ width: 1440, height: 1000 }); };
  const pdf = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% sintético\n') });

  // ——— Perfil del carrier ———
  await page.goto(origin + '/carrier-profile.html?token=tok-carrier&lang=es'); await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: 'Transportes del Norte' }).waitFor();
  await foto(`carrier-${sufijo}-escritorio.png`);
  if (soloAntes) await telefono(`carrier-${sufijo}-telefono.png`);
  if (!soloAntes) {
    const lector = page.locator('section.lector');
    await lector.getByRole('heading', { name: /Sube tus documentos/ }).waitFor();
    assert.equal(await lector.getByRole('button', { name: 'Leer', exact: true }).isDisabled(), true, 'sin documento no se lee');
    await lector.locator('input[type=file]').setInputFiles([pdf('csf.pdf'), pdf('mc.pdf')]);
    await lector.getByText('csf.pdf').waitFor();
    await telefono('carrier-despues-telefono.png');
    await lector.getByRole('button', { name: 'Leer', exact: true }).click();
    await lector.getByRole('heading', { name: 'Revisa lo que leímos' }).waitFor();
    assert.equal(lecturas[0].origen, 'perfil_carrier');
    assert.equal(lecturas[0].token, 'tok-carrier');
    assert.equal(lecturas[0].adjuntos.length, 2);
    assert.ok(lecturas[0].campos.some(c => c.clave === 'identity.rfc'));
    // El correo ya guardado no se cambia sin que la persona lo marque.
    const correo = lector.getByRole('checkbox', { name: /Correo/ });
    assert.equal(await correo.isChecked(), false, 'lo que cambia un dato guardado empieza sin marcar');
    await lector.getByText(/Ahora: trafico@tdn\.example/).waitFor();
    await lector.getByText(/confirma que el domicilio/).waitFor();
    await foto('carrier-despues-revisa-escritorio.png');
    await telefono('carrier-despues-revisa-telefono.png');
    await lector.getByRole('button', { name: 'Usar estos 6 datos' }).click();
    await page.getByText('Llenamos 6 datos en 2 pasos. Revísalos y guarda.').waitFor();
    assert.equal(await page.getByRole('textbox', { name: /^Correo/ }).inputValue(), 'trafico@tdn.example');
    // Paso «Identidad legal» trae lo leído, y se guarda con el botón de siempre.
    await page.locator('nav.profile-steps').getByRole('button', { name: /Identidad legal/ }).click();
    assert.equal(await page.getByRole('textbox', { name: 'RFC', exact: true }).inputValue(), 'TNO010101AB1');
    assert.equal(await page.getByLabel(/Número USDOT/).inputValue(), '3456789');
    await page.getByRole('button', { name: /Guardar y continuar/ }).click();
    await page.getByText('Perfil guardado. Gracias.').or(page.getByText('Guardado.')).first().waitFor();
    assert.equal(envios[0].profile_data.identity.rfc, 'TNO010101AB1');
    assert.equal(envios[0].profile_data.general.company_type, 'Persona Moral');
    assert.equal(envios[0].vendor.primary_email, undefined, 'el correo no marcado no viaja');
  }

  // ——— Perfil del shipper ———
  await page.goto(origin + '/shipper-profile.html?token=tok-shipper&lang=es'); await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: 'Vidrio Industrial' }).first().waitFor();
  await foto(`shipper-${sufijo}-escritorio.png`);
  if (soloAntes) await telefono(`shipper-${sufijo}-telefono.png`);
  if (!soloAntes) {
    const lector = page.locator('section.lector');
    await lector.locator('input[type=file]').setInputFiles([pdf('w9.pdf')]);
    await lector.getByRole('button', { name: 'Leer', exact: true }).click();
    await lector.getByRole('button', { name: 'Usar estos 3 datos' }).click();
    await page.getByText('Llenamos 3 datos. Revísalos paso por paso y guarda.').waitFor();
    assert.equal(await page.getByRole('textbox', { name: /^Razón social/ }).inputValue(), 'Vidrio Industrial de México S.A. de C.V.');
    await telefono('shipper-despues-telefono.png');
  }

  // ——— Solicitud del shipper ———
  await page.goto(origin + '/rfi/tok-solicitud?lang=es'); await page.waitForLoadState('networkidle');
  await page.locator('.sr-form').waitFor();
  await foto(`solicitud-${sufijo}-escritorio.png`);
  if (soloAntes) await telefono(`solicitud-${sufijo}-telefono.png`);
  if (!soloAntes) {
    const lector = page.locator('section.lector');
    await lector.getByRole('textbox', { name: 'Correo o mensaje' }).fill('Necesitamos tarifa: Monterrey a Laredo 5 por semana, Saltillo a Dallas 3, Querétaro a Laredo. Caja seca, vidrio, 40,000 lb.');
    await lector.getByRole('button', { name: 'Leer', exact: true }).click();
    await lector.getByText(/Monterrey.*→.*Laredo/).first().waitFor();
    await lector.getByText('Falta volumen').waitFor();
    assert.equal(lecturas.at(-1).origen, 'solicitud');
    assert.ok(lecturas.at(-1).camposRuta.some(c => c.clave === 'origin'));
    await foto('solicitud-despues-revisa-escritorio.png');
    await telefono('solicitud-despues-revisa-telefono.png');
    await lector.getByRole('button', { name: 'Agregar estas 3 rutas' }).click();
    await page.getByText(/Agregamos 3 rutas/).waitFor();
    assert.equal(await page.locator('.sr-form').getByText(/Saltillo/).count() > 0, true);
    await foto('solicitud-despues-rutas-escritorio.png');
  }

  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('perfiles-leen-documentos: ok');
})();
