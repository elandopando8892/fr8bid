// Website tray service: real module, only the QuoteDesk API boundary is synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const built = await build({ stdin: { contents: `export * from './src/bidware/features/web-intake/webIntake.service.ts';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'isolated-api', setup(b) {
    b.onResolve({ filter: /^@\/lib\/api-client$/ }, () => ({ path: 'api', namespace: 'fixture' }));
    b.onResolve({ filter: /^@\// }, a => ({ path: resolve('src/bidware', a.path.slice(2) + '.ts') }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const callQuotedeskApi=(action,payload)=>globalThis.webFixture(action,payload);', loader: 'js' }));
  } }] });
globalThis.localStorage = { getItem: () => 'es', setItem() {} };
const m = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const ID = '00000000-0000-4000-8000-000000000001';
const SHIPPER = '00000000-0000-4000-8000-0000000000a1';
function api(answer) { const calls = []; globalThis.webFixture = async (action, payload) => { calls.push({ action, payload }); return answer(action, payload); }; return calls; }

test('the lane starts from what the visitor wrote and invents nothing', () => {
  const lane = m.laneFromLead({ origin_city: 'Monterrey, NL', origin_postal_code: '64000', destination_city: 'Dallas, TX', truck_type: 'Tractor',
    loads_per_week: '3-5', weight_lbs: '40,000', border: 'Laredo', product: 'Vidrio', idempotency_key: 'x' });
  assert.equal(lane.origin_text, 'Monterrey, NL 64000');
  assert.equal(lane.weekly_volume, '', 'a range is left for the operator');
  assert.equal(lane.average_weight, '40000');
  assert.deepEqual(m.missingForPromotion(lane, null), ['Shipper', 'Cargas por semana']);
  assert.deepEqual(m.missingForPromotion({ ...lane, weekly_volume: '4' }, SHIPPER), []);
  assert.deepEqual(m.missingForPromotion({ ...lane, weekly_volume: '0', truck_type: ' ' }, SHIPPER), ['Tipo de equipo', 'Cargas por semana']);
});

test('the detailed RFI arrives ready: template values to lane fields, the rest to notes', () => {
  const lane = m.laneFromLead({ origin_city: 'Monterrey, NL', destination_city: 'Dallas, TX', truck_type: 'Truck Trailer', trailer_type: 'Dry Van',
    configuration: 'Single', service_type: 'One Way', packaging: 'Pallets', hazmat: 'No', loads_per_week: '4', weight_lbs: '38000',
    border: 'Nuevo Laredo / Laredo', operation: 'Autopartes a planta', origin_facility: 'Factory', schedule: 'Mon - Fri', lead_time: '48 h' });
  assert.equal(lane.config, 'Single');
  assert.equal(lane.service, 'One Way');
  assert.equal(lane.packaging, 'Pallets');
  assert.equal(lane.border_crossing, 'Nuevo Laredo / Laredo');
  assert.equal(lane.notes, 'Necesidad: Autopartes a planta\nInstalación en origen: Factory\nDías de operación: Mon - Fri\nAnticipación: 48 h');
  assert.deepEqual(m.missingForPromotion(lane, SHIPPER), []);
  assert.equal(m.laneFromLead({ border: 'No crossing' }).border_crossing, '');
  const unsure = m.laneFromLead({ border: 'Not sure' });
  assert.equal(unsure.border_crossing, '');
  assert.equal(unsure.notes, 'Cruce: Not sure');
});

test('the source reads the campaign first, then ad click ids, then the landing page', () => {
  assert.equal(m.leadSource({ attribution: { utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'rfi', landing_path: '/contacto' } }), 'linkedin / social / rfi');
  assert.equal(m.leadSource({ attribution: { gclid: 'x', landing_path: '/' } }), 'Google Ads');
  assert.equal(m.leadSource({ attribution: { landing_path: '/contacto' } }), '/contacto');
  assert.equal(m.leadSource({ attribution: null }), '');
  assert.equal(m.leadSource({}), '');
});

test('promotion sends only filled, trimmed lane fields and the chosen shipper', async () => {
  const calls = api(() => ({ project_id: ID, replayed: false }));
  const lane = { ...m.laneFromLead({ origin_city: ' Monterrey ', destination_city: 'Dallas', truck_type: 'Tractor' }), weekly_volume: '2 ' };
  await m.promoteWebLead(ID, SHIPPER, lane, 'MXN');
  assert.deepEqual(calls, [{ action: 'promote_web_lead', payload: { intake_id: ID, shipper_id: SHIPPER, currency: 'MXN',
    lane: { origin_text: 'Monterrey', destination_text: 'Dallas', truck_type: 'Tractor', weekly_volume: '2' } } }]);
});

