const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {buildSync}=require('esbuild'),vm=require('node:vm');
const {makeBatchFixture,uid}=require('./batch-review.fixture.cjs');
function compile(file,mock) {
  const result=buildSync({entryPoints:[file],bundle:true,write:false,platform:'node',format:'cjs',external:['./templates.service']});
  const module={exports:{}};
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,TextEncoder,require:name=>{assert.equal(name,'./templates.service');return mock;}});
  return module.exports;
}
const api=compile('src/bidware/features/carrier-templates/batch-review.ts',{});
const parse=packet=>api.parseBatchReview(JSON.stringify(packet));
const clone=x=>JSON.parse(JSON.stringify(x));

test('organization text keys match the authenticated scope exactly, without assigning scope to the file',()=>{
 const f=makeBatchFixture();const batch=parse(f.packet);
 assert.equal(api.validateBatchCatalog(batch,f.org,f.templates).organizationId,'org_fixture_primary');
 assert.equal(batch.declaredOrganization,null);
 f.packet.organization_id=f.org;
 assert.equal(api.validateBatchCatalog(parse(f.packet),f.org,f.templates).organizationId,f.org);
 assert.throws(()=>api.validateBatchCatalog(parse(f.packet),'org_fixture_other',f.templates),/BATCH_ORGANIZATION/);
 f.templates[0].organization_id='org_fixture_other';
 assert.throws(()=>api.validateBatchCatalog(parse(f.packet),f.org,f.templates),/BATCH_ORGANIZATION/);
});

test('UUID organization keys remain supported only when every scope matches',()=>{
 const f=makeBatchFixture();f.org=uid(9000);f.packet.organization_id=f.org;
 for(const row of f.templates)row.organization_id=f.org;
 assert.equal(api.validateBatchCatalog(parse(f.packet),f.org,f.templates).organizationId,f.org);
});

