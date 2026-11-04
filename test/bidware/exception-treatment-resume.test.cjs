const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildSync}=require('esbuild'),{webcrypto}=require('node:crypto');
const {makeTreatmentFixture,digest}=require('./exception-treatment.fixture.cjs');
function compile(file){const module={exports:{}};vm.runInNewContext(buildSync({entryPoints:[file],bundle:true,write:false,platform:'node',format:'cjs',external:['./templates.service']}).outputFiles[0].text,{module,exports:module.exports,TextEncoder,crypto:webcrypto,require:()=>({})});return module.exports;}
const api=compile('src/bidware/features/carrier-templates/exception-treatment.ts'),base=compile('src/bidware/features/carrier-templates/batch-review.ts');
const clean=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const f=makeTreatmentFixture();f.batch=base.parseBatchReview(f.raw);f.catalog=base.validateBatchCatalog(f.batch,f.org,f.templates,1000);
 f.planHash=digest(JSON.stringify(f.plan));f.plan=api.parseTreatment(JSON.stringify(f.plan),f.batch,f.inputHash,f.catalog,f.org,1000);
 const draft={status:'still_unresolved',note:'Synthetic pending evidence; no operational authorization.',evidenceHash:'',locator:'',scopeConfirmed:true};
 f.decisions=[...api.prepareDecisions(f.plan,'C01',f.plan.packages[0].rows.slice(0,2).map(r=>r.id),draft),...api.prepareDecisions(f.plan,'D01',[f.plan.packages[1].rows[0].id],{...draft,status:'reviewed_proposal',evidenceHash:'e'.repeat(64),locator:'Synthetic page 2'})];
 f.result=clean(api.exportTreatment(f.plan,f.decisions,f.org,f.catalog,f.planHash,1000));return f;
}
const restore=(f,value=JSON.stringify(f.result),now=1000)=>api.parseTreatmentResult(value,f.plan,f.org,f.catalog,f.planHash,now);

