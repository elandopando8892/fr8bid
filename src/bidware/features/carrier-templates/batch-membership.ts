import { batchIsCurrent, validateBatchCatalog, destinationStatus, type BatchCatalog, type BatchReview, type BatchTarget } from './batch-review';

export interface MembershipGroup { targetId:string; name:string; expectedVersion:number; before:string[]; after:string[]; additions:string[]; rowIds:string[] }
export interface MembershipPlan { format:'bidware-membership-plan/1'; authority:'local_proposal_only'; organizationId:string; inputHash:string; manifestHash:string; selectedRowIds:string[]; excludedRowIds:string[]; groups:MembershipGroup[]; approved:false; applied:false }
const sorted=(ids:string[])=>[...new Set(ids)].sort();
export const sameMembers=(a:string[],b:string[])=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
function fail():never{throw Error('MEMBERSHIP_PLAN_INVALID')}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);

export function buildMembershipPlan(batch:BatchReview,catalog:BatchCatalog,org:string,inputHash:string,ids:string[],targets:Record<string,BatchTarget>,now=Date.now()):MembershipPlan {
  if(!batchIsCurrent(catalog,org,now)||!/^[a-f0-9]{64}$/.test(inputHash)||!ids.length||sorted(ids).length!==ids.length)fail();
  validateBatchCatalog(batch,org,catalog.templates,catalog.checkedAt);
  const rows=ids.map(id=>batch.rows.find(r=>r.id===id));
  if(rows.some(r=>!r||r.group!=='A'))fail();
  const selected=rows as BatchReview['rows'];
  if(selected.some(r=>{const s=catalog.templates.find(t=>t.id===r.sourceId);return !s||s.template_version!==r.sourceVersion||s.lifecycle_status!==r.sourceLifecycle||s.segment_name!==r.sourceName}))fail();
  const groups=sorted(selected.map(r=>r.proposedName)).map(name=>{
    const target=targets[name];if(destinationStatus(name,target,catalog)!=='current'||batch.rows.some(r=>r.sourceId===target.id))fail();
    const t=catalog.templates.find(t=>t.id===target.id)!;
    const members=selected.filter(r=>r.proposedName===name),before=sorted(t.vendor_ids||[]),wanted=sorted(members.map(r=>r.vendorId));
    return {targetId:t.id,name,expectedVersion:target.version,before,after:sorted([...before,...wanted]),additions:wanted.filter(id=>!before.includes(id)),rowIds:sorted(members.map(r=>r.id))};
  });
  if(sorted(groups.map(g=>g.targetId)).length!==groups.length)fail();
  return {format:'bidware-membership-plan/1',authority:'local_proposal_only',organizationId:org,inputHash,manifestHash:batch.manifestHash,selectedRowIds:sorted(ids),excludedRowIds:sorted(batch.rows.filter(r=>!ids.includes(r.id)).map(r=>r.id)),groups,approved:false,applied:false};
}

/** Saved snapshots can describe a partially completed batch. They never authorize writes.
 * Execution must compare each snapshot to a fresh server read before doing anything. */
export function parseMembershipPlan(raw:string,batch:BatchReview,catalog:BatchCatalog,org:string,inputHash:string,now=Date.now()):MembershipPlan {
  if(new TextEncoder().encode(raw).length>16*1024*1024)fail();
  let p:unknown;try{p=JSON.parse(raw)}catch{return fail()}
  if(!record(p)||!Array.isArray(p.groups)||!p.groups.length||p.groups.length>batch.rows.length||!Array.isArray(p.selectedRowIds)||!p.selectedRowIds.every(id=>typeof id==='string'))fail();
  const targets:Record<string,BatchTarget>={},snapshots=new Map<string,{before:string[];version:number}>();
  for(const g of p.groups){
    if(!record(g)||!uuid(g.targetId)||typeof g.name!=='string'||!Number.isSafeInteger(g.expectedVersion)||Number(g.expectedVersion)<1||!Array.isArray(g.before)||!g.before.every(uuid)||sorted(g.before).length!==g.before.length||snapshots.has(g.targetId))fail();
    const live=catalog.templates.find(t=>t.id===g.targetId);
    if(!live||live.segment_name!==g.name||live.lifecycle_status!=='active')fail();
    targets[g.name]={id:g.targetId,version:Number(g.expectedVersion)};snapshots.set(g.targetId,{before:g.before,version:Number(g.expectedVersion)});
  }
  const shadow={...catalog,templates:catalog.templates.map(t=>{const s=snapshots.get(t.id);return s?{...t,template_version:s.version,vendor_ids:s.before,member_count:s.before.length}:t})};
  const expected=buildMembershipPlan(batch,shadow,org,inputHash,p.selectedRowIds,targets,now);
  // Canonical files are exported by this module. Reject extra authority or changed deltas.
  const canonical=(value:unknown):string=>JSON.stringify(value,(_k,v)=>record(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  if(canonical(p)!==canonical(expected))fail();
  return expected;
}

export function assertMembershipPlan(plan:MembershipPlan,batch:BatchReview,catalog:BatchCatalog,org:string,inputHash:string,now=Date.now()) {
  return parseMembershipPlan(JSON.stringify(plan),batch,catalog,org,inputHash,now);
}
