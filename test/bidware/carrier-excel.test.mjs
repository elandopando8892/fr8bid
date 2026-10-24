import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
fs.mkdirSync('.test-output/carrier-excel-20261006', { recursive: true });
const outfile = '.test-output/carrier-excel-20261006/module.cjs';
await build({ entryPoints: ['src/bidware/features/bid-room/bid-template.ts'], bundle: true, outfile, format: 'cjs', platform: 'node', plugins: [{ name: 'api-fixture', setup(b) {
  b.onResolve({ filter: /^@\/lib\/api-client$/ }, () => ({ path: 'api', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class ApiError extends Error{}; export const callRfxBidApi=()=>{throw Error("No API writes in parser")};', loader: 'js' }));
} }] });
const m = require('../../' + outfile);
const lane = { rfx_lane_id: 'lane-1', rfx_event_id: 'event-1', invitation_id: 'inv-1', invitation_token: 'secret-fixture-token', origin: 'Monterrey', destination: 'Dallas', lane_number: 1, event: { status: 'open' }, currency: 'USD' };
const bytes = book => XLSX.write(book, { type: 'array', bookType: 'xlsx' });
function cell(book, label, value, row = 1) { book.Sheets.Ofertas[XLSX.utils.encode_cell({ r: row, c: m.TEMPLATE_HEADERS.indexOf(label) })] = { t: typeof value === 'number' ? 'n' : 's', v: value }; }
async function filled(l = lane) { const b = await m.buildBidTemplate([l]); cell(b, 'Enviar ruta', 'Sí'); cell(b, 'Tarifa carrier', 1200); return b; }
const parse = (book, lanes = [lane]) => m.parseBidTemplate(bytes(book), lanes);

test('export carries all offer columns, instructions and models, but no credentials or private validation', async () => {
  const b = await m.buildBidTemplate([{ ...lane, availability_validation_notes: 'INTERNAL_SECRET' }]);
  const content = JSON.stringify(b);
  assert.ok(!content.includes('secret-fixture-token')); assert.ok(!content.includes('INTERNAL_SECRET'));
  assert.ok(content.includes('XBF compra-venta')); assert.ok(content.includes('Carrier comparte facturación')); assert.ok(content.includes('Costo + margen'));
  assert.ok(content.includes('5 días hábiles después de la confirmación de pago del embarcador'));
  assert.equal(m.OFFER_COLUMNS.length, 21);
  await assert.rejects(parse(b), /Marca Sí/);
});
for (const [model, pct] of [['direct_cost_plus', 3], ['carrier_share', 4], ['xbf_buy_sell', 12]]) {
  test(`full Excel roundtrip preserves ${model} and operational fields`, async () => {
    const l = { ...lane, commercial_model: model, marksman_margin_pct: pct, carrier_share_pct: pct, bid_rate: 1100, weekly_capacity: 3, transit_days: 2, valid_through: '2099-12-31', equipment_available: true, current_unit_location: 'MTY', deadhead_distance: 0, deadhead_unit: 'km', unit_details: 'Unidad 123', eta_pickup: '2099-06-01T10:00:00Z', eta_delivery: '2099-06-03T10:00:00Z', mirror_account_enabled: true, best_alternative_offered: true, alternative_equipment: 'Reefer', alternative_units: 2, alternative_notes: 'Condiciones', notes: '=text is not a formula' };
    const [offer] = await parse(await filled(l), [l]);
    assert.equal(offer.form.commercial_model, model); assert.equal(offer.form.pct, String(pct)); assert.equal(offer.form.deadhead_distance, '0'); assert.equal(offer.form.mirror_account_enabled, true); assert.equal(offer.form.alternative_notes, 'Condiciones'); assert.equal(offer.form.notes, '=text is not a formula'); assert.deepEqual(offer.warnings, []);
    assert.equal(m.currentOfferForSend(offer, [l]).invitation_token, lane.invitation_token);
  });
}
test('blank percentage preview shows correct defaults; bad ranges block', async () => {
  for (const [model, def] of [['direct_cost_plus', 3], ['carrier_share', 3], ['xbf_buy_sell', 12]]) {
    const b = await filled(); cell(b, 'Modelo comercial', model); cell(b, 'Porcentaje', '');
    const [o] = await parse(b); assert.equal(m.displayOfferValue('pct', o.form), `${def} % (predeterminado)`);
    cell(b, 'Porcentaje', 90); await assert.rejects(parse(b), /porcentaje va/);
  }
});
test('unknown model never falls back silently', async () => { const b = await filled(); cell(b, 'Modelo comercial', 'random'); await assert.rejects(parse(b), /Modelo comercial desconocido/); });
test('foreign invitation and duplicate lanes blocked', async () => {
  const b = await filled(); cell(b, 'Invitación ID', 'another'); await assert.rejects(parse(b), /no pertenece/);
  const duplicate = await m.buildBidTemplate([lane, lane]); for (const row of [1, 2]) { cell(duplicate, 'Enviar ruta', 'Sí', row); cell(duplicate, 'Tarifa carrier', 1200, row); }
  await assert.rejects(parse(duplicate), /duplicada/);
});
test('stale and closed offers blocked during import and before sending', async () => {
  const b = await filled(); await assert.rejects(parse(b, [{ ...lane, bid_rate: 900 }]), /cambió/);
  await assert.rejects(parse(b, [{ ...lane, due_state: { status: 'closed' } }]), /no admite/);
  const [o] = await parse(b); assert.throws(() => m.currentOfferForSend(o, [{ ...lane, bid_rate: 500 }]), /cambió/); assert.throws(() => m.currentOfferForSend(o, []), /acceso/);
});
test('formulas with cached values and missing columns blocked', async () => {
  const b = await filled(); b.Sheets.Ofertas.J2 = { t: 'n', v: 1200, f: '600*2' }; await assert.rejects(parse(b), /fórmulas/);
  const other = await filled(); delete other.Sheets.Ofertas.A1; await assert.rejects(parse(other), /columnas/);
});
test('dates, order, currency and ambiguous decimals rejected', async () => {
  for (const [label, value, expected] of [['Vigente hasta', '2099-02-31', /fecha inválida/], ['Moneda', 'dollars', /Moneda/], ['Tarifa carrier', '1,200', /sin separadores/], ['Cuenta espejo GPS', 'maybe', /Sí o No/], ['Unidad de vacío', 'm', /mi o km/]]) {
    const b = await filled(); cell(b, label, value); await assert.rejects(parse(b), expected);
  }
  const b = await filled(); cell(b, 'ETA recolección', '2099-06-03T10:00'); cell(b, 'ETA entrega', '2099-06-01T10:00'); await assert.rejects(parse(b), /posterior/);
});
test('native Excel dates supported; zero and No are explicit values', async () => {
  const b = await filled(); cell(b, 'Vigente hasta', 46000); cell(b, 'Vacío al origen', 0); cell(b, 'Equipo disponible', 'No');
  const [o] = await parse(b); assert.match(o.form.valid_through, /^2025-/); assert.equal(o.form.deadhead_distance, '0'); assert.equal(o.form.equipment_available, 'no');
});

test('1900 and 1904 workbooks preserve the same expiry and ETA dates', async () => {
  for (const date1904 of [false, true]) {
    const b = await filled();
    b.Workbook = { WBProps: { date1904 } };
    // 2026-10-27 is day 46322 in Excel's 1900 calendar; 1904 uses a 1462-day offset.
    const serial = 46322 - (date1904 ? 1462 : 0);
    cell(b, 'Vigente hasta', serial);
    cell(b, 'ETA recolección', serial + 0.5);
    cell(b, 'ETA entrega', serial + 1.5);
    const [o] = await parse(b);
    assert.equal(o.form.valid_through, '2026-10-27');
    assert.equal(o.form.eta_pickup, '2026-10-27T12:00');
    assert.equal(o.form.eta_delivery, '2026-10-28T12:00');
  }
});
test('optional blank clears previous value and unchecked rows never submit', async () => {
  const l = { ...lane, notes: 'Prior notes' }; const b = await filled(l); cell(b, 'Notas', ''); const [o] = await parse(b, [l]); assert.equal(o.form.notes, '');
  cell(b, 'Enviar ruta', 'No'); await assert.rejects(parse(b, [l]), /Marca Sí/);
});
test('alternative details cannot disappear silently when its flag is No', async () => {
  const b = await filled(); cell(b, 'Equipo alternativo', 'Reefer'); await assert.rejects(parse(b), /Hay datos de alternativa/);
});
test('file and row size guards', async () => {
  await assert.rejects(m.parseBidTemplate(new ArrayBuffer(5 * 1024 * 1024 + 1), [lane]), /5 MiB/);
  const b = await filled(); b.Sheets.Ofertas['!ref'] = 'A1:AD1002'; b.Sheets.Ofertas.A1002 = { t: 's', v: 'excess' }; await assert.rejects(parse(b), /1,000 rutas/);
});
