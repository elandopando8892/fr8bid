import type { BatchReview, BatchCatalog, BatchRow } from './batch-review';
import { batchIsCurrent } from './batch-review';

export interface TreatmentRow { id: string; packageId: string; row: BatchRow; action: string; required: string; blockers: string[] }
export interface TreatmentPackage { id: string; group: string; rows: TreatmentRow[] }
export interface TreatmentPlan { manifest: string; inputHash: string; packages: TreatmentPackage[]; rows: TreatmentRow[]; sourceCount: number; referenceCount: number }
export interface TreatmentDecision { id: string; status: 'reviewed_proposal' | 'still_unresolved'; note: string; evidenceHash: string; locator: string; scopeConfirmed: boolean }
function fail(): never { throw new Error('TREATMENT_INVALID'); }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 20000): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const unique = (xs: unknown[]) => new Set(xs).size === xs.length;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const refs = (xs: BatchRow['sources']) => xs.map(s => [s.file, s.sha256, s.locator, s.date].join('\u0000')).sort();
export async function fileDigest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}

/** Local preparation adapter; does not execute the Features classifier or trust file scope. */
export function parseTreatment(value: string, batch: BatchReview, inputHash: string, catalog: BatchCatalog, org: string, now = Date.now()): TreatmentPlan {
  if (new TextEncoder().encode(value).length > 16 * 1024 * 1024) fail();
  let p: unknown; try { p = JSON.parse(value); } catch { return fail(); }
  if (!record(p) || p.artifact_format !== 'bidware-engine-exception-treatment-preparation/1' ||
      p.artifact_kind !== 'documentary_preparation_not_runtime_contract' || p.authority !== 'preparation_only' ||
      p.current_catalog_verified !== false || p.organization_id !== null && p.organization_id !== org ||
      p.production_changes !== 0 || p.provider_calls !== 0 || p.approved !== false || p.applied !== false ||
      p.source_manifest_sha256 !== batch.manifestHash || !hash(inputHash) || p.review_data_sha256 !== inputHash ||
      !hash(p.features_proposals_sha256) || p.source_review_date !== batch.reviewedOn || !record(p.summary) ||
      !Array.isArray(p.rows) || p.rows.length !== 47 || !Array.isArray(p.batches) || p.batches.length !== 11 ||
      !batchIsCurrent(catalog, org, now) || catalog.templates.some(t => t.organization_id !== org)) fail();
  const expected = batch.rows.filter(r => !r.additional && ['C', 'D', 'E', 'F'].includes(r.group));
  if (expected.length !== 47) fail();
  const rows = p.rows.map((r): TreatmentRow => {
    if (!record(r) || !record(r.features_original) || !record(r.source_template_at_cut)) return fail();
    const source = expected.find(x => x.id === r.review_row_id), f = r.features_original;
    if (!source || r.group !== source.group || r.source_proposal_id !== source.proposalId ||
        r.status !== 'prepared_pending_evidence' || !text(r.treatment_batch_id, 3) || !/^(C01|D0[12]|E0[1-6]|F0[12])$/.test(r.treatment_batch_id) ||
        r.treatment_batch_id[0] !== source.group || !text(r.proposed_treatment) || !text(r.closure_evidence_required) ||
        !Array.isArray(r.secondary_blockers) || r.secondary_blockers.length > 20 || !r.secondary_blockers.every(s => text(s, 1000)) ||
        r.organization_id !== null && r.organization_id !== org || r.target_template_id !== null ||
        ['reviewed','approved','applied','membership_change_authorized','invitation_authorized'].some(k => r[k] !== false) ||
        f.proposal_id !== source.proposalId || f.group !== source.group || f.vendor_id !== source.vendorId || f.template_id !== source.sourceId ||
        f.evidence_scope !== source.scope || f.restrictions !== source.restrictions || !Array.isArray(f.source_refs) ||
        !f.source_refs.every(s => record(s) && text(s.file,1500) && hash(s.sha256) && text(s.locator,2000) && typeof s.date === 'string')) return fail();
    const declared = (f.source_refs as Record<string,string>[]).map(s => ({ file:s.file,sha256:s.sha256,locator:s.locator,date:s.date }));
    // Features may have distinct rate records at one locator. Preserve their exact
    // multiplicity; reject additions/removals, rather than deduplicating references.
    if (!same(refs(declared), refs(source.sources))) fail();
    const cut = r.source_template_at_cut, live = catalog.templates.find(t => t.id === source.sourceId);
    if (cut.id !== source.sourceId || cut.version !== source.sourceVersion || cut.lifecycle !== source.sourceLifecycle ||
        !live || live.template_version !== cut.version || live.lifecycle_status !== cut.lifecycle || !live.vendor_ids?.includes(source.vendorId)) fail();
    return { id:source.id,packageId:r.treatment_batch_id,row:source,action:r.proposed_treatment,required:r.closure_evidence_required,blockers:r.secondary_blockers as string[] };
  });
  if (!unique(rows.map(r => r.id)) || expected.some(r => !rows.some(x => x.id === r.id))) fail();
  const packages = p.batches.map((b): TreatmentPackage => {
    if (!record(b) || !text(b.id,3) || !Array.isArray(b.row_ids) || !unique(b.row_ids) || b.status !== 'prepared_pending_evidence') return fail();
    const members = rows.filter(r => r.packageId === b.id);
    if (!members.length || b.group !== members[0].row.group || b.count !== members.length ||
        !same([...b.row_ids].sort(), members.map(r=>r.id).sort()) ||
        members.some(r=>r.action!==b.action_proposed || r.required!==b.closure_evidence_required) || !Array.isArray(b.source_hashes) ||
        !same([...b.source_hashes].sort(), [...new Set(members.flatMap(r=>r.row.sources.map(s=>s.sha256)))].sort())) fail();
    return {id:b.id,group:b.group as string,rows:members};
  });
  if (!unique(packages.map(b=>b.id))) fail();
  const groupCounts = Object.fromEntries(['C','D','E','F'].map(g=>[g,rows.filter(r=>r.row.group===g).length]));
  if (!same(groupCounts,{C:21,D:13,E:11,F:2}) || packages.find(b=>b.id==='D01')?.rows.length!==9 || packages.find(b=>b.id==='D02')?.rows.length!==4 ||
      !same(packages.filter(b=>b.group==='E').map(b=>b.rows.length).sort(),[1,1,1,1,3,4]) ||
      packages.filter(b=>b.group==='F').some(b=>b.rows.length!==1)) fail();
  const sourceCount = new Set(rows.flatMap(r=>r.row.sources.map(s=>s.sha256))).size, referenceCount=rows.reduce((n,r)=>n+r.row.sources.length,0);
  const counts = {relations:47,distinct_carriers:new Set(rows.map(r=>r.row.vendorId)).size,work_packages:11,source_files:sourceCount,source_references:referenceCount,resolved:0,other_L1_excluded:batch.rows.filter(r=>!r.additional).length-47,additional_L3_excluded:batch.rows.filter(r=>r.additional).length,other_lots_out_of_scope:batch.otherRelations};
  const summary=p.summary;
  if (Object.entries(counts).some(([k,v])=>summary[k]!==v) || !record(summary.groups) || Object.entries(groupCounts).some(([k,v])=>(summary.groups as Record<string,unknown>)[k]!==v)) fail();
  const plan = {manifest:batch.manifestHash,inputHash,packages,rows,sourceCount,referenceCount};
  assertTreatmentCurrent(plan,org,catalog,now);
  return plan;
}

