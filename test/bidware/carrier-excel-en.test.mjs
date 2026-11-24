import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const { build } = viteRequire('esbuild');
const XLSX = require('xlsx');

// La plantilla se descarga en el idioma del Bid Room y se importa en cualquiera de los dos.
const store = new Map();
globalThis.location = { pathname: '/bid/fixture-token' };
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
Object.defineProperty(globalThis, 'navigator', { value: { languages: ['es-MX'], language: 'es-MX' }, configurable: true });

fs.mkdirSync('.test-output/carrier-excel-en-20261124', { recursive: true });
const outfile = '.test-output/carrier-excel-en-20261124/module.cjs';
await build({
  stdin: {
    contents: `export * from './src/bidware/features/bid-room/bid-template.ts';
      export { setLang, getLang } from './src/bidware/i18n/language.ts';
      export { excelCopy } from './src/bidware/i18n/bid-room-excel.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true, outfile, format: 'cjs', platform: 'node',
  plugins: [{ name: 'api-fixture', setup(b) {
    b.onResolve({ filter: /^@\/lib\/api-client$/ }, () => ({ path: 'api', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class ApiError extends Error{}; export const callRfxBidApi=()=>{throw Error("No API writes in parser")};', loader: 'js' }));
  } }],
});
const m = require('../../' + outfile);
const lane = { rfx_lane_id: 'lane-1', rfx_event_id: 'event-1', invitation_id: 'inv-1', invitation_token: 'secret-fixture-token', origin: 'Monterrey', destination: 'Dallas', lane_number: 1, event: { status: 'open' }, currency: 'USD' };
const bytes = (book) => XLSX.write(book, { type: 'array', bookType: 'xlsx' });
const sheetOf = (book) => book.Sheets.Offers ?? book.Sheets.Ofertas;
const headersOf = (book) => XLSX.utils.sheet_to_json(sheetOf(book), { header: 1 })[0];
function cell(book, label, value, row = 1) {
  const column = headersOf(book).indexOf(label);
  assert.notEqual(column, -1, `columna ${label}`);
  sheetOf(book)[XLSX.utils.encode_cell({ r: row, c: column })] = { t: typeof value === 'number' ? 'n' : 's', v: value };
}
/** Builds a template in a language and leaves the Bid Room in `after`. */
async function template(lang, l = lane, after = lang) { m.setLang(lang); const book = await m.buildBidTemplate([l]); m.setLang(after); return book; }
const parse = (book, lanes = [lane]) => m.parseBidTemplate(bytes(book), lanes);
test.afterEach(() => m.setLang('es'));

test('cada columna tiene un nombre único en cada idioma y el español no cambió', () => {
  assert.deepEqual(m.TEMPLATE_HEADERS.slice(0, 11), ['Evento ID', 'Invitación ID', 'Ruta ID', 'Ruta #', 'Origen', 'Destino', 'Equipo', 'Base de oferta', 'Enviar ruta', 'Tarifa carrier', 'Moneda']);
  for (const lang of ['es', 'en']) {
    const headers = m.templateHeaders(lang);
    assert.equal(headers.length, 30);
    assert.equal(new Set(headers).size, 30, `encabezados repetidos en ${lang}`);
  }
  assert.equal(m.templateHeaders('es').filter((h) => m.templateHeaders('en').includes(h)).length, 0, 'un encabezado igual en ambos idiomas permitiría mezclar');
});

test('en inglés la plantilla sale completa en inglés, sin credenciales', async () => {
  const book = await template('en');
  assert.deepEqual(book.SheetNames, ['Offers', 'Instructions and models']);
  assert.deepEqual(headersOf(book), m.templateHeaders('en'));
  const content = JSON.stringify(book);
  for (const expected of ['Send lane', 'Carrier rate', 'Cost + margin', 'Carrier shares billing', 'XBF buy-sell', 'How to answer', '5 business days']) assert.ok(content.includes(expected), expected);
  for (const spanish of ['Enviar ruta', 'Tarifa carrier', 'Costo + margen', 'Cómo responder', 'días hábiles', 'Sí']) assert.ok(!content.includes(spanish), spanish);
  assert.ok(!content.includes('secret-fixture-token'));
  await assert.rejects(parse(book), /Write Yes in Send lane/);
});

test('una plantilla en inglés se importa completa, con el Bid Room en inglés o en español', async () => {
  for (const [model, pct] of [['direct_cost_plus', 3], ['carrier_share', 4], ['xbf_buy_sell', 12]]) {
    const l = { ...lane, commercial_model: model, marksman_margin_pct: pct, carrier_share_pct: pct, bid_rate: 1100, weekly_capacity: 3, transit_days: 2, valid_through: '2099-12-31', equipment_available: true, deadhead_distance: 0, deadhead_unit: 'km', eta_pickup: '2099-06-01T10:00:00Z', eta_delivery: '2099-06-03T10:00:00Z', mirror_account_enabled: true, best_alternative_offered: true, alternative_equipment: 'Reefer', alternative_units: 2, alternative_notes: 'Terms', notes: 'Team drivers' };
    for (const ui of ['en', 'es']) {
      const book = await template('en', l, ui);
      cell(book, 'Send lane', 'Yes'); cell(book, 'Carrier rate', 1200);
      const [offer] = await parse(book, [l]);
      assert.equal(offer.form.bid_rate, '1200'); assert.equal(offer.form.commercial_model, model); assert.equal(offer.form.pct, String(pct));
      assert.equal(offer.form.equipment_available, 'yes'); assert.equal(offer.form.mirror_account_enabled, true); assert.equal(offer.form.best_alternative_offered, true);
      assert.equal(offer.form.alternative_notes, 'Terms'); assert.equal(offer.form.notes, 'Team drivers');
      assert.equal(m.currentOfferForSend(offer, [l]).invitation_token, lane.invitation_token);
    }
  }
});

test('una plantilla en español se sigue importando con el Bid Room en inglés, y los avisos salen en inglés', async () => {
  const book = await template('es', lane, 'en');
  cell(book, 'Enviar ruta', 'Sí'); cell(book, 'Tarifa carrier', 1200); cell(book, 'Modelo comercial', 'Carrier comparte facturación');
  const [offer] = await parse(book);
  assert.equal(offer.form.commercial_model, 'carrier_share');
  assert.equal(m.displayOfferValue('pct', offer.form), '3 % (default)');
  assert.equal(m.displayOfferValue('pct', { ...offer.form, pct: '4' }), '4 %');
  assert.equal(m.displayOfferValue('commercial_model', offer.form), 'Carrier shares billing');
  assert.equal(m.displayOfferValue('best_final', offer.form), 'No');
  assert.equal(m.displayOfferValue('notes', offer.form), 'No data');
  assert.deepEqual(m.offerColumns().slice(0, 2).map(([, label]) => label), ['Carrier rate', 'Currency']);
  // El aviso nombra la columna como viene en el archivo del carrier.
  cell(book, 'Tarifa carrier', '1,200');
  await assert.rejects(parse(book), /^Error: Row 2: Tarifa carrier: use a positive number or zero/);
  cell(book, 'Tarifa carrier', 1200); cell(book, 'Enviar ruta', 'No');
  await assert.rejects(parse(book), /Write Yes in Enviar ruta/);
});

test('el modelo se acepta por su nombre en cualquiera de los dos idiomas o por su clave', async () => {
  for (const [written, key] of [['Carrier shares billing', 'carrier_share'], ['carrier comparte facturacion', 'carrier_share'], ['XBF buy-sell', 'xbf_buy_sell'], ['direct_cost_plus', 'direct_cost_plus']]) {
    const book = await template('en');
    cell(book, 'Send lane', 'yes'); cell(book, 'Carrier rate', 1200); cell(book, 'Commercial model', written); cell(book, 'Percentage', '');
    const [offer] = await parse(book);
    assert.equal(offer.form.commercial_model, key);
  }
  const book = await template('en');
  cell(book, 'Send lane', 'Yes'); cell(book, 'Carrier rate', 1200); cell(book, 'Commercial model', 'random');
  await assert.rejects(parse(book), /Row 2: Commercial model: unknown model; use one of the models in the Instructions and models sheet or leave the cell empty\./);
  cell(book, 'Commercial model', 'Cost + margin'); cell(book, 'Percentage', '');
  const [offer] = await parse(book);
  assert.equal(m.displayOfferValue('pct', offer.form), '3 % (default)');
});

test('los encabezados no se mezclan entre idiomas ni cambian de hoja', async () => {
  const mixed = await template('en');
  sheetOf(mixed).J1 = { t: 's', v: 'Tarifa carrier' };
  await assert.rejects(parse(mixed), /The columns do not match the template/);
  // Hoja en inglés con encabezados en español: no es ninguna de las dos plantillas.
  const swapped = await template('es', lane, 'en');
  swapped.Sheets.Offers = swapped.Sheets.Ofertas; delete swapped.Sheets.Ofertas; swapped.SheetNames[0] = 'Offers';
  await assert.rejects(parse(swapped), /The columns do not match the template/);
  const none = await template('en');
  none.Sheets.Quotes = none.Sheets.Offers; delete none.Sheets.Offers; none.SheetNames[0] = 'Quotes';
  await assert.rejects(parse(none), /The Offers sheet is missing/);
});

test('las mismas protecciones valen para la plantilla en inglés', async () => {
  const fill = async (l = lane) => { const book = await template('en', l); cell(book, 'Send lane', 'Yes'); cell(book, 'Carrier rate', 1200); return book; };
  for (const [label, value, expected] of [['Valid through', '2099-02-31', /Valid through: invalid date/], ['Currency', 'dollars', /Currency: use three letters/], ['GPS mirror account', 'maybe', /GPS mirror account: write Yes or No/], ['Deadhead unit', 'm', /Deadhead unit: use mi or km/]]) {
    const book = await fill(); cell(book, label, value); await assert.rejects(parse(book), expected);
  }
  const eta = await fill(); cell(eta, 'Pickup ETA', '2099-06-03T10:00'); cell(eta, 'Delivery ETA', '2099-06-01T10:00'); await assert.rejects(parse(eta), /must be after the pickup/);
  const formula = await fill(); sheetOf(formula).J2 = { t: 'n', v: 1200, f: '600*2' }; await assert.rejects(parse(formula), /Cell J2: replace formulas/);
  const foreign = await fill(); cell(foreign, 'Invitation ID', 'another'); await assert.rejects(parse(foreign), /does not belong to this invitation/);
  const alternative = await fill(); cell(alternative, 'Alternative equipment', 'Reefer'); await assert.rejects(parse(alternative), /write Yes in Alternative offered/);
  const stale = await fill(); await assert.rejects(parse(stale, [{ ...lane, bid_rate: 900 }]), /changed since the download/);
  const [offer] = await parse(await fill());
  assert.throws(() => m.currentOfferForSend(offer, [{ ...lane, bid_rate: 500 }]), /Lane 1: the offer, its access or the event's models changed/);
  // Solo compra-venta fija: sin columnas de modelo ni porcentaje, también en inglés.
  const locked = { ...lane, event: { status: 'open', carrier_commercial_policy: { locked: true, model: 'brokerage' } } };
  const lockedBook = await template('en', locked);
  assert.equal(headersOf(lockedBook).length, 28);
  assert.ok(!headersOf(lockedBook).includes('Percentage') && !headersOf(lockedBook).includes('Commercial model'));
  assert.ok(JSON.stringify(lockedBook).includes('XBF buy-sell is fixed'));
  cell(lockedBook, 'Send lane', 'Yes'); cell(lockedBook, 'Carrier rate', 1200);
  const [lockedOffer] = await parse(lockedBook, [locked]);
  assert.equal(lockedOffer.form.bid_rate, '1200'); assert.equal(lockedOffer.form.commercial_model, 'xbf_buy_sell');
  // Una plantilla completa no sirve para una ruta de compra-venta fija a medias: faltan o sobran columnas.
  const partial = await template('en', locked);
  sheetOf(partial).AC1 = { t: 's', v: 'Percentage' }; sheetOf(partial)['!ref'] = 'A1:AC2';
  await assert.rejects(parse(partial, [locked]), /The columns do not match the template/);
});
