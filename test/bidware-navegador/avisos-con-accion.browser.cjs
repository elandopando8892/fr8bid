// Prioridad 9 (26-nov-2026): vacíos, avisos y errores con una frase y una
// acción, y «Recordarle» en Solicitudes de shippers. Pantallas reales; Auth y
// API son de mentira. FR8BID_FOTOS=<carpeta> guarda capturas; con
// FR8BID_ANTES=1 solo toma las capturas (para correrla contra main).
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { transform } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3300';
const fotos = process.env.FR8BID_FOTOS ? path.resolve(process.env.FR8BID_FOTOS) : null;
const antes = process.env.FR8BID_ANTES === '1';
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const productionApi = fs.readFileSync('src/bidware/lib/api-client.ts', 'utf8');
const diasAtras = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

const proyecto = (n, extra) => ({
  id: uid(n), customer_id: uid(100 + n), title: 'Solicitud', customer_contact_name: null, customer_contact_email: null,
  opportunity_type: 'contract', status: 'rfi_sent', rfi_status: 'not started', notes: null, lane_count: 0,
  bid_room_event_id: null, bid_room_rfx_id: null, bid_room_status: null, due_date: null, ...extra,
});
const FILAS = [
  proyecto(1, { customer_name: 'Vidrio Industrial', customer_contact_name: 'Ana López', customer_contact_email: 'ana@vidrio.example', created_at: diasAtras(20), updated_at: diasAtras(20) }),
  proyecto(2, { customer_name: 'Aceros del Bajío', created_at: diasAtras(6), updated_at: diasAtras(6) }),
  proyecto(3, { customer_name: 'Empaques Norte', customer_contact_email: 'compras@empaques.example', rfi_status: 'draft', status: 'rfi_in_progress', created_at: diasAtras(1), updated_at: diasAtras(1) }),
];

async function abrir(browser, { movil = false, escenario = 'filas' } = {}) {
  const user = { id: uid(99), email: 'fixture@heymarksman.com', app_metadata: { roles: ['operator'] } };
  const context = await browser.newContext({ viewport: movil ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: fotos ? 2 : 1 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await context.addInitScript(({ user }) => {
    if (window.top !== window.self) return;
    localStorage.setItem('bidware.team.lang', 'es');
    localStorage.setItem('sb-bidware-fixture-auth-token', JSON.stringify({ user, access_token: 'fixture.token.only', refresh_token: 'fixture', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, token_type: 'bearer' }));
  }, { user });
  const cleanApi = (await transform(productionApi, { loader: 'ts', format: 'esm' })).code.replace(/from "@\/([^"\n]+)"/g, (_, p) => `from "/src/bidware/${p}.ts"`);
  const estado = { gmail: [], fallar: escenario === 'error', llamadas: [] };
  await context.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) {
      if (url.pathname === '/src/bidware/lib/api-client.ts') return route.fulfill({ contentType: 'application/javascript', body: cleanApi });
      return route.continue();
    }
    if (url.hostname === 'mail.google.com') { estado.gmail.push(url.toString()); return route.fulfill({ contentType: 'text/html', body: '<title>Gmail</title>' }); }
    if (url.hostname !== 'bidware-fixture.supabase.co') return route.abort();
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    const input = req.postDataJSON() || {};
    estado.llamadas.push(input.action);
    if (input.action === 'list_rfx_process_projects') {
      if (estado.fallar) { return route.fulfill({ status: 503, json: { error: 'Rateware no respondió a tiempo.' } }); }
      return route.fulfill({ json: { rows: escenario === 'vacio' ? [] : FILAS } });
    }
    if (input.action === 'create_rfx_rfi_magic_link') return route.fulfill({ json: { token: `tok-${input.project_id.slice(-1)}`, reused: true } });
    if (input.action === 'list_spot_request_quotes') return route.fulfill({ json: { rows: [] } });
    if (/^list_/.test(input.action)) return route.fulfill({ json: { rows: [] } });
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(origin + '/intake', { waitUntil: 'networkidle', timeout: 30000 });
  return { context, page, estado };
}

const foto = async (page, nombre) => {
  if (!fotos) return;
  fs.mkdirSync(fotos, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(fotos, `${antes ? 'antes' : 'despues'}-${nombre}.png`), fullPage: false });
};

(async () => {
  const browser = await chromium.launch();
  try {
    // Escritorio: filas con «Liga enviada».
    let { context, page, estado } = await abrir(browser);
    await page.getByText('Vidrio Industrial').waitFor();
    await foto(page, 'solicitudes-escritorio');
    if (!antes) {
      // Cuánto lleva sin respuesta, marcado a partir de 3 días.
      await page.locator('.intake-late', { hasText: '20 días sin respuesta' }).waitFor();
      // Con correo: el borrador queda en Gmail, nada se envía desde Fr8Bid.
      const fila = page.locator('tr', { hasText: 'Vidrio Industrial' });
      const [popup] = await Promise.all([context.waitForEvent('page'), fila.getByRole('button', { name: 'Recordarle' }).click()]);
      await popup.waitForLoadState().catch(() => undefined);
      await fila.getByText('El recordatorio quedó listo en Gmail. Revísalo y envíalo.').waitFor();
      const gmail = new URL(estado.gmail.at(-1));
      assert.equal(gmail.searchParams.get('to'), 'ana@vidrio.example');
      assert.match(gmail.searchParams.get('su'), /^Recordatorio/);
      assert.match(gmail.searchParams.get('body'), /^Hola Ana:/);
      assert.match(gmail.searchParams.get('body'), /customer-rfi\.html\?token=tok-1/);
      await popup.close();
      await fila.getByText(/^Recordado/).waitFor();
      // Sin correo: el recordatorio se copia para WhatsApp.
      const sin = page.locator('tr', { hasText: 'Aceros del Bajío' });
      await sin.getByRole('button', { name: 'Recordarle' }).click();
      await sin.getByText('Copiamos el recordatorio con su liga. Pégalo en WhatsApp o en un correo.').waitFor();
      assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Hola:[\s\S]*token=tok-2/);
      assert.equal(estado.llamadas.filter((a) => /^send_|^create_gmail/.test(a)).length, 0, 'Recordarle no envía nada');
      await foto(page, 'recordarle-escritorio');
    }
    await context.close();

    // Teléfono.
    ({ context, page } = await abrir(browser, { movil: true }));
    await page.getByText('Vidrio Industrial').waitFor();
    await foto(page, 'solicitudes-telefono');
    await context.close();

    // Lista vacía: el botón de arriba es la acción y el vacío lo señala (sin duplicarlo).
    ({ context, page } = await abrir(browser, { escenario: 'vacio' }));
    await page.getByText('Aún no hay solicitudes').waitFor();
    await foto(page, 'vacio-escritorio');
    if (!antes) {
      assert.equal(await page.locator('.empty button').count(), 0);
      await page.getByRole('button', { name: 'Nueva liga para el shipper' }).click();
      await page.locator('.intake-form').waitFor();
    }
    await context.close();

    // Error al leer: «Reintentar» vuelve a pedir la lista.
    ({ context, page, estado } = await abrir(browser, { escenario: 'error' }));
    await page.locator('.banner.error').waitFor();
    await foto(page, 'error-escritorio');
    if (!antes) {
      estado.fallar = false;
      await page.locator('.banner.error').getByRole('button', { name: 'Reintentar' }).click();
      await page.getByText('Vidrio Industrial').waitFor();
    }
    await context.close();
    console.log(antes ? 'capturas de antes listas' : 'avisos con acción: OK');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
