import { REEFER_POLICY } from '../../packages/carrier-fit/reefer-restrictions.mjs';
export const policy=REEFER_POLICY;
export const ids={sodesa:'578217e1-2dd4-4ab2-9303-1b3e03e83029',sicar:'5f2af3ef-b32a-4098-9a45-25650e5ffc4e',breco:'ea86bbed-5d35-41c9-86ec-15a8d00397d5',innovativos:'c99998e0-8a41-44e9-86ad-b35e233da2b5',frio:'4988e190-c942-4fac-b2af-981e8a8891b1',matjo:'43d03561-afa1-4f3c-959f-452415bcc31f'};
export const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const requirements='Producto: Jitomate\nTemperatura: 10 °C\nPeso bruto: 18000 kg\nTarimas: Sí\nPreenfriado: Sí\nDespacho aduanal a cargo del carrier: No\nSeguro de carga a cargo del carrier: No\nManiobras a cargo del carrier: No';
// Literal requirement string from the captured historical lane; identities stay synthetic.
export const innovativosRequirements='Temperatura 10° C, Peso: 18,000 kgs, Mercancía: Arbolitos';
export function innovativosLane(patch={}) {return lane({destination_city:'Laredo',destination:'Laredo',service_specifications:innovativosRequirements,...patch});}
export function lane(patch={}) {return {id:uid(1),rfx_event_id:uid(10),lane_number:1,origin:'Querétaro',origin_city:'Querétaro',origin_state:'QE',origin_country:'MX',destination:'Pharr',destination_city:'Pharr',destination_state:'TX',destination_country:'US',equipment:'Truck Trailer',trailer:'Reefer',operation:'MX Northbound',service_specifications:requirements,...patch};}
export function input(vendor='sodesa',patch={}) {return {templateId:policy.templateId,organizationId:policy.organizationId,vendorId:ids[vendor],lanes:[lane()],...patch};}

/** Synthetic PostgREST boundary for the actual handler; no external services. */
export function fixture() {
  const organization=policy.organizationId, owner='org:'+organization;
  const tables={
    vendor_segments:[{id:policy.templateId,segment_type:'participant_template',segment_name:'D2D Reefer · prueba ficticia',organization_id:organization,lifecycle_status:'active',template_version:1,vendor_ids:Object.values(ids)}],
    vendors:Object.entries(ids).map(([name,id])=>({id,vendor_name:'Carrier ficticio '+name,organization_id:organization,status:'inactive',base_stage:'procurement',primary_email:name+'@example.test'})),
    rfx_events:[{id:uid(10),name:'Evento ficticio Reefer',owner_email:owner,organization_id:organization}],
    rfx_lanes:[lane()],rfx_lane_vendors:[],carrier_template_materialization_operations:[],saas_audit_log:[],
  };
  const calls=[],writes=[]; let readError=null;
  const clone=x=>structuredClone(x);
  const matches=(table,row,filters)=>filters.every(([kind,key,v])=>{
    let value=row[key];
    if(key.startsWith('rfx_events.')) value=tables.rfx_events.find(e=>e.id===row.rfx_event_id)?.[key.split('.')[1]];
    if(kind==='in') return v.includes(value);
    if(kind==='array') return JSON.stringify(value)===JSON.stringify(v);
    if(kind==='neq')return value!==v;
    return value===v;
  });
  const client={from(table){
    if(!Object.hasOwn(tables,table))throw Error('Unexpected fixture table '+table);
    let operation='read',values,options={},filters=[],single=false;
    const q={
      select(){return q;},eq(k,v){filters.push(['eq',k,v]);return q;},neq(k,v){filters.push(['neq',k,v]);return q;},in(k,v){filters.push(['in',k,v]);return q;},
      filter(k,op,v){if(op!=='eq')throw Error('Unexpected fixture filter');filters.push(['array',k,v.slice(1,-1).split(',').filter(Boolean)]);return q;},
      upsert(v,o={}){operation='upsert';values=v;options=o;return q;},insert(v){operation='insert';values=v;return q;},update(v){operation='update';values=v;return q;},
      maybeSingle(){single=true;return q;},single(){single=true;return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
        calls.push({table,operation,filters:clone(filters)});
        if(operation==='read'&&readError===table)return {error:{message:'Synthetic read failure'},data:null};
        let rows=tables[table].filter(r=>matches(table,r,filters));
        if(operation==='update'){for(const r of rows)Object.assign(r,clone(values));writes.push({table,operation,rows:clone(rows)});}
        if(operation==='insert'||operation==='upsert'){
          rows=[];for(const raw of Array.isArray(values)?values:[values]){
            const keys=String(options.onConflict||'id').split(',');
            const existing=tables[table].find(r=>keys.every(k=>raw[k]!==undefined&&r[k]===raw[k]));
            if(existing&&options.ignoreDuplicates){continue;}
            const row=existing??{id:uid(1000+tables[table].length),...clone(raw)};
            if(!existing)tables[table].push(row);else Object.assign(row,clone(raw));rows.push(row);
          }writes.push({table,operation,rows:clone(rows)});
        }
        return {data:single?clone(rows[0]??null):clone(rows),error:null};
      }).then(resolve,reject);}
    };return q;
  }};
  return {client,tables,calls,writes,failRead(table){readError=table;},organization,owner};
}
