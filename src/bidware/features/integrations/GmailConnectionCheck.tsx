import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { callRatewareApi } from '@/lib/api-client';
import { NEED_REASON } from '@/lib/roles';
import { ErrorBanner } from '@/components/ui';
import { locale, useLang } from '@/i18n/language';
import { gmailCheckText as t } from '@/i18n/gmail-check';

const states = ['available','not_connected','scope_missing','credentials_unavailable','provider_rejected','identity_unconfirmed','unavailable'] as const;
type State = typeof states[number];
const reasons = new Set(['badRequest','authError','domainPolicy','rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded','failedPrecondition','backendError','notFound','invalidArgument','forbidden','accessNotConfigured','insufficientPermissions','FAILED_PRECONDITION','RESOURCE_EXHAUSTED','UNAUTHENTICATED','PERMISSION_DENIED']);
type Result = {state:State;stage:'stored'|'credentials'|'profile';checked_at:string;http_status:number|null;reason_codes:string[];send_scope_granted:boolean|null};
async function checkConnection(): Promise<Result> {
  const r = await callRatewareApi<Result>('check_gmail_connection');
  if (!r || !states.includes(r.state) || !['stored','credentials','profile'].includes(r.stage) || typeof r.checked_at !== 'string' || !Number.isFinite(Date.parse(r.checked_at)) || (r.state === 'available' && (r.http_status !== 200 || r.stage !== 'profile'))) throw new Error('Invalid check response');
  return {state:r.state,stage:r.stage,checked_at:r.checked_at,http_status:Number.isInteger(r.http_status) && Number(r.http_status)>=100 && Number(r.http_status)<=599?r.http_status:null,reason_codes:Array.isArray(r.reason_codes)?r.reason_codes.filter(reason=>reasons.has(reason)).slice(0,8):[],send_scope_granted:typeof r.send_scope_granted==='boolean'?r.send_scope_granted:null};
}
const ignorePending = (_pending: boolean) => {};
export function GmailConnectionCheck({blocked=false,revision='',onPendingChange=ignorePending}:{blocked?:boolean;revision?:string;onPendingChange?:(pending:boolean)=>void}) {
  const {user,role,roleLoaded}=useAuth();
  return <CheckContent key={`${user?.id??'anonymous'}:${role}:${roleLoaded}:${revision}:${blocked}`} blocked={blocked} onPendingChange={onPendingChange}/>;
}
function CheckContent({blocked,onPendingChange}:{blocked:boolean;onPendingChange:(pending:boolean)=>void}) {
  useLang();const {can,roleLoaded}=useAuth();
  const canCheck=roleLoaded && can('operate') && !blocked;
  const allowed=useRef(canCheck);allowed.current=canCheck;
  const active=useRef(false),locked=useRef(false);
  const [busy,setBusy]=useState(false),[result,setResult]=useState<Result|null>(null),[failure,setFailure]=useState(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;onPendingChange(false);};},[onPendingChange]);
  async function check(){
    if(!active.current||!allowed.current||locked.current)return;
    locked.current=true;setBusy(true);onPendingChange(true);setResult(null);setFailure(false);
    try{const value=await checkConnection();if(active.current&&allowed.current)setResult(value);}
    catch{if(active.current&&allowed.current)setFailure(true);}
    finally{locked.current=false;if(active.current){setBusy(false);onPendingChange(false);}}
  }
  return <section aria-label={t('title')} style={{borderTop:'1px solid var(--line)',marginTop:16,paddingTop:12,overflowWrap:'anywhere'}}>
    <h3>{t('title')}</h3><p className="ig-note">{t('note')}</p>
    <button type="button" disabled={busy||!canCheck} title={roleLoaded&&can('operate')?undefined:NEED_REASON.operate} onClick={check}>{t(busy?'busy':'button')}</button>
    {!result&&!busy&&!failure&&<p className="ig-note">{t('initial')}</p>}
    {failure&&<ErrorBanner message={t('failure')}/>}
    {result&&<div role="status"><p>{t(result.state)}</p>{result.send_scope_granted===false&&<p>{t('noSend')}</p>}<dl>
      <dt>{t('date')}</dt><dd>{new Date(result.checked_at).toLocaleString(locale())}</dd>
      <dt>{t('stage')}</dt><dd>{t(result.stage)}</dd>
      <dt>{t('http')}</dt><dd>{result.http_status??t('missing')}</dd>
      <dt>{t('reasons')}</dt><dd>{result.reason_codes.length?result.reason_codes.join(', '):t('missing')}</dd>
    </dl></div>}
  </section>;
}
