import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@/auth/AuthContext';
import {callRatewareApi} from '@/lib/api-client';
import {NEED_REASON} from '@/lib/roles';
import {ErrorBanner} from '@/components/ui';
import {useLang,locale} from '@/i18n/language';
import {receiptText as t} from '@/i18n/gmail-receipt';
import {gmailReceipt} from './gmail-receipt';
import type {OutreachMessage} from './outreach.service';
const states=['found_sent','found_not_sent','not_found','provider_rejected','unavailable','missing','no_receipt','not_connected','scope_missing','credentials_unavailable'] as const;
type Result={state:typeof states[number];checked_at:string;http_status:number|null;reason_codes:string[]};
const reasons=new Set(['badRequest','authError','domainPolicy','rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded','failedPrecondition','backendError','notFound','invalidArgument','forbidden','accessNotConfigured','insufficientPermissions','FAILED_PRECONDITION','RESOURCE_EXHAUSTED','UNAUTHENTICATED','PERMISSION_DENIED']);
async function verify(eventId:string,messageId:string):Promise<Result>{
 const r=await callRatewareApi<Result>('verify_outreach_gmail_message',{id:messageId,rfx_event_id:eventId});
 if(!r||!states.includes(r.state)||typeof r.checked_at!=='string'||!Number.isFinite(Date.parse(r.checked_at))||(['found_sent','found_not_sent'].includes(r.state)&&r.http_status!==200))throw Error('Invalid verification response');
 return{state:r.state,checked_at:r.checked_at,http_status:Number.isInteger(r.http_status)&&Number(r.http_status)>=100&&Number(r.http_status)<=599?r.http_status:null,reason_codes:Array.isArray(r.reason_codes)?r.reason_codes.filter(reason=>reasons.has(reason)).slice(0,8):[]};
}
export function GmailReceiptPanel({message,eventId}:{message:OutreachMessage;eventId:string}){
 const {user,role,roleLoaded}=useAuth();const receipt=gmailReceipt(message);
 return <ReceiptContent key={`${user?.id}:${role}:${roleLoaded}:${eventId}:${message.id}:${receipt.id}`} message={message} eventId={eventId}/>;
}
function ReceiptContent({message,eventId}:{message:OutreachMessage;eventId:string}){
 useLang();const {can,roleLoaded}=useAuth();const receipt=gmailReceipt(message),allowed=useRef(false);allowed.current=roleLoaded&&can('operate')&&receipt.canVerify;
 const active=useRef(false),locked=useRef(false);const[busy,setBusy]=useState(false),[result,setResult]=useState<Result|null>(null),[failure,setFailure]=useState(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function check(){if(!active.current||!allowed.current||locked.current)return;locked.current=true;setBusy(true);setFailure(false);setResult(null);try{const next=await verify(eventId,message.id);if(active.current&&allowed.current)setResult(next);}catch{if(active.current&&allowed.current)setFailure(true);}finally{locked.current=false;if(active.current)setBusy(false);}}
 if(message.channel!=='email'||(!receipt.id&&!receipt.manual&&!receipt.sentAt&&!['sent','sending','delivery_unknown'].includes(String(message.status))))return null;
 const when=(value:string|null)=>value?new Date(value).toLocaleString(locale()):t('notStored');
 return <section aria-label={t('title')} style={{border:'1px solid var(--line)',padding:12,margin:'12px 0',overflowWrap:'anywhere'}}>
  <h3 style={{marginTop:0}}>{t('title')}</h3>
  {receipt.id?<dl><dt>{t('id')}</dt><dd className="mono">{receipt.id}</dd><dt>{t('sentAt')}</dt><dd>{when(receipt.sentAt)}</dd></dl>:<p>{t('noReceipt')}</p>}
  {receipt.manual&&<><p>{t('manual')}</p><p>{t('manualAt')}: {when(receipt.manualAt)}</p></>}
  {receipt.canVerify&&<><p>{t('note')}</p><p className="cell-sub">{t('refresh')}</p><button type="button" disabled={busy||!allowed.current} title={allowed.current?undefined:NEED_REASON.operate} onClick={check}>{t(busy?'busy':'verify')}</button></>}
  {failure&&<ErrorBanner message={t('failure')}/>}
  {result&&<div role="status"><p>{t(result.state)}</p><dl><dt>{t('checked')}</dt><dd>{when(result.checked_at)}</dd><dt>{t('http')}</dt><dd>{result.http_status??t('notStored')}</dd><dt>{t('reasons')}</dt><dd>{result.reason_codes.length?result.reason_codes.join(', '):t('notStored')}</dd></dl></div>}
 </section>;
}
