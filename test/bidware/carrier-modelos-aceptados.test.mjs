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

// Revisión escéptica del 24-nov: «un solo modelo» se cuenta en modelos de Rateware, no en etiquetas del portal.
test('cost plus y fee plus son una sola etiqueta pero dos modelos: la oferta nueva sigue sin elegir', () => {
  const lane = ruta(acepta('cost_plus', 'fee_plus'));
  assert.deepEqual(m.acceptedModelKeys(lane), ['direct_cost_plus']);
  assert.equal(m.eventModelKey(lane), null, 'el evento no fijó un modelo');
  assert.equal(m.modelIsOptional(lane), true);
  const form = { ...m.offerForm(lane), bid_rate: '1200' };
  assert.equal(form.commercial_model, '');
  assert.equal(m.offerPayload(form, lane).commercial_model, null);
  // Elegir la única etiqueta sí es una elección del carrier.
  assert.equal(m.offerPayload({ ...form, commercial_model: 'direct_cost_plus' }, lane).commercial_model, 'direct_cost_plus');
  // Con un solo modelo de Rateware sí es el del evento, también bajo candado.
  assert.equal(m.eventModelKey(ruta(acepta('fee_plus'))), 'direct_cost_plus');
  assert.equal(m.eventModelKey(ruta({ status: 'open', rfx_master_package: { carrier_commercial_policy: { locked: true, model: 'brokerage' } } })), 'xbf_buy_sell');
  assert.equal(m.eventModelKey(ruta()), null);
});

test('un modelo que el evento retiró no se cambia en silencio: el carrier lo lee antes de reenviar', () => {
  const uno = ruta(acepta('brokerage'), { commercial_model: 'sell_share', carrier_share_pct: 4, bid_rate: 1000 });
  assert.equal(m.droppedModelKey(uno), 'carrier_share');
  assert.equal(m.offerForm(uno).commercial_model, 'xbf_buy_sell');
  assert.equal(m.droppedModelNotice(uno), 'Tu oferta tenía el modelo «Carrier comparte facturación», que este evento ya no acepta. Si la reenvías, queda con «XBF compra-venta», el modelo del evento.');
  const varios = ruta(acepta('brokerage', 'cost_plus'), { commercial_model: 'sell_share', carrier_share_pct: 4, bid_rate: 1000 });
  assert.equal(m.offerForm(varios).commercial_model, '');
  assert.equal(m.droppedModelNotice(varios), 'Tu oferta tenía el modelo «Carrier comparte facturación», que este evento ya no acepta. Elige otro o déjalo sin elegir.');
  m.setLang('en');
  assert.equal(m.droppedModelNotice(uno), "Your offer had the “Carrier shares billing” model, which this event no longer accepts. If you resend it, it will carry “XBF buy-sell”, the event's model.");
  assert.equal(m.droppedModelNotice(varios), 'Your offer had the “Carrier shares billing” model, which this event no longer accepts. Choose another one or leave it not chosen.');
});

test('sin modelo retirado no hay aviso: oferta nueva, modelo vigente o misma etiqueta', () => {
  assert.equal(m.droppedModelNotice(ruta(acepta('brokerage', 'cost_plus'))), null);
  assert.equal(m.droppedModelNotice(ruta(acepta('brokerage', 'sell_share'), { commercial_model: 'sell_share', bid_rate: 1000 })), null);
  // fee plus guardado y evento que acepta cost plus: para el carrier sigue siendo «Costo + margen».
  assert.equal(m.droppedModelNotice(ruta(acepta('cost_plus'), { commercial_model: 'fee_plus', bid_rate: 1000 })), null);
  // Bajo candado, la oferta que ya es compra-venta o que no tiene modelo tampoco tiene nada que avisar.
  const candado = { status: 'open', rfx_master_package: { carrier_commercial_policy: { locked: true, model: 'brokerage' } } };
  assert.equal(m.droppedModelNotice(ruta(candado, { commercial_model: 'brokerage', bid_rate: 1000 })), null);
  assert.equal(m.droppedModelNotice(ruta(candado, { bid_rate: 1000 })), null);
});

// Pasada final de la revisión escéptica (24-nov).
test('el candado de compra-venta también avisa: la oferta que tenía otro modelo lo lee antes de reenviar', () => {
  const fijo = ruta({ status: 'open', rfx_master_package: { carrier_commercial_policy: { locked: true, model: 'brokerage' } } }, { commercial_model: 'sell_share', carrier_share_pct: 4, bid_rate: 1000 });
  assert.equal(m.droppedModelKey(fijo), 'carrier_share');
  // El formulario ya sale con compra-venta y sin porcentaje, que es lo único que el candado deja enviar.
  assert.deepEqual([m.offerForm(fijo).commercial_model, m.offerForm(fijo).pct], ['xbf_buy_sell', '']);
  assert.doesNotThrow(() => m.offerPayload(m.offerForm(fijo), fijo));
  assert.equal(m.droppedModelNotice(fijo), 'Tu oferta tenía el modelo «Carrier comparte facturación», que este evento ya no acepta. Si la reenvías, queda con «XBF compra-venta», el modelo del evento.');
  m.setLang('en');
  assert.equal(m.droppedModelNotice(fijo), "Your offer had the “Carrier shares billing” model, which this event no longer accepts. If you resend it, it will carry “XBF buy-sell”, the event's model.");
});