test('organization keys reject blank, non-string, padded and control-bearing values',()=>{
 const f=makeBatchFixture();for(const key of ['',null,42,' org_fixture_primary','org_fixture_primary ','org_fixture\nprimary']){
  assert.throws(()=>api.validateBatchCatalog(parse(f.packet),key,f.templates),/BATCH_ORGANIZATION/);
  if(key!==null){f.packet.organization_id=key;assert.throws(()=>parse(f.packet),/BATCH_INVALID/);f.packet.organization_id=null;}
 }
});
test('full documentary batch keeps 174 plus L3, groups and raw provenance; does not auto-select a target',()=>{
 const {packet,templates,org}=makeBatchFixture(),batch=parse(packet),stats=api.batchCounts(batch.rows);
 assert.equal(stats.primary,174);assert.equal(stats.additional,1);assert.equal(stats.carriers,122);assert.equal(stats.exceptions,47);assert.equal(stats.groups.A,5);
 const cat=api.validateBatchCatalog(batch,org,templates,1000);assert.equal(cat.organizationId,org);assert.equal(batch.declaredOrganization,null);
 assert.equal(api.destinationStatus(batch.rows[0].proposedName,undefined,cat),'unmapped');
 assert.equal(api.filterBatchRows(batch,'C','','').length,21);assert.equal(api.filterBatchRows(batch,'E','','').length,11);
 assert.equal(api.filterBatchRows(batch,'A','','MISSING').length,0);assert.equal(api.filterBatchRows(batch,'A',batch.rows[0].proposedName,'').length,1);
 assert.equal(batch.rows[0].sources[0].locator,'page 1');
});
for(const [name,mutate,expected] of [
 ['duplicate row',p=>p.rows.push(clone(p.rows[0])),'BATCH_DUPLICATE'],
 ['duplicate relation with another ID',p=>{p.rows[1].vendor_id=p.rows[0].vendor_id;p.rows[1].source_template_id=p.rows[0].source_template_id;},'BATCH_DUPLICATE'],
 ['count mismatch',p=>p.summary.exceptions=0,'BATCH_INVALID'],
 ['fake group count',p=>p.groups[0].count=99,'BATCH_INVALID'],
 ['fake group IDs',p=>p.groups[0].review_row_ids[0]='bad','BATCH_INVALID'],
 ['approved file',p=>p.rows[0].approved=true,'BATCH_INVALID'],
 ['applied file',p=>p.rows[0].applied=true,'BATCH_INVALID'],
 ['contact permission',p=>p.rows[0].invitation_authorized=true,'BATCH_INVALID'],
 ['claimed current availability',p=>p.rows[0].current_availability_verified=true,'BATCH_INVALID'],
 ['target smuggled in file',p=>p.rows[0].target_template_id=uid(100),'BATCH_INVALID'],
 ['missing locator',p=>delete p.rows[0].source_refs[0].locator,'BATCH_INVALID'],
 ['missing hash',p=>delete p.rows[0].source_refs[0].sha256,'BATCH_INVALID'],
 ['broken identity',p=>p.rows[0].vendor_id='some name','BATCH_INVALID'],
 ['legacy format',p=>p.artifact_format='bidware-carrier-review/1','BATCH_INVALID'],
 ['spoofed organization',p=>p.organization_id='sales@example.com','BATCH_INVALID'],
 ['additional counted as L1',p=>p.rows[174].outside_L1=false,'BATCH_INVALID'],
]) test(`rejects ${name} atomically`,()=>{const {packet}=makeBatchFixture();mutate(packet);assert.throws(()=>parse(packet),new RegExp(expected));});
test('rejects invalid JSON and byte limit before API',()=>{
 assert.throws(()=>api.parseBatchReview('{'),/BATCH_INVALID/);
 assert.throws(()=>api.parseBatchReview('x'.repeat(16*1024*1024+1)),/BATCH_SIZE/);
});
for(const [name,mutate,expected] of [
 ['foreign organization',f=>f.templates[0].organization_id=uid(9999),'BATCH_ORGANIZATION'],
 ['organization missing',f=>delete f.templates[0].organization_id,'BATCH_ORGANIZATION'],
 ['declared organization differs',f=>f.packet.organization_id=uid(9999),'BATCH_ORGANIZATION'],
 ['origin unavailable',f=>f.templates.shift(),'BATCH_SCOPE'],
 ['unbound vendor',f=>f.templates[0].vendor_ids.pop(),'BATCH_SCOPE'],
 ['duplicate catalog',f=>f.templates.push(clone(f.templates[0])),'BATCH_CATALOG'],
 ['malformed version',f=>f.templates[0].template_version=0,'BATCH_CATALOG'],
 ['inconsistent members',f=>f.templates[0].member_count=0,'BATCH_CATALOG'],
]) test(`catalog refuses ${name}`,()=>{const f=makeBatchFixture();mutate(f);assert.throws(()=>api.validateBatchCatalog(parse(f.packet),f.org,f.templates),new RegExp(expected));});
test('destinations require explicit ID choice, active state, exact name and unchanged version',()=>{
 const f=makeBatchFixture(),b=parse(f.packet),cat=api.validateBatchCatalog(b,f.org,f.templates,1000),name=b.rows[0].proposedName;
 assert.equal(api.destinationStatus(name,{id:uid(100),version:3},cat),'current');
 assert.equal(api.destinationStatus(name,{id:uid(100),version:2},cat),'changed');
 assert.equal(api.destinationStatus(name,{id:uid(999),version:1},cat),'missing');
 assert.equal(api.destinationStatus(name,{id:uid(1),version:2},cat),'archived');
 assert.equal(api.destinationStatus(name,{id:uid(101),version:3},cat),'name_mismatch');
 cat.templates.find(t=>t.id===uid(100)).lifecycle_status='draft';
 assert.equal(api.destinationStatus(name,{id:uid(100),version:3},cat),'draft');
});
test('expiry and account mismatch never expose a current catalog',()=>{
 const f=makeBatchFixture(),cat=api.validateBatchCatalog(parse(f.packet),f.org,f.templates,1000);
 assert.equal(api.batchIsCurrent(cat,f.org,1000),true);assert.equal(api.batchIsCurrent(cat,f.org,300999),true);
 assert.equal(api.batchIsCurrent(cat,f.org,301000),false);assert.equal(api.batchIsCurrent(cat,f.org,999),false);
 assert.equal(api.batchIsCurrent(cat,uid(9999),1001),false);assert.equal(api.batchIsCurrent(null,f.org,1001),false);
});
test('service uses the existing full catalog read only; null organization is not silently filled in',async()=>{
 const f=makeBatchFixture(),calls=[];
 const svc=compile('src/bidware/features/carrier-templates/batch-review.service.ts',{listAllCarrierTemplates:async(...args)=>{calls.push(args);return {rows:f.templates};}});
 const b=parse(f.packet);const result=await svc.readBatchCatalog(b,f.org);
 assert.equal(calls.length,1);assert.equal(calls[0].length,0);assert.equal(result.organizationId,f.org);assert.equal(b.declaredOrganization,null);
 b.declaredOrganization=uid(9999);await assert.rejects(()=>svc.readBatchCatalog(b,f.org),/BATCH_ORGANIZATION/);assert.equal(calls.length,1);
});
test('service propagates permission, interruption and incomplete reads; no automatic retry',async()=>{
 const f=makeBatchFixture();for(const code of ['403','409','network']) {let calls=0;
 const svc=compile('src/bidware/features/carrier-templates/batch-review.service.ts',{listAllCarrierTemplates:async()=>{calls++;throw new Error(code);}});
 await assert.rejects(()=>svc.readBatchCatalog(parse(f.packet),f.org),new RegExp(code));assert.equal(calls,1);}
});
test('the real prepared packet parses locally; no organization or live target is asserted',context=>{
 const path='.artifacts/engine-review-batches-20261025/review-data.json';
 if(!fs.existsSync(path))return context.skip('Documentary packet is local and is not bundled with the product');
 const result=api.parseBatchReview(fs.readFileSync(path,'utf8'));
 assert.equal(result.rows.length,175);assert.equal(result.declaredOrganization,null);
});
