const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  const scope = { userId: uid(900), organizationId: 'org_lab', role: 'admin', eventId: uid(800) };
  const invitation = (n, lane, vendor, fields = {}) => ({ id: uid(n), vendor_id: uid(vendor), rfx_lane_id: uid(lane), rfx_event_id: scope.eventId,
    invitation_status: 'invited', vendors: { id: uid(vendor), vendor_name: `Synthetic carrier ${vendor}` }, ...fields });
  const offer = { bid_rate: 1650, currency: 'USD', valid_through: '2028-12-31', weekly_capacity: 10, transit_days: 2, commercial_model: 'sell_share', carrier_share_pct: 3 };
  const lanes = [{ id: uid(100), rfx_event_id: scope.eventId, lane_number: 1, origin: 'Origin A', destination: 'Destination A', invitations: [
    invitation(1001, 100, 1, offer), invitation(1002, 100, 2), invitation(1003, 100, 3, { ...offer, bid_rate: 1800, valid_through: '2020-01-01', transit_days: null }),
    invitation(1004, 100, 4), invitation(1005, 100, 5), invitation(1006, 100, 6, { invitation_status: 'declined' }) ] },
    { id: uid(101), rfx_event_id: scope.eventId, lane_number: 2, origin: 'Origin B', destination: 'Destination B', invitations: [invitation(1011, 101, 1), invitation(1012, 101, 2), invitation(1013, 101, 3, offer)] }];
  const thread = (n, vendor, lane, role = 'carrier') => ({ id: uid(n), rfx_event_id: scope.eventId, vendor_id: uid(vendor), rfx_lane_id: uid(lane), thread_type: 'carrier_private',
    title: 'Synthetic thread', updated_at: '2026-10-26T12:00:00Z', messages: [{ id: uid(n + 100), thread_id: uid(n), rfx_event_id: scope.eventId,
      vendor_id: uid(vendor), rfx_lane_id: uid(lane), sender_role: role, created_at: '2026-10-26T12:00:00Z', body: 'Synthetic response only' }] });
  const context = { response_vendor_ids: [uid(1), uid(4)], outreach_messages_limited: false, warnings: {},
    outreach_messages: [{ id: uid(500), rfx_event_id: scope.eventId, vendor_id: uid(1), rfx_lane_id: null, tracking_state: 'replied' },
      { id: uid(501), rfx_event_id: scope.eventId, vendor_id: uid(3), rfx_lane_id: uid(100), tracking_state: 'quoted', status: 'drafted' }],
    chat: { event: { id: scope.eventId, name: 'Synthetic RFx', organization_id: scope.organizationId }, messages_limited: false, google_chat_configured: false,
      rows: [thread(600, 2, 100), thread(601, 5, 100, 'team')] } };
  return { scope, lanes, context, thread };
}
module.exports = { fixture, uid };