// Segunda pasada de la revisión escéptica (24-nov).
test('la vista previa del panel lee el formulario sin juzgarlo: nunca lanza, aunque traiga el modelo de otra ruta', () => {
  const lane = ruta(acepta('brokerage', 'cost_plus'));
  const ajeno = { ...m.offerForm(lane), bid_rate: '1200', commercial_model: 'carrier_share', pct: '4' };
  assert.throws(() => m.offerPayload(ajeno, lane), /Este evento no acepta ese modelo comercial/);
  assert.deepEqual([m.offerDraft(ajeno, lane).commercial_model, m.offerDraft(ajeno, lane).carrier_share_pct], ['carrier_share', 4]);
  const fijo = ruta({ status: 'open', rfx_master_package: { carrier_commercial_policy: { locked: true, model: 'brokerage' } } });
  assert.throws(() => m.offerPayload(ajeno, fijo));
  assert.doesNotThrow(() => m.offerDraft(ajeno, fijo));
  // Lo que sí se puede enviar sale igual por los dos caminos.
  const propio = { ...m.offerForm(lane), bid_rate: '1200', commercial_model: 'xbf_buy_sell', pct: '10' };
  assert.deepEqual(m.offerDraft(propio, lane), m.offerPayload(propio, lane));
});

test('Excel: un plan revisado bajo otros modelos del evento no se envía, aunque el formulario de la ruta no haya cambiado', async () => {
  const lane = ruta(acepta('brokerage', 'cost_plus'));
  const book = await m.buildBidTemplate([lane]);
  cell(book, 'Enviar ruta', 'Sí'); cell(book, 'Tarifa carrier', 1200); cell(book, 'Modelo comercial', 'Costo + margen');
  const [offer] = await m.parseBidTemplate(bytes(book), [lane]);
  assert.equal(m.currentOfferForSend(offer, [lane]), lane);
  // Misma ruta, mismo formulario inicial («sin elegir»), otra lista: «Costo + margen» ya sería fee plus.
  const otra = ruta(acepta('brokerage', 'fee_plus'));
  assert.deepEqual(m.offerForm(otra), m.offerForm(lane));
  assert.notEqual(m.commercialPolicyKey(otra), m.commercialPolicyKey(lane));
  assert.notEqual(m.offerBaseline(otra), m.offerBaseline(lane));
  assert.throws(() => m.currentOfferForSend(offer, [otra]), /Ruta 1: cambió la oferta, su acceso o los modelos del evento/);
  // El candado también cuenta como cambio de política.
  const fijo = ruta({ status: 'open', rfx_master_package: { carrier_commercial_policy: { locked: true, model: 'brokerage', accepted_models: ['brokerage', 'cost_plus'] } } });
  assert.notEqual(m.commercialPolicyKey(fijo), m.commercialPolicyKey(lane));
  // La misma lista escrita en otro orden o con los cuatro modelos es la misma política.
  assert.equal(m.commercialPolicyKey(ruta(acepta('cost_plus', 'brokerage'))), m.commercialPolicyKey(lane));
  assert.equal(m.commercialPolicyKey(ruta(acepta('brokerage', 'cost_plus', 'sell_share', 'fee_plus'))), m.commercialPolicyKey(ruta()));
});

test('Excel: una plantilla descargada bajo otros modelos del evento no se importa, aunque la oferta no haya cambiado', async () => {
  const lane = ruta(acepta('brokerage', 'cost_plus'));
  const llena = async () => {
    const book = await m.buildBidTemplate([lane]);
    cell(book, 'Enviar ruta', 'Sí'); cell(book, 'Tarifa carrier', 1200); cell(book, 'Modelo comercial', 'Costo + margen');
    return book;
  };
  const book = await llena();
  // Sin cambio de política la plantilla entra.
  const [offer] = await m.parseBidTemplate(bytes(book), [lane]);
  assert.equal(offer.form.commercial_model, 'direct_cost_plus');
  assert.equal(offer.baseline, m.offerBaseline(lane));
  // Entre la descarga y la importación el evento cambia cost plus por fee plus:
  // la misma etiqueta para el carrier, otro modelo en Rateware.
  const vieja = /La oferta o los modelos del evento cambiaron desde la descarga; descarga una nueva plantilla/;
  await assert.rejects(m.parseBidTemplate(bytes(book), [ruta(acepta('brokerage', 'fee_plus'))]), vieja);
  // Lo mismo si el evento suma un modelo, se queda con uno o pasa a candado.
  await assert.rejects(m.parseBidTemplate(bytes(book), [ruta(acepta('brokerage', 'cost_plus', 'sell_share'))]), vieja);
  await assert.rejects(m.parseBidTemplate(bytes(book), [ruta(acepta('cost_plus'))]), vieja);
  await assert.rejects(m.parseBidTemplate(bytes(book), [ruta({ status: 'open', rfx_master_package: { carrier_commercial_policy: { locked: true, model: 'brokerage' } } })]), vieja);
  // Una plantilla anterior a este dato (su base era solo la oferta) también se descarga otra vez.
  const anterior = await llena();
  cell(anterior, 'Base de oferta', JSON.stringify(m.offerForm(lane)));
  await assert.rejects(m.parseBidTemplate(bytes(anterior), [lane]), vieja);
  m.setLang('en');
  await assert.rejects(m.parseBidTemplate(bytes(book), [ruta(acepta('brokerage', 'fee_plus'))]), /The offer or the event's models changed since the download; download a new template/);
});
