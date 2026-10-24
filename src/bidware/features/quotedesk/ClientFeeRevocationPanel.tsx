import {useEffect,useMemo,useRef,useState} from 'react';
import {InfoBanner,ErrorBanner} from '@/components/ui';
import {translator,useLang} from '@/i18n/language';
import {createClientFeeRevocationSession,type FeeReference} from './client-fee-revocation.service';
const tr=translator({
 title:{es:'Vigencia del acuerdo registrado',en:'Recorded agreement status'},
 intro:{es:'El recibo conserva la aceptación histórica. Revocar bloquea usos futuros del fee; no cancela ofertas previas ni genera cobros.',en:'The receipt preserves historical acceptance. Revocation blocks future fee use; it does not cancel previous offers or bill anyone.'},
 read:{es:'Consultar vigencia original',en:'Read original agreement status'},
 reading:{es:'Consultando…',en:'Reading…'},
 active:{es:'Sin revocación registrada en la última consulta. Esto no sustituye la verificación al utilizar el acuerdo.',en:'No revocation recorded at the last check. This does not replace validation when using the agreement.'},
 revoked:{es:'Acuerdo revocado. Se conserva el recibo histórico.',en:'Agreement revoked. The historical receipt is preserved.'},
 reason:{es:'Motivo de revocación',en:'Reason for revocation'},
 confirm:{es:'Confirmo la instrucción del cliente y entiendo que esta revocación no se puede deshacer.',en:'I confirm the customer instruction and understand that this revocation cannot be undone.'},
 revoke:{es:'Revocar acuerdo',en:'Revoke agreement'},
 uncertain:{es:'Solicitud bloqueada para evitar duplicados. Consulta el estado original; no vuelvas a enviar.',en:'Request locked to prevent duplicates. Read the original status; do not submit again.'},
 missing:{es:'No se encontró el acuerdo en este alcance. No se permite revocar.',en:'Agreement not found in this scope. Revocation is not allowed.'},
 error:{es:'No pudimos confirmar el estado. Revisa sesión, permisos y disponibilidad; no asumas que la solicitud fue ejecutada.',en:'We could not confirm the status. Check session, permissions and availability; do not assume the request was executed.'},
 storage:{es:'No se pudo recuperar la referencia local. La revocación queda bloqueada; puedes consultar su estado.',en:'Local recovery failed. Revocation is blocked; you can read its status.'},
 checked:{es:'Consultado',en:'Checked'},
});
export function ClientFeeRevocationPanel({reference,recoveryKey,isCurrent}:{reference:FeeReference;recoveryKey:string;isCurrent:()=>boolean}){
 useLang();const current=useRef(isCurrent);current.current=isCurrent;
 const mounted=useRef(false),currentToken=useRef<object|null>(null);
 const [reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(false),[ready,setReady]=useState(false),[storageError,setStorageError]=useState(false);
 const [,redraw]=useState(0);
 const bundle=useMemo(()=>{const token={};return {token,session:createClientFeeRevocationSession(reference,()=>mounted.current&&currentToken.current===token&&current.current(),r=>sessionStorage.setItem(recoveryKey,JSON.stringify(r)))};},[reference.proposalId,reference.acceptanceId,recoveryKey]);
 const {session}=bundle;currentToken.current=bundle.token;
 useEffect(()=>{
  mounted.current=true;setStorageError(false);setReason('');setConfirmed(false);setError(false);
  try{const saved=sessionStorage.getItem(recoveryKey);if(saved)session.restore(JSON.parse(saved));}
  catch{setStorageError(true);}
  setReady(true);redraw(v=>v+1);
  // StrictMode replays effects. Guard pending replies on real unmount without
  // permanently invalidating the same session during the development replay.
  return()=>{mounted.current=false;};
 },[session,recoveryKey]);
 const view=session.view();
 async function run(write=false){
  setError(false);try{const p=write?session.revoke(reason,confirmed):session.read();redraw(v=>v+1);await p;}
  catch{if(mounted.current&&currentToken.current===bundle.token&&current.current())setError(true);}
  finally{if(mounted.current&&currentToken.current===bundle.token&&current.current()){setConfirmed(false);redraw(v=>v+1);}}
 }
 return <section aria-label={tr('title')} aria-busy={view.busy}>
  <h3>{tr('title')}</h3><p className="qd-muted">{tr('intro')}</p>
  <button type="button" disabled={!ready||view.busy} onClick={()=>void run()}>{view.busy?tr('reading'):tr('read')}</button>
  {error&&<div role="alert"><ErrorBanner message={tr('error')}/></div>}
  {storageError&&<ErrorBanner message={tr('storage')}/>}
  <div role="status" aria-live="polite">
   {view.status&&<><InfoBanner>{tr(view.status.revoked?'revoked':'active')}</InfoBanner><p>{tr('checked')}: {view.status.checkedAt}</p></>}
   {view.state==='not_found'&&<InfoBanner>{tr('missing')}</InfoBanner>}
   {view.locked&&!view.status?.revoked&&<InfoBanner>{tr('uncertain')}</InfoBanner>}
  </div>
  {!view.locked&&<fieldset disabled={!ready||storageError||view.busy||!view.status} style={{border:0,padding:0,minWidth:0}}>
   <label className="field"><span>{tr('reason')}</span><textarea maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}}/></label>
   <label style={{display:'flex',alignItems:'flex-start',gap:10,margin:'16px 0'}}><input style={{width:'auto',flexShrink:0,marginTop:4}} type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{tr('confirm')}</span></label>
   <button type="button" disabled={!confirmed||!reason.trim()} onClick={()=>void run(true)}>{tr('revoke')}</button>
  </fieldset>}
 </section>;
}
