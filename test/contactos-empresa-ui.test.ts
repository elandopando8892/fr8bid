import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContactosEmpresa } from "../src/ui/ContactosEmpresa";
import type { ClienteContactos, ContextoContacto, OperacionContacto, RespuestaContacto } from "../src/dominio/contactosEmpresa";

const empresas=[{id:"a",nombre:"Transportes Sierra"},{id:"b",nombre:"Carga del Norte"}];
const context=(id="a",known:ContextoContacto["known"]["state"]="missing"):ContextoContacto=>({vendor:{id,name:empresas.find(e=>e.id===id)!.nombre,domain:`${id}.example`,email:null},known:{state:known,candidates:[]},operation:null,available:true,capabilities:{can_write:true,can_search:true,can_spend:true,max_credits:2}});
const op:OperacionContacto={id:"op-a",vendor_id:"a",person_id:"person-a",person_name:"María Si***a",state:"draft",confirmation_hash:"a".repeat(64),expires_at:"2099-01-01",max_credits:2,credits_confirmed:null,email:null,linked:false,code:null};
let root:Root,el:HTMLElement;
const linked=vi.fn();
const render=async(cliente:ClienteContactos,contexto="cuenta-a")=>{await act(async()=>root.render(createElement(ContactosEmpresa,{empresas,contexto,cliente,onVinculado:linked})));};
const button=(text:string)=>[...el.querySelectorAll("button")].find(b=>b.textContent?.includes(text))!;
const click=async(text:string)=>{expect(button(text),text).toBeTruthy();await act(async()=>button(text).click());};
beforeEach(()=>{const dom=parseHTML('<html><body><div id="root"></div></body></html>');vi.stubGlobal("window",dom.window);vi.stubGlobal("document",dom.document);vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);el=document.getElementById("root")!;root=createRoot(el);linked.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();});
describe("cola de empresas",()=>{
 it("vincula la coincidencia conocida sin confirmación y avanza a la siguiente empresa en un clic",async()=>{
  const client=vi.fn<ClienteContactos>(async b=>{
   if(b.action==="resolve_known")return {...context(b.vendor_id,"linked"),vendor:{...context(b.vendor_id).vendor,email:"ops@a.example"}};
   return context("vendor_id" in b?b.vendor_id:"a","matched");
  });
  await render(client);expect(client).toHaveBeenCalledWith({action:"resolve_known",vendor_id:"a"});expect(el.textContent).toContain("ops@a.example");expect(linked).toHaveBeenCalledTimes(1);
  await click("Siguiente empresa");expect(client).toHaveBeenCalledWith({action:"context",vendor_id:"b"});expect(el.textContent).toContain("2 de 2");
 });
 it("exige una confirmación con empresa y límite; el doble clic consume una sola vez",async()=>{
  let guardado=false;
  let finish!:(r:RespuestaContacto)=>void;
  const client=vi.fn<ClienteContactos>(async b=>{
   if(b.action==="search")return {candidates:[{id:"person-a",name:op.person_name,title:"Operaciones",domain:"a.example",has_email:true,company_name:"Transportes Sierra",company_verified:false}]};
   if(b.action==="prepare_reveal")return {operation:op};
   if(b.action==="confirm_reveal")return new Promise(r=>{finish=r;});
   return guardado?{...context(),vendor:{...context().vendor,email:"maria@a.example"},operation:{...op,state:"completed",email:"maria@a.example",linked:true}}:context();
  });
  await render(client);await click("Buscar en Apollo");await click("Ver correo");
  expect(el.querySelector('[aria-label="Confirmar créditos"]')?.textContent).toContain("Transportes Sierra");expect(el.textContent).toContain("2 créditos");
  await act(async()=>{button("Confirmar y guardar").click();button("Confirmar y guardar")?.click();});
  expect(client.mock.calls.filter(([b])=>b.action==="confirm_reveal")).toHaveLength(1);
  await act(async()=>{guardado=true;finish({operation:{...op,state:"completed",email:"maria@a.example",linked:true}});});
  expect(el.textContent).toContain("maria@a.example");expect(el.textContent).toContain("Consumo pendiente de confirmar");
 });
 it("recupera el resultado pendiente sin revelar otra vez",async()=>{
  let guardado=false;
  const client=vi.fn<ClienteContactos>(async b=>{if(b.action==="apply_result"){guardado=true;return {operation:{...op,state:"completed",linked:true,email:"ops@a.example"}};}return guardado?{...context(),vendor:{...context().vendor,email:"ops@a.example"},operation:{...op,state:"completed",linked:true,email:"ops@a.example"}}:{...context(),operation:{...op,state:"needs_link",email:"ops@a.example"}};});
  await render(client);await click("Completar vínculo");expect(client.mock.calls.some(([b])=>b.action==="confirm_reveal")).toBe(false);expect(linked).toHaveBeenCalledTimes(1);
 });
 it("un vínculo histórico no repinta un correo suprimido como vigente",async()=>{
  let consultas=0;
  const client=vi.fn<ClienteContactos>(async b=>{
   if(b.action==="apply_result")return {operation:{...op,state:"completed",linked:true,email:"suprimido@a.example"}};
   consultas++;return consultas===1?{...context(),operation:{...op,state:"needs_link",email:"suprimido@a.example"}}:{...context("a","restricted"),available:false,capabilities:{can_write:false,can_search:false,can_spend:false,max_credits:null},operation:{...op,state:"completed",linked:true,email:"suprimido@a.example"}};
  });
  await render(client);await click("Completar vínculo");
  expect(consultas).toBe(2);expect(el.querySelector('.contacto-guardado')).toBeNull();expect(el.textContent).not.toContain("suprimido@a.example");
 });
 it("mantiene el contexto consultado cuando falla la asociación automática",async()=>{
  const client=vi.fn<ClienteContactos>(async b=>{if(b.action==="resolve_known")throw Error("Actualizaciones deshabilitadas");return context("a","matched");});
  await render(client);expect(el.textContent).toContain("Actualizaciones deshabilitadas");expect(el.textContent).toContain("a.example");
 });
 it("descarta respuestas anteriores al cambiar de cuenta aunque el transporte sea el mismo",async()=>{
  let finish!:(r:RespuestaContacto)=>void;let first=true;
  const client=vi.fn<ClienteContactos>(async()=>first?(first=false,new Promise(r=>{finish=r;})):context("a","restricted"));
  await render(client);await render(client,"cuenta-b");await act(async()=>finish({...context(),vendor:{...context().vendor,email:"privado@a.example"}}));
  expect(el.textContent).not.toContain("privado@a.example");expect(client.mock.calls.some(([b])=>b.action==="resolve_known")).toBe(false);
 });
 it("una respuesta incierta ofrece consultar estado sin repetir gasto",async()=>{
  const client=vi.fn<ClienteContactos>(async()=>({...context(),operation:{...op,state:"uncertain"}}));
  await render(client);expect(button("Consultar estado")).toBeTruthy();expect(button("Ver correo")).toBeUndefined();expect(el.textContent).toContain("No vuelvas a confirmar");
 });
 it("renueva una confirmación vencida sin solicitar créditos",async()=>{
  const client=vi.fn<ClienteContactos>(async b=>b.action==="prepare_reveal"?{operation:op}:{...context(),operation:{...op,expires_at:"2000-01-01"}});
  await render(client);await click("Actualizar confirmación");
  expect(client.mock.calls.filter(([b])=>b.action==="confirm_reveal")).toHaveLength(0);
  expect(button("Confirmar y guardar")).toBeTruthy();
 });
 it("un visor puede consultar pero no confirmar un borrador recuperado",async()=>{
  const c=context();c.capabilities={...c.capabilities,can_write:false,can_spend:false};
  const client=vi.fn<ClienteContactos>(async()=>({...c,operation:{...op,confirmation_hash:null}}));
  await render(client);expect(button("Confirmar y guardar").disabled).toBe(true);
  await click("Confirmar y guardar");expect(client.mock.calls.filter(([b])=>b.action==="confirm_reveal")).toHaveLength(0);
 });
});