/** Exact selection only, with no status propagation across packages or unselected IDs. */
export function prepareDecisions(plan: TreatmentPlan, packageId: string, ids: string[], draft: Omit<TreatmentDecision,'id'>): TreatmentDecision[] {
  const pack=plan.packages.find(p=>p.id===packageId);
  if (!pack || !ids.length || !unique(ids) || ids.some(id=>!pack.rows.some(r=>r.id===id)) ||
      !['reviewed_proposal','still_unresolved'].includes(draft.status) || !text(draft.note,4000) || draft.scopeConfirmed !== true ||
      typeof draft.locator!=='string' || draft.locator.length>2000 || draft.evidenceHash!==''&&!hash(draft.evidenceHash) ||
      (draft.status==='reviewed_proposal' && (!hash(draft.evidenceHash) || !text(draft.locator,2000)))) fail();
  return ids.map(id=>({id,status:draft.status,note:draft.note,evidenceHash:draft.evidenceHash,locator:draft.locator,scopeConfirmed:true}));
}

export function assertTreatmentCurrent(plan: TreatmentPlan, org: string, catalog: BatchCatalog, now=Date.now()) {
  if (!batchIsCurrent(catalog,org,now) || catalog.templates.some(t=>t.organization_id!==org) || plan.rows.some(r=>{
    const live=catalog.templates.find(t=>t.id===r.row.sourceId);
    return !live || live.template_version!==r.row.sourceVersion || live.lifecycle_status!==r.row.sourceLifecycle || live.segment_name!==r.row.sourceName || !live.vendor_ids?.includes(r.row.vendorId);
  })) fail();
}

