import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startDraftLab} from './draft-preparation.lab.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const lab=await startDraftLab(),browser=await chromium.launch({headless:true}),external=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===lab.origin?route.continue():(external.push(route.request().url()),route.abort()));
 const page=await context.newPage();await fetch(lab.origin+'/control',{method:'POST',body:JSON.stringify({mode:'failed'})});
 await page.goto(`${lab.origin}/rfx/${lab.eventId}/message?baseline`,{waitUntil:'networkidle'});
 await page.locator('.msg-channel input').nth(1).check();await page.locator('.msg-channel input').nth(2).check();
 await page.locator('.launch-actions .primary').click();await page.getByRole('dialog').getByRole('button',{name:'Generar borradores',exact:true}).click();
 await page.getByText(/Synthetic channel failure/).waitFor();
 const notice=await page.locator('main [role=status]').filter({hasText:'Synthetic channel failure'}).innerText(),callChannels=lab.result().calls.filter(c=>c.action==='generate_outreach_drafts').map(c=>c.channel);
 assert.deepEqual(callChannels,['email','whatsapp']);assert.equal(lab.data.messages.length,35);assert.equal(/35/.test(notice),false);assert.deepEqual(external,[]);
 await page.screenshot({path:path.join(lab.out,'baseline-partial-failure.png'),fullPage:true});
 fs.writeFileSync(path.join(lab.out,'baseline-reproduction.json'),JSON.stringify({reproduced:true,baseline:'41beba9',notice,channels:callChannels,syntheticDrafts:35,confirmedEmailCountMissing:true,external,providerCalls:0},null,2));
 console.log('REPRODUCED: email created 35 synthetic drafts; later failure hides the confirmed count. No real writes.');
}finally{await browser.close();await lab.close();}
