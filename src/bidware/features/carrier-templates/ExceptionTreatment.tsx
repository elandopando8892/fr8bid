import { useEffect, useRef, useState } from 'react';
import { useLang } from '@/i18n/language';
import { treatmentText as t } from '@/i18n/exception-treatment';
import { type BatchReview, type BatchCatalog } from './batch-review';
import { assertTreatmentCurrent, exportTreatment, fileDigest, parseTreatment, parseTreatmentResult, prepareDecisions, type TreatmentPlan, type TreatmentDecision } from './exception-treatment';

export function ExceptionTreatment({batch,catalog,inputHash,org}:{batch:BatchReview;catalog:BatchCatalog;inputHash:string;org:string}) {
  useLang();
  const [plan,setPlan]=useState<TreatmentPlan|null>(null),[planHash,setPlanHash]=useState('');
  const [packId,setPackId]=useState('C01'),[ids,setIds]=useState<string[]>([]),[decisions,setDecisions]=useState<TreatmentDecision[]>([]);
  const [note,setNote]=useState(''),[evidenceHash,setEvidenceHash]=useState(''),[locator,setLocator]=useState('');
  const [status,setStatus]=useState<TreatmentDecision['status']>('still_unresolved'),[confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState(false),[busy,setBusy]=useState(false);
  const [restoreState,setRestoreState]=useState<'loading'|'error'|'done'|null>(null);const serial=useRef(0);
  useEffect(()=>()=>{serial.current++},[]);
  function resetDraft(){setIds([]);setNote('');setEvidenceHash('');setLocator('');setConfirmed(false);setStatus('still_unresolved');setError(false);}
  function clear(){serial.current++;setPlan(null);setPlanHash('');setDecisions([]);setBusy(false);setRestoreState(null);resetDraft();}
  async function load(file?:File){
    if(!file)return;clear();const attempt=++serial.current;setBusy(true);
    try{
      if(file.size>16*1024*1024)throw new Error();
      const value=await file.text(),digest=await fileDigest(value);
      const next=parseTreatment(value,batch,inputHash,catalog,org);
      if(serial.current!==attempt)return;setPlan(next);setPlanHash(digest);setPackId('C01');
    }catch{if(serial.current===attempt)setError(true)}finally{if(serial.current===attempt)setBusy(false)}
  }
  async function restore(file?:File){
    if(!file||!plan||busy)return;const attempt=++serial.current;setBusy(true);setRestoreState('loading');
    try{
      if(file.size>16*1024*1024)throw new Error();
      const value=await file.text();
      const next=parseTreatmentResult(value,plan,org,catalog,planHash);
      if(serial.current!==attempt)return;
      setDecisions(next);resetDraft();setRestoreState('done');
    }catch{if(serial.current===attempt)setRestoreState('error')}
    finally{if(serial.current===attempt)setBusy(false)}
  }
  const pack=plan?.packages.find(p=>p.id===packId);
  function prepare(){try{
    if(!plan)throw new Error();assertTreatmentCurrent(plan,org,catalog);
    const next=prepareDecisions(plan,packId,ids,{status,note,evidenceHash,locator,scopeConfirmed:confirmed});
    setDecisions(prev=>[...prev.filter(d=>!ids.includes(d.id)),...next].sort((a,b)=>a.id.localeCompare(b.id)));setError(false);
  }catch{setError(true)}}
  function download(){try{
    if(!plan)return;const result=exportTreatment(plan,decisions,org,catalog,planHash);
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='exception-treatment-proposal.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{setError(true)}}
  const sources=plan?[...new Set(plan.rows.flatMap(r=>r.row.sources.map(s=>s.sha256)))]:[];
  return <section className="exception-treatment" aria-labelledby="exception-treatment-title">
    <h2 id="exception-treatment-title">{t('title')}</h2><p>{t('intro')}</p>
    <div className="evidence-toolbar"><label className="evidence-file">{t('import')}<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void load(f)}}/></label>
      {(plan||error||busy)&&<button onClick={clear}>{t('clear')}</button>}</div>
    {busy&&!restoreState&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t('error')}</p>}
    {plan&&pack&&<><p>{t('counts',plan.rows.length,plan.packages.length,plan.sourceCount,plan.referenceCount)}</p>
      <div className="evidence-toolbar"><label className="evidence-file">{t('restore')}<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void restore(f)}}/></label></div>
      <p>{t('restoreHint')}</p>
      {restoreState&&<p role={restoreState==='error'?'alert':'status'}>{t(restoreState==='loading'?'restoring':restoreState==='error'?'restoreError':'restored')}</p>}
      <p role="status">{t('prepared',decisions.length,plan.rows.length-decisions.length)}</p>
      <fieldset disabled={busy} className="treatment-controls"><div className="batch-board"><nav className="batch-groups" aria-label={t('packages')}>
        {plan.packages.map(p=><button key={p.id} aria-pressed={p.id===packId} onClick={()=>{resetDraft();setPackId(p.id)}}>{p.id} · {t(p.group as 'C'|'D'|'E'|'F')} · {p.rows.length}</button>)}
      </nav><div className="batch-results">
        <h3>{pack.id} · {t(pack.group as 'C'|'D'|'E'|'F')}</h3><p className="muted">{t('originals')}</p>
        <p>{pack.rows[0].action}</p><h4>{t('required')}</h4><p>{pack.rows[0].required}</p>
        <div className="evidence-toolbar"><button onClick={()=>{setIds(pack.rows.map(r=>r.id));setConfirmed(false)}}>{t('select',pack.rows.length)}</button><button onClick={()=>{setIds([]);setConfirmed(false)}}>{t('deselect')}</button></div>
        <p role="status">{t('selection',ids.length,pack.rows.length-ids.length)}</p>
        {pack.rows.map(r=>{const decision=decisions.find(d=>d.id===r.id);return <div className="treatment-row" key={r.id}><label><input type="checkbox" checked={ids.includes(r.id)} onChange={e=>{setIds(prev=>e.target.checked?[...prev,r.id]:prev.filter(id=>id!==r.id));setConfirmed(false)}}/>{t('selected',r.row.proposalId)} · {r.row.carrier}</label>
          <small>{decision?t(decision.status==='still_unresolved'?'pending':'proposal'):t('excluded')}</small>
          <details><summary>{t('evidence')}</summary><p>{r.row.scope}</p><p>{r.row.restrictions}</p>{r.blockers.map(b=><p key={b}>{b}</p>)}<ul>{r.row.sources.map((s,i)=><li key={i}>{s.file.split(/[\\/]/).pop()} · {s.locator} · {s.date}<small>SHA-256 {s.sha256}</small></li>)}</ul></details>
          {decision&&<details><summary>{t('preparedDetail')}</summary><p>{decision.note}</p>{decision.evidenceHash&&<small>SHA-256 {decision.evidenceHash}</small>}{decision.locator&&<p>{decision.locator}</p>}</details>}
        </div>})}
        <div className="treatment-form"><label>{t('status')}<select value={status} onChange={e=>{setStatus(e.target.value as typeof status);setConfirmed(false)}}><option value="still_unresolved">{t('pending')}</option><option value="reviewed_proposal">{t('proposal')}</option></select></label>
          <label>{t('note')}<textarea maxLength={4000} value={note} onChange={e=>{setNote(e.target.value);setConfirmed(false)}}/></label>
          <label>{t('hash')}<input value={evidenceHash} maxLength={64} onChange={e=>{setEvidenceHash(e.target.value);setConfirmed(false)}}/></label>
          <label>{t('locator')}<input value={locator} maxLength={2000} onChange={e=>{setLocator(e.target.value);setConfirmed(false)}}/></label>
          <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('confirm')}</label>
          <p>{t('warning')}</p><button disabled={!ids.length||!note.trim()||!confirmed||status==='reviewed_proposal'&&(!/^[a-f0-9]{64}$/.test(evidenceHash)||!locator.trim())} onClick={prepare}>{t('prepare')}</button>
        </div></div></div>
      <details><summary>{t('sources')} · {sources.length}</summary>{sources.map(h=>{const linked=plan.rows.filter(r=>r.row.sources.some(s=>s.sha256===h));return <div key={h}><p>SHA-256 {h} · {t('sourceRows',linked.length)}</p><p>{linked.map(r=>r.row.proposalId).join(', ')}</p></div>})}</details>
      <button disabled={!decisions.length} onClick={download}>{t('export')}</button>
      </fieldset>
    </>}
  </section>;
}
