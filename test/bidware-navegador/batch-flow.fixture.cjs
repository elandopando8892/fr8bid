const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture(size = 12) {
  const scope = { userId: uid(900), organizationId: 'org_synthetic_flow', role: 'admin', eventId: uid(800) };
  const campaign = { id: uid(700), organization_id: scope.organizationId, rfx_event_id: scope.eventId, template_id: uid(600), name: 'Campaña sintética A', status: 'draft', audience_policy: { mode: 'selected_carriers', vendor_ids: Array.from({ length: Math.max(0, size - 1) }, (_, i) => uid(i + 1)) } };
  const audience = Array.from({ length: size }, (_, i) => ({ vendor_id: uid(i + 1), vendor_name: `Carrier sintético ${String(i + 1).padStart(2, '0')}`, email: `carrier${i + 1}@example.test`, phone: `+52810000${String(i + 1).padStart(4, '0')}`, invitation_statuses: ['drafted'], audience_status: 'ready', event_status: 'not_invited', lane_preview: ['Origen sintético → Destino sintético'], shortlisted_lane_count: 1 }));
  const reviews = audience.map((row, i) => ({ vendor_id: row.vendor_id, reviewed: i !== 1, contact_snapshot: { email: row.email, phone: row.phone } }));
  const message = (id, vendor, status = 'drafted') => ({ id: uid(1000 + id), rfx_event_id: scope.eventId, vendor_id: vendor ? uid(vendor) : null, campaign_id: uid(700), channel: 'email', status, tracking_state: status, recipient_email: `carrier${vendor}@example.test`, subject: `Mensaje sintético ${id}`, metadata: { vendor_name: `Carrier sintético ${String(vendor).padStart(2, '0')}` } });
  const messages = size >= 12 ? [message(1, 5), message(2, 6, 'sent'), message(3, 7, 'failed'), message(4, 8), message(5, 8), message(6, 12), message(7, 90), message(8, null)] : [];
  if (size >= 12) {
    audience[2].email = null; audience[2].audience_status = 'no_contact';
    audience[3].audience_status = 'suppressed';
    audience[8].email = 'changed@example.test';
    audience[9].event_status = 'quoted';
  }
  return { scope, campaigns: [campaign], audience, reviews, messages, segments: [], calls: [], message };
}
function reader(data, transform = (value) => value) {
  return async (action, body = {}) => {
    data.calls.push({ action, ...body });
    let value;
    switch (action) {
      case 'list_outreach_campaigns': {
        if (Object.hasOwn(body, 'rfx_event_id')) {
          const rows = data.campaigns.filter(row => row.rfx_event_id === body.rfx_event_id && row.status !== 'archived');
          value = { rows, total: rows.length, complete: true, campaign_read_version: 1, rfx_event_id: body.rfx_event_id, organization_id: data.scope.organizationId };
        } else value = { rows: data.campaigns.slice(-100).reverse() };
        break;
      }
      case 'preview_outreach_audience': value = { rfx_event_id: data.scope.eventId, channel: body.channel, total: data.audience.length, filtered_total: data.audience.length, rows: data.audience }; break;
      case 'list_rfx_invitation_wave_reviews': value = { rows: data.reviews }; break;
      case 'list_outreach_audience_segments': value = { rows: data.segments }; break;
      case 'list_outreach_messages': {
        let rows = data.messages.filter(row => (!body.channels || body.channels.includes(row.channel)) && (!body.tracking_status || row.tracking_state === body.tracking_status));
        const total = rows.length, offset = body.offset || 0;
        value = { rows: rows.slice(offset, offset + (body.limit || 100)), total, offset, has_more: offset + (body.limit || 100) < total }; break;
      }
      default: throw new Error(`Outside read-only fixture: ${action}`);
    }
    return transform(structuredClone(value), action, body);
  };
}
module.exports = { uid, fixture, reader };
