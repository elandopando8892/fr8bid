import {callQuotedeskApi} from '@/lib/api-client';
import {ClientFeeError} from './client-fee-acceptance.service';
export interface FeeReference {proposalId:string;acceptanceId:string}
export interface FeeRevocationStatus {acceptanceId:string;revision:string;revoked:boolean;checkedAt:string}
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function reference(v:FeeReference):FeeReference {
 if(!v||!hex(v.acceptanceId)||typeof v.proposalId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.proposalId))throw new ClientFeeError('invalid_input');
 return {proposalId:v.proposalId,acceptanceId:v.acceptanceId};
}
// A session owns one immutable original agreement. Recovery stores IDs only,
// before the first write; neither reload nor an unknown outcome unlocks retry.
export function createClientFeeRevocationSession(input:FeeReference,isCurrent:()=>boolean,remember:(r:FeeReference)=>void){
 const ref=reference(input);let valid=true,busy=false,locked=false,status:FeeRevocationStatus|null=null;
 let state:'idle'|'known'|'revoked'|'uncertain'|'not_found'='idle';
 const guard=()=>{if(!valid||!isCurrent())throw new ClientFeeError('scope_changed');};
 function decode(value:unknown){
  const r=value as {contractVersion?:string;billingEnabled?:boolean;retryWrite?:boolean;historyOnly?:boolean;state?:string;status?:FeeRevocationStatus|null};
  if(!r||r.contractVersion!=='rateware.client-fee-revocation.v1'||r.billingEnabled!==false||r.retryWrite!==false||r.historyOnly!==true)throw new ClientFeeError('invalid_response');
  if(['uncertain','not_found'].includes(r.state||'')&&r.status===null){status=null;state=r.state as 'uncertain'|'not_found';return;}
  const s=r.status;
  if(!s||!['known','revoked'].includes(r.state||'')||s.acceptanceId!==ref.acceptanceId||!hex(s.revision)||typeof s.revoked!=='boolean'||(r.state==='revoked')!==s.revoked||typeof s.checkedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(s.checkedAt)||!Number.isFinite(Date.parse(s.checkedAt))||Math.abs(Date.now()-Date.parse(s.checkedAt))>60000)throw new ClientFeeError('invalid_response');
  status={acceptanceId:s.acceptanceId,revision:s.revision,revoked:s.revoked,checkedAt:s.checkedAt};state=s.revoked?'revoked':'known';
  if(s.revoked)locked=true;
 }
 return {
  view:()=>({busy,locked,status:status?{...status}:null,state}),
  invalidate(){valid=false;status=null;state='idle';},
  restore(saved:FeeReference){guard();locked=true;state='uncertain';const s=reference(saved);if(s.proposalId!==ref.proposalId||s.acceptanceId!==ref.acceptanceId)throw new ClientFeeError('recovery_unavailable');},
  async read(){guard();if(busy)throw new ClientFeeError('locked');busy=true;status=null;
   try{const result=await callQuotedeskApi('client_fee_revocation_status',{...ref});guard();decode(result);}
   catch(e){status=null;throw e;}finally{busy=false;}
  },
  async revoke(reason:string,humanConfirmed:boolean){
   guard();if(busy||locked)throw new ClientFeeError('locked');
   if(!status||status.revoked||Math.abs(Date.now()-Date.parse(status.checkedAt))>60000||humanConfirmed!==true)throw new ClientFeeError('verification_required');
   if(typeof reason!=='string'||reason.trim().length<1||reason.trim().length>500)throw new ClientFeeError('invalid_input');
   const revision=status.revision;
   try{remember({...ref});}catch{throw new ClientFeeError('recovery_unavailable');}
   guard();locked=true;busy=true;status=null;state='uncertain';
   try{const result=await callQuotedeskApi('revoke_client_fee_acceptance',{...ref,reason:reason.trim(),humanConfirmed:true,reviewedRevision:revision});guard();decode(result);}
   catch(e){status=null;if(valid&&isCurrent())state='uncertain';throw e;}finally{busy=false;}
  },
 };
}
