import type { CarrierListTemplate } from '@/types/domain';
import { sameMembers, type MembershipGroup, type MembershipPlan } from './batch-membership';

export type MembershipState='pending'|'checking'|'writing'|'applied'|'satisfied'|'unchanged'|'not_applied'|'conflict'|'unknown'|'blocked';
export interface MembershipReceipt {targetId:string;state:MembershipState;version?:number;inverse?:{expectedVersion:number;vendorIds:string[]}}
export interface MembershipPort {read(id:string):Promise<CarrierListTemplate|null>;write(id:string,version:number,vendorIds:string[]):Promise<unknown>}
export interface MembershipRun {receipts:MembershipReceipt[];complete:boolean}

function inspect(plan:MembershipPlan,g:MembershipGroup,t:CarrierListTemplate|null):'before'|'after'|'conflict'{
  if(!t||t.id!==g.targetId||t.organization_id!==plan.organizationId||t.segment_name!==g.name||t.lifecycle_status!=='active'||!Array.isArray(t.vendor_ids)||new Set(t.vendor_ids).size!==t.vendor_ids.length)return 'conflict';
  if(t.template_version===g.expectedVersion&&sameMembers(t.vendor_ids,g.before))return 'before';
  if(t.template_version===g.expectedVersion+1&&sameMembers(t.vendor_ids,g.after))return 'after';
  return 'conflict';
}

/** Sequential existing API calls. No automatic write retries or global-transaction claim. */
export async function runMembershipPlan(plan:MembershipPlan,port:MembershipPort,current:()=>boolean,changed:(receipts:MembershipReceipt[])=>void):Promise<MembershipRun>{
  if(plan.format!=='bidware-membership-plan/1'||plan.authority!=='local_proposal_only'||plan.approved!==false||plan.applied!==false||!plan.groups.length||new Set(plan.groups.map(g=>g.targetId)).size!==plan.groups.length||plan.groups.some(g=>
    !Number.isSafeInteger(g.expectedVersion)||g.expectedVersion<1||[g.before,g.after,g.additions].some(ids=>!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)||
    g.additions.some(id=>g.before.includes(id))||!sameMembers(g.after,[...g.before,...g.additions])))throw Error('MEMBERSHIP_PLAN_INVALID');
  const receipts:MembershipReceipt[]=plan.groups.map(g=>({targetId:g.targetId,state:'pending'}));
  const mark=(i:number,state:MembershipState,extra:Partial<MembershipReceipt>={})=>{receipts[i]={targetId:plan.groups[i].targetId,state,...extra};changed(receipts.map(r=>({...r})));};
  const done=(complete=false)=>({receipts,complete});
  for(let i=0;i<plan.groups.length;i++){
    const g=plan.groups[i];if(!current()){mark(i,'blocked');return done()}
    mark(i,'checking');let live:CarrierListTemplate|null;
    try{live=await port.read(g.targetId)}catch{mark(i,'blocked');return done()}
    if(!current()){mark(i,'blocked');return done()}
    const state=inspect(plan,g,live);
    if(state==='after'){mark(i,'satisfied',{version:live!.template_version});continue}
    if(state==='conflict'){mark(i,'conflict');return done()}
    if(!g.additions.length){mark(i,'unchanged',{version:g.expectedVersion});continue}
    mark(i,'writing');let acknowledged=false,errorStatus=0;
    try{await port.write(g.targetId,g.expectedVersion,g.after);acknowledged=true}catch(e){errorStatus=Number((e as {status?:number})?.status)||0}
    // An in-flight request cannot be unsent. Losing authority stops even reconciliation.
    if(!current()){mark(i,'unknown');return done()}
    if([401,403].includes(errorStatus)){mark(i,'blocked');return done()}
    if(errorStatus===409){mark(i,'conflict');return done()}
    try{live=await port.read(g.targetId)}catch{mark(i,'unknown');return done()}
    if(!current()){mark(i,'unknown');return done()}
    const after=inspect(plan,g,live);
    if(after==='after'){
      if(acknowledged)mark(i,'applied',{version:live!.template_version,inverse:{expectedVersion:g.expectedVersion+1,vendorIds:g.before}});
      else{mark(i,'satisfied',{version:live!.template_version});return done()}
    }else{mark(i,after==='before'?'not_applied':'unknown');return done()}
  }
  return done(true);
}