test('registration and dismissal are single calls with no retry', async () => {
  let calls = api(() => { throw new Error('Failed to fetch'); });
  await assert.rejects(() => m.registerWebRateSheet(ID, SHIPPER));
  assert.equal(calls.length, 1);
  calls = api(() => ({ replayed: false }));
  await m.dismissWebIntake(ID, '  spam ');
  assert.deepEqual(calls[0], { action: 'dismiss_web_intake', payload: { intake_id: ID, note: 'spam' } });
});

test('the tray hides itself outside the commercial workspace or before the backend ships', async () => {
  for (const message of ['web_intake_forbidden', 'Unknown QuoteDesk action: list_web_intake.']) {
    api(() => { throw new Error(message); });
    await assert.rejects(() => m.listWebIntake(), e => e instanceof m.WebIntakeHidden);
  }
  api(() => { throw new Error('boom'); });
  await assert.rejects(() => m.listWebIntake(), e => !(e instanceof m.WebIntakeHidden));
});

test('server refusals read as the team would say them', () => {
  assert.match(m.decisionError(new Error('web_intake_already_reviewed')), /ya tiene una decisión/);
  assert.match(m.decisionError(new Error('web_lead_lane_incomplete')), /ruta está incompleta/);
  assert.match(m.decisionError(new Error('web_rate_sheet_not_xlsx')), /XLSX/);
  assert.match(m.decisionError(new Error('web_lead_shipper_required')), /shipper o carrier/);
  assert.match(m.decisionError(new Error('anything else')), /No se guardó nada/);
});

test('several lanes: every lane of the request, in order, each checked on its own', () => {
  const lead = { origin_city: 'Monterrey, NL', destination_city: 'Dallas, TX', truck_type: 'Tractor', loads_per_week: '3', operation: 'Autopartes',
    lanes: [{ origin_city: 'Querétaro, QRO', destination_city: 'Houston, TX', loads_per_week: '2' }, 'not a lane', null] };
  const lanes = m.lanesFromLead(lead);
  assert.equal(lanes.length, 2);
  assert.equal(m.laneCount(lead), 2);
  assert.equal(m.laneCount({ origin_city: 'A' }), 1);
  assert.equal(lanes[1].origin_text, 'Querétaro, QRO');
  assert.equal(lanes[1].notes, '', 'the lead-level notes stay on the first lane');
  assert.deepEqual(m.missingForLanes(lanes, SHIPPER), ['Ruta 2: Tipo de equipo']);
  assert.deepEqual(m.missingForLanes([lanes[0]], null), ['Shipper']);
  assert.deepEqual(m.missingForLanes([], SHIPPER), ['al menos una ruta']);
  assert.equal(m.lanesFromLead({ lanes: Array.from({ length: 12 }, () => ({ origin_city: 'A' })) }).length, m.MAX_WEB_LANES);
});

test('several lanes go as one `lanes` array; one lane keeps the original shape', async () => {
  const calls = api(() => ({ project_id: ID, replayed: false }));
  const a = { ...m.laneFromLead({ origin_city: 'Monterrey', destination_city: 'Dallas', truck_type: 'Tractor' }), weekly_volume: '2' };
  const b = { ...a, origin_text: ' Querétaro ' };
  await m.promoteWebLead(ID, SHIPPER, [a, b], 'USD');
  await m.promoteWebLead(ID, SHIPPER, [a], 'USD');
  assert.deepEqual(calls[0].payload.lanes.map(l => l.origin_text), ['Monterrey', 'Querétaro']);
  assert.equal('lane' in calls[0].payload, false);
  assert.equal(calls[1].payload.lane.origin_text, 'Monterrey');
  assert.equal('lanes' in calls[1].payload, false);
  await assert.rejects(() => m.promoteWebLead(ID, SHIPPER, [], 'USD'));
  await assert.rejects(() => m.promoteWebLead(ID, SHIPPER, Array.from({ length: 11 }, () => a), 'USD'));
  assert.equal(calls.length, 2, 'invalid lane lists never reach the API');
});
