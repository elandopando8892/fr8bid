const {createHash}=require('node:crypto');
const {makeBatchFixture,uid}=require('./batch-review.fixture.cjs');
const digest=v=>createHash('sha256').update(v).digest('hex');
function makeTreatmentFixture(){
 const f=makeBatchFixture(), rows=f.packet.rows.filter(r=>'CDEF'.includes(r.group)), groups={C:[],D:[],E:[],F:[]};
 rows.forEach((r,i)=>{
  r.source_refs=Array.from({length:i===46?3:4},(_,j)=>{const n=(i*4+j)%24+1;return {file:`synthetic-${n}.pdf`,sha256:n.toString(16).padStart(64,'0'),locator:`row ${i+1} reference ${j+1}`,date:'2026-01-20'};});groups[r.group].push(r);
 });
 const assignments=[['C01',groups.C],['D01',groups.D.slice(0,9)],['D02',groups.D.slice(9)],...[[0,4],[4,7],[7,8],[8,9],[9,10],[10,11]].map(([start,end],i)=>[`E0${i+1}`,groups.E.slice(start,end)]),['F01',groups.F.slice(0,1)],['F02',groups.F.slice(1)]];
 const treatmentRows=assignments.flatMap(([id,members])=>members.map(r=>({review_row_id:r.review_row_id,source_proposal_id:r.source_proposal_id,group:r.group,treatment_batch_id:id,status:'prepared_pending_evidence',
  proposed_treatment:`Synthetic ${id}: review the original restrictions for these IDs.`,closure_evidence_required:`Synthetic ${id}: confirm documentary scope separately for each ID.`,secondary_blockers:['Synthetic restriction remains in effect.'],
  organization_id:null,target_template_id:null,reviewed:false,approved:false,applied:false,membership_change_authorized:false,invitation_authorized:false,
  features_original:{proposal_id:r.source_proposal_id,group:r.group,vendor_id:r.vendor_id,template_id:r.source_template_id,evidence_scope:r.evidence_scope,restrictions:r.restrictions,source_refs:r.source_refs},
  source_template_at_cut:{id:r.source_template_id,version:r.source_template_version,lifecycle:r.source_template_lifecycle}})));
 const batches=assignments.map(([id,members])=>({id,group:id[0],count:members.length,row_ids:members.map(r=>r.review_row_id),status:'prepared_pending_evidence',action_proposed:treatmentRows.find(r=>r.treatment_batch_id===id).proposed_treatment,closure_evidence_required:treatmentRows.find(r=>r.treatment_batch_id===id).closure_evidence_required,source_hashes:[...new Set(members.flatMap(r=>r.source_refs.map(s=>s.sha256)))]}));
 const raw=JSON.stringify(f.packet),inputHash=digest(raw);
 const plan={artifact_format:'bidware-engine-exception-treatment-preparation/1',artifact_kind:'documentary_preparation_not_runtime_contract',authority:'preparation_only',current_catalog_verified:false,organization_id:null,production_changes:0,provider_calls:0,approved:false,applied:false,
  source_manifest_sha256:f.packet.source_packet_manifest_sha256,review_data_sha256:inputHash,features_proposals_sha256:'c'.repeat(64),source_review_date:f.packet.source_review_date,
  rows:treatmentRows,batches,summary:{relations:47,distinct_carriers:new Set(rows.map(r=>r.vendor_id)).size,work_packages:11,source_files:24,source_references:187,resolved:0,other_L1_excluded:127,additional_L3_excluded:1,other_lots_out_of_scope:192,groups:{C:21,D:13,E:11,F:2}}};
 return {...f,raw,inputHash,plan};
}
module.exports={makeTreatmentFixture,digest,uid};
