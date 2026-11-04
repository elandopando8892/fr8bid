// Real React/AuthProvider/API client, deferred synthetic auth; localhost only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3040';
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const output = path.resolve(process.env.TEST_OUTPUT || '.test-output/sprint13-auth');
const probe = process.argv.includes('--probe');
const auth = `
export async function getSession(){return {user:window.fixture.user};}
export function getUser(){return new Promise((resolve,reject)=>window.fixture.pending.push({resolve,reject}));}
export function onAuthStateChange(cb){window.fixture.notify=()=>cb({user:window.fixture.user});return ()=>{};}
export async function signOut(){window.fixture.signouts++;}
export async function signInWithOAuth(){}
export async function getAccessToken(){if(window.fixture.holdTokens)return new Promise(resolve=>window.fixture.tokens.push(resolve));return 'synthetic-only';}
`;
const html = `<!doctype html><div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
const {createRoot}=ReactDOM;
import {currentTeamRole} from '/src/bidware/lib/roles.ts';
import {callFunction} from '/src/bidware/lib/api-client.ts';
const {default:RefreshRuntime}=await import('/@react-refresh');
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
window.__vite_plugin_react_preamble_installed__=true;
const {AuthProvider,useAuth}=await import('/src/bidware/auth/AuthContext.tsx');
window.fixture={user:{id:'synthetic-user-a',email:'fixture@heymarksman.com',app_metadata:{roles:['admin']}},pending:[],tokens:[],signouts:0};
window.fixture.currentRole=currentTeamRole;
window.fixture.call=async(action)=>{try{await callFunction('rateware-api',action);return {ok:true};}catch(e){return {status:e.status,code:e.code,message:e.message};}};
function Probe(){const a=useAuth();return React.createElement('main',null,
  React.createElement('pre',{id:'state'},JSON.stringify({authenticated:a.authenticated,role:a.role,loaded:a.roleLoaded,read:a.can('read'),operate:a.can('operate'),admin:a.can('admin'),clientRole:currentTeamRole()})),
  React.createElement('button',{disabled:!a.can('operate')},'Fixture write'));
}
createRoot(document.getElementById('root')).render(React.createElement(AuthProvider,null,React.createElement(Probe)));
</script>`;
async function run(browser,lang){
  const context=await browser.newContext();
  await context.addInitScript(lang=>localStorage.setItem('bidware.team.lang',lang),lang);
  const calls=[],unexpected=[],errors=[];
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin){
      if(url.pathname==='/__auth-role-fixture') return route.fulfill({contentType:'text/html',body:html});
      if(url.pathname==='/src/bidware/lib/auth.ts') return route.fulfill({contentType:'text/javascript',body:auth});
      return route.continue();
    }
    if(url.hostname==='bidware-fixture.supabase.co'&&url.pathname==='/functions/v1/rateware-api'){
      calls.push(req.postDataJSON());return route.fulfill({json:{rows:[],updated:1}});
    }
    unexpected.push(url.origin);return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/__auth-role-fixture');
  try{await page.waitForFunction(()=>window.fixture?.pending.length===1&&document.querySelector('#state'));}
  catch(e){console.error(JSON.stringify({errors,unexpected,state:await page.locator('body').innerText()}));throw e;}
  const state=()=>page.locator('#state').textContent().then(JSON.parse);
  const settle=async(role,index)=>{
    await page.evaluate(({role,index})=>window.fixture.pending[index].resolve({...window.fixture.user,app_metadata:{roles:[role]}}),{role,index});
    await page.waitForFunction(role=>{const s=JSON.parse(document.querySelector('#state').textContent);return s.loaded&&s.role===role;},role);
  };
  const refresh=async()=>{
    const before=await page.evaluate(()=>{const n=window.fixture.pending.length;window.fixture.notify();return {n,role:window.fixture.currentRole()};});
    assert.equal(before.role,'viewer','API authorization must invalidate synchronously before React commits');
    const count=before.n;
    await page.waitForFunction(n=>window.fixture.pending.length>n,count);
    return count;
  };
  const write=()=>page.evaluate(()=>window.fixture.call('mark_outreach_messages'));
  const read=()=>page.evaluate(()=>window.fixture.call('list_rfx_events'));
  const initial=await state();
  if(probe){await context.close();return {lang,initial};}
  assert.equal(initial.loaded,false);assert.equal(initial.operate,false);assert.equal(initial.admin,false);assert.equal(initial.read,true);assert.equal(initial.clientRole,'viewer');
  assert.equal((await write()).status,403);assert.deepEqual(await read(),{ok:true});assert.equal(calls.length,1);
  await settle('admin',0);assert.equal((await state()).admin,true);assert.deepEqual(await write(),{ok:true});assert.equal(calls.length,2);
  // Same user object, not only the same ID: every session notification rechecks.
  await page.evaluate(()=>{window.fixture.holdTokens=true;window.fixture.delayedCall=window.fixture.call('mark_outreach_messages');});
  await page.waitForFunction(()=>window.fixture.tokens.length===1);
  let pending=await refresh();assert.equal((await state()).loaded,false);assert.equal((await state()).operate,false);assert.equal((await write()).status,403);assert.equal(calls.length,2);
  await page.evaluate(()=>{window.fixture.holdTokens=false;window.fixture.tokens[0]('synthetic-only');});
  assert.equal((await page.evaluate(()=>window.fixture.delayedCall)).status,403);assert.equal(calls.length,2,'A role change during token lookup must prevent the POST');
  await settle('operator',pending);assert.equal((await state()).operate,true);assert.equal((await state()).admin,false);
  const award=await page.evaluate(()=>window.fixture.call('award_rfx_lane_vendor'));assert.equal(award.status,403);
  // Rejecting a fresh role read must leave both UI and API writes blocked.
  pending=await refresh();await page.evaluate(i=>window.fixture.pending[i].reject(new Error('Synthetic role read failed')),pending);
  await page.waitForLoadState('networkidle');assert.equal((await state()).loaded,false);assert.equal((await write()).status,403);assert.deepEqual(await read(),{ok:true});
  // A late admin response cannot override a newer viewer verification.
  const old=await refresh();const latest=await refresh();await settle('viewer',latest);
  await page.evaluate(i=>window.fixture.pending[i].resolve({...window.fixture.user,app_metadata:{roles:['admin']}}),old);
  await page.waitForLoadState('networkidle');assert.equal((await state()).role,'viewer');assert.equal((await write()).status,403);
  // Log out with an old role lookup still pending.
  pending=await refresh();await page.evaluate(()=>{window.fixture.user=null;window.fixture.notify();});
  await page.waitForFunction(()=>!JSON.parse(document.querySelector('#state').textContent).authenticated);
  await page.evaluate(i=>window.fixture.pending[i].resolve({id:'synthetic-user-a',email:'fixture@heymarksman.com',app_metadata:{roles:['admin']}}),pending);
  await page.waitForLoadState('networkidle');assert.equal((await state()).loaded,false);assert.equal((await write()).status,403);
  // A disallowed domain cannot reuse a cached admin role.
  await page.evaluate(()=>{window.fixture.user={id:'synthetic-external',email:'outside@example.test',app_metadata:{roles:['admin']}};window.fixture.notify();});
  await page.waitForFunction(()=>window.fixture.signouts===1);assert.equal((await state()).authenticated,false);assert.equal((await state()).operate,false);
  assert.equal(calls.filter(c=>c.action==='mark_outreach_messages').length,1);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  await context.close();return {lang,pendingWritesBlocked:true,sameObjectRefresh:true,tokenWaitRoleChangeBlocked:true,roleErrorBlocked:true,staleAdminIgnored:true,logoutBlocked:true,externalDomainBlocked:true,syntheticWrites:1,syntheticReads:2};
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});
  try{const results=[];for(const lang of ['es','en'])results.push(await run(browser,lang));fs.writeFileSync(path.join(output,probe?'before.json':'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(probe)assert(results.every(r=>!r.initial.operate&&!r.initial.admin),'Baseline authorizes writes while fresh role is pending');}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
