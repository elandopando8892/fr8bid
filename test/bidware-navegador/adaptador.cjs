/* Corre las pruebas de navegador de Bidware contra Fr8Bid sin reescribirlas.
 * Bidware llamaba a https://<proyecto>.supabase.co/functions/v1/<fn> desde el
 * navegador; Fr8Bid llama a /api/funcion?fn=<fn> y su servidor aplica paso.ts.
 * Este adaptador (node -r) envuelve cada ctx.route/page.route de la prueba:
 * una llamada a /api/funcion pasa primero por revisar() de paso.ts (las mismas
 * reglas que el servidor, con escrituras permitidas) y, si pasa, la prueba la
 * ve como la veía en Bidware. Lo que paso.ts rechaza se anota y se responde
 * como lo haría el servidor de Fr8Bid. */
const path = require('node:path');
const { buildSync } = require('esbuild');
const raiz = path.resolve(__dirname, '../..');
const salida = buildSync({ entryPoints: [path.join(raiz, 'src/servidor/paso.ts')], bundle: true, write: false, format: 'cjs', platform: 'node' });
const m = { exports: {} };
new Function('module', 'exports', 'require', salida.outputFiles[0].text)(m, m.exports, require);
const { revisar } = m.exports;
const SUPABASE = process.env.FIXTURE_SUPABASE || 'https://bidware-fixture.supabase.co';
const bloqueos = [];
const trazadas = [];
process.on('uncaughtException', async e => { for (const [i, p] of trazadas.entries()) { try { await p.screenshot({ path: path.join(raiz, `.test-output/navegador/falla-${i}.png`), fullPage: true }); } catch {} } console.error(e); process.exit(1); });
process.on('unhandledRejection', e => { throw e; });
process.on('exit', () => { if (bloqueos.length) console.log('# paso.ts de Fr8Bid rechazó: ' + JSON.stringify(bloqueos)); });

function traducir(route) {
  const real = route.request();
  const url = new URL(real.url());
  if (url.pathname !== '/api/funcion') return null;
  const fn = url.searchParams.get('fn') || '';
  const falsa = new Proxy(real, { get(t, k) {
    if (k === 'url') return () => `${SUPABASE}/functions/v1/${fn}`;
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
  const ruta = new Proxy(route, { get(t, k) {
    if (k === 'request') return () => falsa;
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
  return { fn, real, ruta };
}

function envolver(obj) {
  if (!obj || obj.__fr8bid) return obj;
  obj.__fr8bid = true;
  const route = obj.route.bind(obj);
  obj.route = (patron, handler, ...resto) => route(patron, async (r, req) => {
    const t = traducir(r);
    if (!t) return handler(r, req);
    let json = null; try { json = t.real.postDataJSON(); } catch {}
    const rechazo = revisar({ fn: t.fn, json, autorizacion: t.real.headers().authorization || null, modo: 'si' });
    if (rechazo) { bloqueos.push(`${t.fn}:${rechazo.body.action || ''}:${rechazo.body.code}`); return r.fulfill({ status: rechazo.status, json: rechazo.body }); }
    return handler(t.ruta, t.ruta.request());
  }, ...resto);
  if (process.env.FR8BID_TRAZA && obj.on && obj.screenshot) {
    obj.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('# consola:', m.text().slice(0, 300)); });
    obj.on('request', r => console.log('# pide:', r.method(), r.url().slice(0, 160)));
    const sitio = path.join(raiz, '.test-output/navegador');
    process.on('exit', () => {});
    trazadas.push(obj);
  }
  if (process.env.FR8BID_FOTO && obj.locator && obj.screenshot && !envolver.locProto) {
    const proto = Object.getPrototypeOf(obj.locator('body'));
    envolver.locProto = proto; let n = 0;
    for (const k of ['waitFor', 'click', 'fill', 'innerText', 'check', 'textContent', 'isDisabled']) {
      const orig = proto[k];
      proto[k] = async function (...a) { try { return await orig.apply(this, a); } catch (e) {
        try { const f = path.join(raiz, `.test-output/navegador/foto-${process.env.FR8BID_FOTO}-${n++}.png`); await this.page().screenshot({ path: f, fullPage: true }); console.log('# foto', f, String(this)); } catch {}
        throw e; } };
    }
  }
  if (obj.newPage) { const np = obj.newPage.bind(obj); obj.newPage = async (...a) => envolver(await np(...a)); }
  return obj;
}

const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
for (const tipo of ['chromium', 'firefox', 'webkit']) {
  const b = pw[tipo]; if (!b) continue;
  const launch = b.launch.bind(b);
  b.launch = async (...a) => {
    const browser = await launch(...a);
    const nc = browser.newContext.bind(browser);
    browser.newContext = async (...x) => envolver(await nc(...x));
    const np = browser.newPage.bind(browser);
    browser.newPage = async (...x) => { const p = await np(...x); envolver(p.context()); return envolver(p); };
    return browser;
  };
}
