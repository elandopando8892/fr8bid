import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {transformSync} from 'esbuild';
const file=new URL('../../src/bidware/features/outreach/delivery-diagnosis.ts',import.meta.url);
const code=transformSync(fs.readFileSync(file,'utf8'),{loader:'ts',format:'esm'}).code;
const {deliveryDiagnosis}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('historical precondition is explicit and not mistaken for quota or current provider status',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'queued',delivery_error:'Precondition check failed.',send_result:{stage:'manual_status'}}).kind,'precondition');});
test('uncertain outcome takes precedence over a quota string',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'delivery_unknown',delivery_error:'Quota exceeded'}).kind,'uncertain');});
test('a stored provider receipt always takes precedence over previous error',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'queued',provider_message_id:'receipt',delivery_error:'Quota exceeded'}).kind,'accepted');});
test('manual mark is distinguished from provider receipt',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'manual_sent',manual_sent_at:'2026-10-07'}).kind,'manual');});
test('structured quota and authorization reasons are interpreted separately',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'failed',delivery_issue:{http_status:403,reason_codes:['userRateLimitExceeded']}}).kind,'quota');assert.equal(deliveryDiagnosis({channel:'email',status:'failed',delivery_issue:{http_status:403,reason_codes:['domainPolicy']}}).kind,'authorization');});
test('unavailable diagnostic does not invent a successful or rejected attempt',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'queued',delivery_issue_unavailable:true}).kind,'unavailable');});
test('drafts and generic failures stay distinct',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'drafted'}).kind,'none');assert.equal(deliveryDiagnosis({channel:'email',status:'failed',delivery_error:'Unknown failure'}).kind,'failure');});
test('WhatsApp never receives Gmail-specific diagnosis',()=>{assert.equal(deliveryDiagnosis({channel:'whatsapp',status:'failed',delivery_error:'Quota exceeded'}).kind,'none');});
test('daily quota is not authorization and a bare 403 does not identify its cause',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'failed',delivery_issue:{http_status:403,reason_codes:['dailyLimitExceeded']}}).kind,'quota');assert.equal(deliveryDiagnosis({channel:'email',status:'failed',delivery_issue:{http_status:403,reason_codes:[]}}).kind,'failure');});
test('manual queuing does not turn an uncertain historical attempt into a retryable failure',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'queued',delivery_issue:{status:'delivery_unknown',error:'Transport lost'}}).kind,'uncertain');});

test('queued bare 403 is visible generic failure without invented quota or access',()=>{assert.equal(deliveryDiagnosis({channel:'email',status:'queued',delivery_issue:{http_status:403,reason_codes:[]}}).kind,'failure');});

test('successful or malformed HTTP alone must not invent a failed send',()=>{for(const http_status of [200,204,302,0,999,-403])assert.equal(deliveryDiagnosis({channel:'email',status:'queued',delivery_issue:{http_status}}).kind,'none',String(http_status));});
