import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@/auth/AuthContext';
import {useLang} from '@/i18n/language';
import {membershipText as t} from '@/i18n/batch-membership';
import type {BatchReview,BatchCatalog,BatchTarget} from './batch-review';
import {buildMembershipPlan,parseMembershipPlan,assertMembershipPlan,type MembershipPlan} from './batch-membership';
import {runMembershipPlan,type MembershipReceipt} from './batch-membership-runner';
import {getCarrierTemplate,updateCarrierTemplate} from './templates.service';

export function BatchMembership({batch,catalog,org,inputHash,targets,onBusyChange}:{batch:BatchReview;catalog:BatchCatalog;org:string;inputHash:string;targets:Record<string,BatchTarget>;onBusyChange:(busy:boolean)=>void}){
 useLang();const {user,roleLoaded,can}=useAuth();
 const [ids,setIds]=useState<string[]>([]),[plan,setPlan]=useState<MembershipPlan|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const [receipts,setReceipts]=useState<MembershipReceipt[]>([]),[complete,setComplete]=useState<boolean|null>(null);
 const active=useRef(true),running=useRef(false),serial=useRef(0);
 useEffect(()=>{active.current=true;return()=>{active.current=false;serial.current++;onBusyChange(false)}},[onBusyChange]);
 const proposals=batch.rows.filter(r=>r.group==='A');
 function reset(){serial.current++;setPlan(null);setReceipts([]);setComplete(null);setConfirmed(false);setError(false)}
 function preview(){setConfirmed(false);try{setPlan(buildMembershipPlan(batch,catalog,org,inputHash,ids,targets));setReceipts([]);setComplete(null);setError(false)}catch{setError(true)}}
 function download(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 async function load(file?:File){if(!file||running.current)return;const attempt=++serial.current;setBusy(true);setConfirmed(false);try{if(file.size>16*1024*1024)throw Error();const raw=await file.text(),next=parseMembershipPlan(raw,batch,catalog,org,inputHash);if(!active.current||serial.current!==attempt)return;setPlan(next);setIds(next.selectedRowIds);setReceipts([]);setComplete(null);setError(false)}catch{if(active.current&&serial.current===attempt)setError(true)}finally{if(active.current&&serial.current===attempt)setBusy(false)}}
 async function apply(){
  if(!plan||!confirmed||running.current||!roleLoaded||!user||!can('operate'))return;
  try{assertMembershipPlan(plan,batch,catalog,org,inputHash)}catch{setError(true);return}
  running.current=true;setBusy(true);onBusyChange(true);setConfirmed(false);setError(false);setComplete(null);
  const current=()=>{if(!active.current||!roleLoaded||!can('operate'))return false;try{assertMembershipPlan(plan,batch,catalog,org,inputHash);return true}catch{return false}};
  try{const result=await runMembershipPlan(plan,{read:id=>getCarrierTemplate(id),write:(id,version,vendorIds)=>updateCarrierTemplate(id,version,{vendor_ids:vendorIds})},current,next=>{if(active.current)setReceipts(next)});if(active.current)setComplete(result.complete)}
  catch{if(active.current)setError(true)}finally{running.current=false;if(active.current){setBusy(false);onBusyChange(false)}}
 }
 return <section className="batch-membership" aria-labelledby="membership-title"><h2 id="membership-title">{t('title')}</h2><p>{t('intro')}</p>
  <fieldset disabled={busy} className="treatment-controls"><div className="evidence-toolbar"><button onClick={()=>{reset();setIds(proposals.map(r=>r.id))}}>{t('all',proposals.length)}</button><button onClick={()=>{reset();setIds([])}}>{t('clear')}</button><label className="evidence-file">{t('import')}<input type="file" accept=".json,application/json" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void load(file)}}/></label></div>
  {proposals.map(r=><div key={r.id} className="treatment-row"><label><input type="checkbox" checked={ids.includes(r.id)} onChange={e=>{reset();setIds(prev=>e.target.checked?[...prev,r.id]:prev.filter(id=>id!==r.id))}}/>{t('select',r.proposalId)} · {r.carrier} → {r.proposedName}</label><small>{t('crm',r.crmStatus)}</small><details><summary>{t('detail')}</summary><small>{r.vendorId} · {r.id}</small><p>{r.scope}</p><p>{r.restrictions}</p><ul>{r.sources.map((s,i)=><li key={i}>{s.file.split(/[\\/]/).pop()} · {s.locator}<small>SHA-256 {s.sha256}</small></li>)}</ul></details></div>)}
  <button disabled={!ids.length} onClick={preview}>{t('prepare')}</button>
  {plan&&<><p>{t('counts',plan.selectedRowIds.length,plan.excludedRowIds.length,plan.groups.length)}</p><div className="evidence-table-wrap"><table className="data"><thead><tr><th>{t('target')}</th><th>{t('before')}</th><th>{t('add')}</th><th>{t('after')}</th></tr></thead><tbody>{plan.groups.map(g=><tr key={g.targetId}><td>{g.name}<small>{g.targetId} · {t('expected',g.expectedVersion)}</small><details><summary>{t('delta')}</summary>{g.additions.map(id=><small key={id}>{id}</small>)}</details></td><td>{g.before.length}</td><td>{g.additions.length}</td><td>{g.after.length}</td></tr>)}</tbody></table></div>
  <div className="evidence-toolbar"><button onClick={()=>download(plan,'membership-batch-plan.json')}>{t('save')}</button><button disabled={!receipts.length} onClick={()=>download({format:'bidware-membership-observation/1',authority:'local_observation_not_server_receipt',plan,receipts,complete},'membership-batch-result.json')}>{t('receipt')}</button></div>
  <p>{t('warning')}</p><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('confirm')}</label><button disabled={!confirmed||!roleLoaded||!user||!can('operate')} onClick={()=>void apply()}>{t('apply')}</button>
  {(!roleLoaded||!can('operate'))&&<p>{t('permission')}</p>}</>}
  </fieldset>{error&&<p role="alert">{t('error')}</p>}{complete!==null&&<p role="status">{t(complete?'complete':'paused')}</p>}
  <ul>{receipts.map(r=><li key={r.targetId}>{plan?.groups.find(g=>g.targetId===r.targetId)?.name} · {t(r.state)}{r.version&&` · v${r.version}`}</li>)}</ul>
 </section>;
}
