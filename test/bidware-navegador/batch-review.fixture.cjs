const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function makeBatchFixture() {
  const org = 'org_fixture_primary', manifest = 'a'.repeat(64);
  const names = ['D2D Crossborder - Hazmat', 'Intramex - Hazmat', 'Intramex - Reefer', 'Intramex - Flatbed'];
  const groups = ['A','B','C','D','E','F'];
  const codes = groups.flatMap((g,i) => Array([4,123,21,13,11,2][i]).fill(g)); codes.push('A');
  const rows = codes.map((group,i) => {
    const additional = i === 174, proposal = additional ? 'EXTRA-L3-001' : `L1-${i+1}`;
    const source = i%13, name = names[i%4];
    return { review_row_id: `${manifest}:${proposal}`, source_proposal_id: proposal, batch: additional?'L3':'L1', outside_L1: additional,
      vendor_id: uid(1000+i%122), carrier: `Carrier fixture ${i%122+1}`, source_template_id: uid(1+source), source_template_name: `Historical fixture ${source+1}`,
      source_template_version: 2, source_template_lifecycle:'archived', proposed_template_name:name, target_template_id:null, group,
      crm_status_at_source_cut:i%2?'inactive':'active', last_source_date:'2026-01-20',
      evidence_scope:'Synthetic route and equipment. Not a commercial quote.', restrictions:'Synthetic restriction; no current availability.',
      source_refs:[{file:'fixture.pdf',sha256:'b'.repeat(64),locator:`page ${i+1}`,date:'2026-01-20'}],
      applied:false,approved:false,invitation_authorized:false,current_availability_verified:false };
  });
  const packet={artifact_format:'bidware-engine-review-preparation/1',artifact_kind:'documentary_mockup_not_product_contract',authority:'preparation_only',
    current_catalog_verified:false,production_changes:0,provider_requests:0,organization_id:null,source_packet_manifest_sha256:manifest,source_review_date:'2026-10-23',
    summary:{L1_relations:174,L1_carriers:122,proposals:5,proposed_templates:4,historical:123,exceptions:47,additional_L3:1,other_relations_not_reviewed:192},
    rows,groups:groups.map(code=>{const selected=rows.filter(r=>r.group===code);return {code,count:selected.length,l1_count:selected.filter(r=>!r.outside_L1).length,
      additional_count:selected.filter(r=>r.outside_L1).length,review_row_ids:selected.map(r=>r.review_row_id)};})};
  const templates=Array.from({length:13},(_,i)=>({id:uid(1+i),organization_id:org,segment_name:`Historical fixture ${i+1}`,template_version:2,lifecycle_status:'archived',
    vendor_ids:rows.filter(r=>r.source_template_id===uid(1+i)).map(r=>r.vendor_id)}));
  templates.push(...names.map((name,i)=>({id:uid(100+i),organization_id:org,segment_name:name,template_version:3,lifecycle_status:'active',vendor_ids:[]})));
  return {packet,templates,org};
}
module.exports={uid,makeBatchFixture};