test('round trip reopens only explicit IDs across packages and preserves original restrictions',()=>{
 const f=fixture(),ds=restore(f);assert.deepEqual(clean(ds),clean(f.decisions).sort((a,b)=>a.id.localeCompare(b.id)));
 const exported=api.exportTreatment(f.plan,ds,f.org,f.catalog,f.planHash,1000);
 assert.deepEqual(clean(exported),f.result);assert.equal(exported.excluded_row_ids.length,44);assert.equal(exported.restrictions.length,47);
 assert.equal(exported.approved,false);assert.equal(exported.applied,false);assert.equal(exported.resolved,0);
});
test('reopening is deterministic, does not mutate previous preparation, and accepts JSON formatting/key/row order changes',()=>{
 const f=fixture(),before=JSON.stringify(f.result);
 f.result=Object.fromEntries(Object.entries(f.result).reverse());
 for(const key of ['decisions','excluded_row_ids','source_versions','restrictions'])f.result[key].reverse();
 f.result.decisions=f.result.decisions.map(d=>Object.fromEntries(Object.entries(d).reverse()));
 const first=clean(restore(f,JSON.stringify(f.result,null,2)));
 assert.deepEqual(first,clean(restore(f)));assert.equal(first.length,3);assert.equal(before,JSON.stringify(api.exportTreatment(f.plan,f.decisions,f.org,f.catalog,f.planHash,1000)));
});
for(const [name,change] of [
 ['foreign organization',f=>f.result.organization_id='org_other'],
 ['another manifest',f=>f.result.source_manifest_sha256='1'.repeat(64)],
 ['another batch',f=>f.result.review_data_sha256='2'.repeat(64)],
 ['another exact plan',f=>f.result.treatment_plan_sha256='3'.repeat(64)],
 ['unsupported schema',f=>f.result.artifact_format='bidware-engine-exception-treatment-result/2'],
 ['operational authority',f=>f.result.authority='approved'],
 ['approved root',f=>f.result.approved=true],['applied root',f=>f.result.applied=true],['resolved root',f=>f.result.resolved=3],
 ['extra operational root',f=>f.result.membership_change_authorized=true],
 ['unknown decision',f=>f.result.decisions[0].id='unknown'],
 ['unselected primary proposal',f=>f.result.decisions[0].id=f.batch.rows[0].id],
 ['duplicate decision',f=>f.result.decisions.push(f.result.decisions[0])],
 ['unconfirmed scope',f=>f.result.decisions[0].scopeConfirmed=false],
 ['empty reason',f=>f.result.decisions[0].note='  '],['oversized reason',f=>f.result.decisions[0].note='x'.repeat(4001)],
 ['invalid decision status',f=>f.result.decisions[0].status='approved'],
 ['reviewed without evidence',f=>f.result.decisions[0].status='reviewed_proposal'],
 ['reviewed without locator',f=>f.result.decisions[2].locator=''],
 ['invalid evidence hash',f=>f.result.decisions[0].evidenceHash='bad'],
 ['extra decision permission',f=>f.result.decisions[0].approved=true],
 ['missing decision field',f=>delete f.result.decisions[0].locator],
 ['null decision',f=>f.result.decisions[0]=null],
 ['excluded ID also included',f=>f.result.excluded_row_ids[0]=f.result.decisions[0].id],
 ['missing excluded ID',f=>f.result.excluded_row_ids.pop()],
 ['duplicate excluded ID',f=>f.result.excluded_row_ids[1]=f.result.excluded_row_ids[0]],
 ['unknown excluded ID',f=>f.result.excluded_row_ids[0]='unknown'],
 ['old source version',f=>f.result.source_versions[0].version--],
 ['missing source',f=>f.result.source_versions.pop()],
 ['duplicate source',f=>f.result.source_versions[1]=f.result.source_versions[0]],
 ['extra source authority',f=>f.result.source_versions[0].approved=true],
 ['removed restriction',f=>f.result.restrictions[0].restrictions=''],
 ['removed blocker',f=>f.result.restrictions[0].blockers=[]],
 ['missing restriction row',f=>f.result.restrictions.pop()],
 ['duplicate restriction row',f=>f.result.restrictions[1]=f.result.restrictions[0]],
 ['unknown restriction row',f=>f.result.restrictions[0].id='unknown'],
 ['extra restriction permission',f=>f.result.restrictions[0].applied=true],
 ['nested payload',f=>f.result.restrictions[0].blockers=[{html:'<script>forbidden()</script>'}]],
 ['live source version drift',f=>f.catalog.templates[0].template_version++],
 ['live source membership drift',f=>f.catalog.templates[0].vendor_ids=[]],
 ['live foreign catalog',f=>f.catalog.templates[0].organization_id='org_other'],
 ['account organization switch',f=>f.org='org_other']
])test(`rejects ${name} without mutating saved decisions`,()=>{const f=fixture(),before=JSON.stringify(f.decisions);change(f);assert.throws(()=>restore(f),/TREATMENT_INVALID/);assert.equal(JSON.stringify(f.decisions),before);});
test('expiration requires revalidation; the file cannot renew the catalog',()=>{const f=fixture();assert.throws(()=>restore(f,JSON.stringify(f.result),301001),/TREATMENT_INVALID/);f.catalog=base.validateBatchCatalog(f.batch,f.org,f.templates,302000);assert.equal(restore(f,JSON.stringify(f.result),302000).length,3);});
test('empty valid export clears local results explicitly, without removing restrictions',()=>{const f=fixture();f.result=clean(api.exportTreatment(f.plan,[],f.org,f.catalog,f.planHash,1000));assert.deepEqual(clean(restore(f)),[]);assert.equal(f.result.excluded_row_ids.length,47);assert.equal(f.result.restrictions.length,47);});
test('malformed, missing, oversized and multibyte oversized documents fail closed',()=>{const f=fixture();for(const raw of ['{','null','[]','{}',' '.repeat(16*1024*1024+1),'á'.repeat(8*1024*1024+1)])assert.throws(()=>restore(f,raw),/TREATMENT_INVALID/);});
