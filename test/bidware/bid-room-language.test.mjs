import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// El Bid Room vive en /bid/:token: ahí el idioma del carrier es propio y no toca el del equipo.
const store = new Map();
globalThis.location = { pathname: '/bid/fixture-token' };
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };

const built = await build({
  stdin: {
    contents: `export * from './src/bidware/i18n/bid-room-quote.ts';
      export * from './src/bidware/i18n/bid-room-overview.ts';
      export { setLang, getLang } from './src/bidware/i18n/language.ts';
      export * as svc from './src/bidware/features/bid-room/bidroom.service.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'api-fixture', setup(b) {
    b.onResolve({ filter: /^@\/lib\/api-client$/ }, () => ({ path: 'api', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class ApiError extends Error{}; export const callRfxBidApi=()=>({});', loader: 'js' }));
  } }],
});
const m = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const lane = { rfx_lane_id: 'lane-a', invitation_token: 'fixture-token', commercial_model: 'cost_plus' };

test('el Bid Room arranca en español y no cambia sin que el carrier lo pida', () => {
  assert.equal(m.getLang(), 'es');
  assert.equal(m.q('tab.bids'), 'Cotizar rutas');
  assert.equal(m.q('lanes.progress', 2, 5), '2 de 5 rutas cotizadas.');
});

test('cada texto del catálogo existe en los dos idiomas con los mismos marcadores', () => {
  const marks = (text) => [...text.matchAll(/\{(\d+)\}/g)].map((x) => x[1]).sort().join(',');
  for (const [key, value] of [...Object.entries(m.quoteCopy), ...Object.entries(m.overviewCopy)]) {
    assert.ok(value.es !== undefined && value.en !== undefined, key);
    if (key !== 'form.finalAfter') { assert.ok(value.es.trim() && value.en.trim(), key); }
    assert.equal(marks(value.es), marks(value.en), `marcadores de ${key}`);
  }
});

test('al elegir inglés cambia solo la llave del Bid Room y se traduce el servicio', () => {
  m.setLang('en');
  assert.equal(m.getLang(), 'en');
  assert.equal(store.get('bidware.bidroom.lang'), 'en');
  assert.equal(store.has('bidware.team.lang'), false);
  assert.equal(m.q('tab.bids'), 'Quote lanes');
  assert.equal(m.q('lanes.progress', 2, 5), '2 of 5 lanes quoted.');
  assert.ok(m.svc.billingNotice({ ...m.svc.offerForm(lane), pct: '4' }).includes('(4 %)'));
  assert.ok(m.svc.billingNotice({ ...m.svc.offerForm(lane), pct: '4' }).includes('5 business days'));
  assert.equal(m.svc.offerProblems(m.svc.offerForm(lane))[0], 'Enter your all-in rate.');
  assert.equal(m.svc.modelCopy('xbf_buy_sell').label, 'XBF buy-sell');
  assert.equal(m.svc.explainBidError({ status: 409, message: 'Closed.' }), 'Closed. The quoting window has already closed for this lane.');
  m.setLang('es');
  assert.equal(m.svc.modelCopy('xbf_buy_sell').label, m.svc.modelSpec('xbf_buy_sell').label);
});

test('El negocio y Mi ranking concuerdan en número y cubren cada modo y cada factor del score', () => {
  assert.equal(m.o('biz.lanesText', 8, 1), '8 en tu invitación · 1 segmento');
  assert.equal(m.o('biz.lanesText', 8, 2), '8 en tu invitación · 2 segmentos');
  assert.equal(m.o('biz.laneCount', 1), '1 ruta');
  for (const mode of ['private', 'anonymous_rank', 'open_leaderboard']) {
    for (const key of [`mode.${mode}.label`, `mode.${mode}.text`, `band.${mode}.tag`, `band.${mode}.text`]) assert.ok(m.overviewCopy[key], key);
  }
  for (const factor of m.svc.SCORE_FACTORS) {
    assert.equal(m.o(`factor.${factor.key}.label`), factor.label);
    assert.equal(m.o(`factor.${factor.key}.hint`), factor.hint);
  }
  m.setLang('en');
  assert.equal(m.o('biz.lanesText', 8, 1), '8 in your invitation · 1 segment');
  assert.equal(m.o('biz.laneCount', 3), '3 lanes');
  assert.equal(m.o('sig.placeOf', 2, 5), 'place 2 of 5');
  assert.equal(m.o('factor.eta.label'), 'Pickup ETA');
  m.setLang('es');
});
