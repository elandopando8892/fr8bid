import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const { build } = viteRequire('esbuild');
const XLSX = require('xlsx');

// Decisión 4 del recorrido (23 y 24-nov-2026): el evento dice qué modelos comerciales
// acepta, el carrier solo ve esos en su Bid Room y elegir uno es opcional.
const store = new Map();
globalThis.location = { pathname: '/bid/fixture-token' };
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
Object.defineProperty(globalThis, 'navigator', { value: { languages: ['es-MX'], language: 'es-MX' }, configurable: true });

fs.mkdirSync('.test-output/carrier-modelos-aceptados-20261124', { recursive: true });
const outfile = '.test-output/carrier-modelos-aceptados-20261124/module.cjs';
await build({
  stdin: {
    contents: `export * from './src/bidware/features/bid-room/bid-template.ts';
      export * from './src/bidware/features/bid-room/bidroom.service.ts';
      export { setLang } from './src/bidware/i18n/language.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true, outfile, format: 'cjs', platform: 'node',
  plugins: [{ name: 'api-fixture', setup(b) {
    b.onResolve({ filter: /^@\/lib\/api-client$/ }, () => ({ path: 'api', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class ApiError extends Error{}; export const callRfxBidApi=()=>{throw Error("No API writes here")};', loader: 'js' }));
  } }],
});
const m = require('../../' + outfile);
test.afterEach(() => m.setLang('es'));

const acepta = (...accepted_models) => ({ status: 'open', rfx_master_package: { carrier_commercial_policy: { accepted_models } } });
const ruta = (event = { status: 'open' }, extra = {}) => ({ rfx_lane_id: 'lane-1', rfx_event_id: 'event-1', invitation_id: 'inv-1', invitation_token: 'secret-fixture-token', origin: 'Monterrey', destination: 'Dallas', lane_number: 1, currency: 'USD', event, ...extra });
const bytes = (book) => XLSX.write(book, { type: 'array', bookType: 'xlsx' });
const sheetOf = (book) => book.Sheets.Offers ?? book.Sheets.Ofertas;
const headersOf = (book) => XLSX.utils.sheet_to_json(sheetOf(book), { header: 1 })[0];
const valor = (book, label) => XLSX.utils.sheet_to_json(sheetOf(book), { header: 1, defval: '' })[1][headersOf(book).indexOf(label)];
function cell(book, label, value) {
  const column = headersOf(book).indexOf(label);
  assert.notEqual(column, -1, `columna ${label}`);
  sheetOf(book)[XLSX.utils.encode_cell({ r: 1, c: column })] = { t: typeof value === 'number' ? 'n' : 's', v: value };
}

test('el evento que no dice nada acepta los tres modelos del portal y la oferta nueva empieza sin elegir', () => {
  const lane = ruta();
  assert.deepEqual(m.acceptedModelKeys(lane), ['direct_cost_plus', 'carrier_share', 'xbf_buy_sell']);
  assert.equal(m.modelIsOptional(lane), true);
  const form = m.offerForm(lane);
  assert.equal(form.commercial_model, '');
  assert.equal(form.pct, '');
  assert.equal(m.billingNotice(form), null);
});

test('las claves del evento se leen como los modelos del portal: cost plus y fee plus son «Costo + margen»', () => {
  assert.deepEqual(m.acceptedModelKeys(ruta(acepta('brokerage', 'fee_plus'))), ['direct_cost_plus', 'xbf_buy_sell']);
  assert.deepEqual(m.acceptedModelKeys(ruta(acepta('cost_plus', 'fee_plus'))), ['direct_cost_plus']);
  assert.deepEqual(m.acceptedModelKeys(ruta(acepta('sell_share'))), ['carrier_share']);
  // Los cuatro, vacío o basura es «todos».
  for (const todos of [acepta('brokerage', 'cost_plus', 'sell_share', 'fee_plus'), acepta(), { rfx_master_package: { carrier_commercial_policy: { accepted_models: 'brokerage' } } }])
    assert.equal(m.acceptedModelKeys(ruta(todos)).length, 3);
  // La política bloqueada manda sobre la lista.
  const fijo = ruta({ status: 'open', rfx_master_package: { carrier_commercial_policy: { locked: true, model: 'brokerage', accepted_models: ['sell_share'] } } });
  assert.deepEqual(m.acceptedModelKeys(fijo), ['xbf_buy_sell']);
  assert.equal(m.offerForm(fijo).commercial_model, 'xbf_buy_sell');
});

test('con un solo modelo aceptado no hay nada que elegir: la oferta lleva ese', () => {
  const lane = ruta(acepta('sell_share'));
  assert.equal(m.modelIsOptional(lane), false);
  const form = m.offerForm(lane);
  assert.equal(form.commercial_model, 'carrier_share');
  const payload = m.offerPayload({ ...form, bid_rate: '1200' }, lane);
  assert.equal(payload.commercial_model, 'carrier_share');
  assert.equal(payload.carrier_share_pct, null);
  // Un porcentaje guardado con otro modelo no se arrastra al modelo del evento.
  const antes = ruta(acepta('brokerage'), { commercial_model: 'cost_plus', marksman_margin_pct: 3, bid_rate: 1000 });
  assert.deepEqual([m.offerForm(antes).commercial_model, m.offerForm(antes).pct], ['xbf_buy_sell', '']);
});

test('sin elegir viaja como null y sin porcentajes; un porcentaje sin modelo no se envía', () => {
  const lane = ruta(acepta('brokerage', 'cost_plus'));
  const form = { ...m.offerForm(lane), bid_rate: '1200' };
  assert.deepEqual(m.offerProblems(form), []);
  const payload = m.offerPayload(form, lane);
  assert.equal(payload.commercial_model, null);
  assert.equal(payload.marksman_margin_pct, null);
  assert.equal(payload.carrier_share_pct, null);
  assert.deepEqual(m.offerProblems({ ...form, pct: '3' }), ['Elige un modelo comercial para indicar un porcentaje.']);
  m.setLang('en');
  assert.deepEqual(m.offerProblems({ ...form, pct: '3' }), ['Choose a commercial model to enter a percentage.']);
});

test('una oferta que ya tiene modelo lo conserva y ya no ofrece «sin elegir»; si el evento dejó de aceptarlo, vuelve a sin elegir', () => {
  const propia = ruta(acepta('brokerage', 'sell_share'), { commercial_model: 'sell_share', carrier_share_pct: 4, bid_rate: 1000 });
  assert.equal(m.modelIsOptional(propia), false);
  assert.deepEqual([m.offerForm(propia).commercial_model, m.offerForm(propia).pct], ['carrier_share', '4']);
  const fuera = ruta(acepta('brokerage', 'cost_plus'), { commercial_model: 'sell_share', carrier_share_pct: 4, bid_rate: 1000 });
  assert.equal(m.modelIsOptional(fuera), true);
  assert.deepEqual([m.offerForm(fuera).commercial_model, m.offerForm(fuera).pct], ['', '']);
});

test('un modelo que el evento no acepta no sale del Bid Room, en español o en inglés', () => {
  const lane = ruta(acepta('brokerage', 'cost_plus'));
  const form = { ...m.offerForm(lane), bid_rate: '1200', commercial_model: 'carrier_share' };
  assert.throws(() => m.offerPayload(form, lane), /Este evento no acepta ese modelo comercial\. Acepta: Costo \+ margen, XBF compra-venta\./);
  m.setLang('en');
  assert.throws(() => m.offerPayload(form, lane), /This event does not accept that commercial model\. It accepts: Cost \+ margin, XBF buy-sell\./);
});

test('Excel: la celda del modelo sale vacía, vacía se importa sin elegir y la ayuda lista solo los modelos aceptados', async () => {
  const lane = ruta(acepta('brokerage', 'cost_plus'));
  const book = await m.buildBidTemplate([lane]);
  assert.equal(valor(book, 'Modelo comercial'), '');
  const ayuda = JSON.stringify(book.Sheets[book.SheetNames[1]]);
  assert.ok(ayuda.includes('Costo + margen') && ayuda.includes('XBF compra-venta'));
  assert.ok(!ayuda.includes('Carrier comparte facturación'), 'un modelo que el evento no acepta no se explica');
  assert.ok(ayuda.includes('Modelo comercial: opcional'));
  cell(book, 'Enviar ruta', 'Sí'); cell(book, 'Tarifa carrier', 1200);
  const [offer] = await m.parseBidTemplate(bytes(book), [lane]);
  assert.equal(offer.form.commercial_model, '');
  assert.equal(m.displayOfferValue('commercial_model', offer.form), 'Sin elegir');
  assert.equal(m.displayOfferValue('pct', offer.form), 'Sin dato');
  assert.equal(m.offerPayload(offer.form, lane).commercial_model, null);
  // Un porcentaje sin modelo se detiene con su fila.
  cell(book, 'Porcentaje', 3);
  await assert.rejects(m.parseBidTemplate(bytes(book), [lane]), /Fila 2: Elige un modelo comercial para indicar un porcentaje\./);
});

test('Excel: un modelo aceptado se importa y uno que el evento no acepta se rechaza diciendo cuáles sí', async () => {
  const lane = ruta(acepta('brokerage', 'cost_plus'));
  const book = await m.buildBidTemplate([lane]);
  cell(book, 'Enviar ruta', 'Sí'); cell(book, 'Tarifa carrier', 1200); cell(book, 'Modelo comercial', 'XBF compra-venta'); cell(book, 'Porcentaje', 10);
  const [offer] = await m.parseBidTemplate(bytes(book), [lane]);
  assert.deepEqual([offer.form.commercial_model, offer.form.pct], ['xbf_buy_sell', '10']);
  cell(book, 'Modelo comercial', 'Carrier comparte facturación'); cell(book, 'Porcentaje', '');
  await assert.rejects(m.parseBidTemplate(bytes(book), [lane]), /Fila 2: Modelo comercial: este evento no acepta ese modelo\. Acepta: Costo \+ margen, XBF compra-venta\./);
  m.setLang('en');
  await assert.rejects(m.parseBidTemplate(bytes(book), [lane]), /Row 2: Modelo comercial: this event does not accept that model\. It accepts: Cost \+ margin, XBF buy-sell\./);
});

test('Excel: con un solo modelo aceptado la celda trae ese modelo y vacía lo conserva', async () => {
  const lane = ruta(acepta('sell_share'));
  const book = await m.buildBidTemplate([lane]);
  assert.equal(valor(book, 'Modelo comercial'), 'Carrier comparte facturación');
  cell(book, 'Enviar ruta', 'Sí'); cell(book, 'Tarifa carrier', 1200); cell(book, 'Modelo comercial', '');
  const [offer] = await m.parseBidTemplate(bytes(book), [lane]);
  assert.equal(offer.form.commercial_model, 'carrier_share');
});