export function exportTreatment(plan: TreatmentPlan, decisions: TreatmentDecision[], org: string, catalog: BatchCatalog, planHash: string, now=Date.now()) {
  assertTreatmentCurrent(plan,org,catalog,now);
  if (!hash(planHash) || !unique(decisions.map(d=>d.id))) fail();
  const cleanDecisions = decisions.flatMap(d => { const r=plan.rows.find(r=>r.id===d.id);if(!r)fail();return prepareDecisions(plan,r.packageId,[d.id],d); });
  return {artifact_format:'bidware-engine-exception-treatment-result/1',authority:'local_proposal_only',organization_id:org,source_manifest_sha256:plan.manifest,review_data_sha256:plan.inputHash,treatment_plan_sha256:planHash,approved:false,applied:false,resolved:0,decisions:cleanDecisions,excluded_row_ids:plan.rows.filter(r=>!decisions.some(d=>d.id===r.id)).map(r=>r.id),source_versions:catalog.templates.filter(t=>plan.rows.some(r=>r.row.sourceId===t.id)).map(t=>({id:t.id,version:t.template_version})),restrictions:plan.rows.map(r=>({id:r.id,restrictions:r.row.restrictions,blockers:r.blockers}))};
}

/** Reopen only this exact local proposal. The file never supplies current authority. */
export function parseTreatmentResult(value: string, plan: TreatmentPlan, org: string, catalog: BatchCatalog, planHash: string, now=Date.now()): TreatmentDecision[] {
  assertTreatmentCurrent(plan,org,catalog,now);
  if (new TextEncoder().encode(value).length > 16 * 1024 * 1024) fail();
  let p: unknown; try { p=JSON.parse(value); } catch { return fail(); }
  if (!record(p) || !Array.isArray(p.decisions) || p.decisions.length>plan.rows.length ||
      !Array.isArray(p.excluded_row_ids) || p.excluded_row_ids.length>plan.rows.length || !p.excluded_row_ids.every(id=>typeof id==='string') ||
      !Array.isArray(p.source_versions) || p.source_versions.length>plan.rows.length ||
      !Array.isArray(p.restrictions) || p.restrictions.length!==plan.rows.length) fail();
  const exactKeys=(item: Record<string,unknown>, keys: string[])=>same(Object.keys(item).sort(),[...keys].sort());
  const decisions=p.decisions.flatMap(d=>{
    if (!record(d) || !exactKeys(d,['id','status','note','evidenceHash','locator','scopeConfirmed']) || typeof d.id!=='string') return fail();
    const row=plan.rows.find(r=>r.id===d.id);if(!row) return fail();
    // Reuse the explicit-ID rules, including evidence and the reviewer's declaration.
    return prepareDecisions(plan,row.packageId,[d.id],d as unknown as TreatmentDecision);
  });
  if (!p.source_versions.every(v=>record(v) && exactKeys(v,['id','version']) && typeof v.id==='string' && Number.isSafeInteger(v.version)) ||
      !p.restrictions.every(r=>record(r) && exactKeys(r,['id','restrictions','blockers']) && typeof r.id==='string' && typeof r.restrictions==='string' &&
        Array.isArray(r.blockers) && r.blockers.length<=20 && r.blockers.every(b=>typeof b==='string'))) fail();
  const expected=exportTreatment(plan,decisions,org,catalog,planHash,now);
  if (!exactKeys(p,Object.keys(expected))) fail();
  const arrays=['decisions','excluded_row_ids','source_versions','restrictions'];
  for (const [key,wanted] of Object.entries(expected)) {
    if (!arrays.includes(key) && p[key]!==wanted) fail();
  }
  // Object key order and row order are irrelevant; multiplicity and every value remain exact.
  const ordered=(items: unknown[])=>items.map(item=>JSON.stringify(record(item)?Object.keys(item).sort().map(k=>[k,item[k]]):item)).sort();
  for (const key of arrays) if (!same(ordered(p[key] as unknown[]),ordered(expected[key as keyof typeof expected] as unknown[]))) fail();
  return decisions.sort((a,b)=>a.id.localeCompare(b.id));
}
