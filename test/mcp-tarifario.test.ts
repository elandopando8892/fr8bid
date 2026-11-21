import {describe, expect, it} from "vitest";
import {crearLecturas} from "../src/mcp/lecturas";
import {manejar, ESCRITURAS, LECTURAS} from "../src/servidor/proxy";
import type {Transporte} from "../src/cliente/api";

const uuid=(i:number)=>`aaaabbbb-0000-4000-8000-${String(i).padStart(12,"0")}`;
const filtro = {origen:"Laredo, Texas, USA", destino:{ciudad:"Monterrey",estado:"Nuevo León",pais:"México"}, equipo:"Reefer"};
const base = {
  vendor_id:uuid(10), vendors:{vendor_name:"Transportista de prueba",legal_name:"Empresa ficticia, LLC"},
  origin_city:"Laredo", origin_state:"TX", origin_country:"US", destination_city:"Monterrey",
  destination_state:"NL", destination_country:"MX", equipment:"Truck Trailer", trailer:"Reefer", config:"Single",
  service:"One Way", operation:"MX Southbound", importe_original:"650.00",moneda_original:"USD",tipo_importe:"costo_historico",
  tipo_fuente:"referencia_comercial",metodo_fuente:"structured_template",status:"approved",valid_from:null,valid_through:null,
  created_at:"2022-01-19T00:00:00Z",quote_date:"2021-10-04",
};
function fuente(rows:Record<string,any>[]) {
  const calls:Record<string,unknown>[]=[];
  const t:Transporte=async (s, body) => manejar(s,body,"Bearer prueba-sintetica",{
    permitirEscrituras:false,real:true,
    enviar:async (_servicio, query, token)=>{
      expect(token).toBe("Bearer prueba-sintetica");
      calls.push(query);
      expect(query.action).toBe("list_carrier_tariff_candidates");
      const candidatas=rows.filter(r=>r.id>String(query.after_id ?? ""));
      const page=candidatas.slice(0,Number(query.limit));
      const more=page.length<candidatas.length;
      return {status:200,headers:{},body:{rows:page,has_more:more,next_cursor:more?page.at(-1)?.id:null}};
    },
  });
  const run=crearLecturas(t,()=>new Date("2026-11-20T18:00:00Z"),"viewer");
  return {calls,consulta:(extra:Record<string,unknown>={})=>run("consultar_tarifario",{...filtro,...extra})};
}

describe("tarifario general de Rateware",()=>{
  it("separa Laredo y Nuevo Laredo por ciudad, estado y país y preserva el costo y la moneda originales",async()=>{
    const s=fuente([
      {...base,id:uuid(1)},
      {...base,id:uuid(2),origin_city:"Nuevo Laredo",origin_state:"TAM",origin_country:"MX",moneda_original:"MXN"},
      {...base,id:uuid(3),origin_state:"CA"},
      {...base,id:uuid(4),origin_country:"MX"},
    ]);
    const a=await s.consulta({equipo:"Refrigerado"});
    expect(a.tarifas).toHaveLength(1);
    expect(a.tarifas[0]).toMatchObject({tarifa_id:uuid(1),importe_original:"650.00",moneda_original:"USD",fecha_cotizacion:null,fecha_referencia:"2021-10-04",
      fuente:{tipo:"referencia_comercial"},estado_aprobacion:"approved",vigencia:"desconocida",razon_social:"Empresa ficticia, LLC"});
    const b=await s.consulta({origen:{ciudad:"Nuevo Laredo",estado:"Tamaulipas",pais:"México"}});
    expect(b.tarifas.map((v:any)=>[v.tarifa_id,v.moneda_original])).toEqual([[uuid(2),"MXN"]]);
    expect(s.calls[1]).toMatchObject({origin_city:"Nuevo Laredo",destination_city:"Monterrey"});
  });
  it("53 pies y FTL requieren evidencia específica, independiente de Truck Trailer, Single y One Way",async()=>{
    const s=fuente([{...base,id:uuid(1)}, {...base,id:uuid(2),config:"53 ft"},
      {...base,id:uuid(3),trailer:"Reefer 53'",servicio_fuente:"Full Truckload"},
      {...base,id:uuid(4),equipo_fuente:"Truck Trailer Reefer 48'",service:"FTL"},
      {...base,id:uuid(5),trailer:null,remolque_fuente:"Reefer",largo_remolque_fuente:"53 ft",modalidad_fuente:"FTL"}]);
    const a=await s.consulta({equipo:"Truck Trailer Reefer de 53 pies",tipo_servicio:"FTL"});
    expect(a.tarifas.map((r:any)=>r.tarifa_id)).toEqual([uuid(3),uuid(5)]);
    expect(a.descartadas).toEqual({largo_sin_evidencia:1,servicio_sin_coincidencia:1,equipo:1});
    expect(a.completa).toBe(true);
  });
  it("preserva campos nulos y no acredita vigencia ni cotización por el estatus approved",async()=>{
    const s=fuente([{...base,id:uuid(1),importe_original:null,moneda_original:null,vendors:{vendor_name:"Marca"},importe_registrado:100,moneda_registrada:"MXN"},
      {...base,id:uuid(2),valid_through:"2022-01-01"},
      {...base,id:uuid(3),status:"pending_review",tipo_fuente:"cotizacion_transportista",valid_from:"2026-01-01",valid_through:"2026-12-31"}]);
    expect((await s.consulta()).tarifas[0]).toMatchObject({importe_original:null,moneda_original:null,
      importe_registrado:100,moneda_registrada:"MXN",razon_social:null,vigencia:"desconocida"});
    expect((await s.consulta({incluir_vencidas:false})).tarifas.map((r:any)=>r.vigencia)).toEqual(["desconocida","vigente"]);
    expect((await s.consulta({incluir_historicas:false})).tarifas.map((r:any)=>r.estado_aprobacion)).toEqual(["pending_review"]);
  });
  it("continúa tras una página descartada; omite targets incluso con carrier, all-in y aprobación",async()=>{
    const s=fuente([{...base,id:uuid(1),tipo_fuente:"target_rfx"}, {...base,id:uuid(2)}, {...base,id:uuid(3)}]);
    const ids:string[]=[];
    let cursor:string|null=null;
    for (let i=0;i<3;i++) {
      const r=await s.consulta({limit:1,carrier_id:uuid(10),...(cursor && {cursor})});
      if (i===0) expect(r).toMatchObject({tarifas:[],completa:false,descartadas:{target_rfx:1}});
      ids.push(...r.tarifas.map((v:any)=>v.tarifa_id));
      cursor=r.siguiente_cursor;
    }
    expect(ids).toEqual([uuid(2),uuid(3)]);
    expect(cursor).toBeNull();
  });
  it("diferencia un error o cursor truncado de cero resultados y bloquea la apertura del directorio",async()=>{
    const row={...base,id:uuid(1)};
    for (const r of [
      {status:403,body:{code:"SIN_SCOPE"}},
      {status:200,body:{rows:[row,row],has_more:false,next_cursor:null}},
      {status:200,body:{rows:[],has_more:true,next_cursor:null}},
    ]) {
      const run=crearLecturas(async()=>({...r,headers:{}}));
      await expect(run("consultar_tarifario",filtro)).rejects.toThrow();
    }
    const action="list_carrier_tariff_candidates";
    expect(LECTURAS["rateware-api"].has(action)).toBe(true);
    expect(ESCRITURAS["rateware-api"].has(action)).toBe(false);
    const options={real:true,permitirEscrituras:false,enviar:async()=>{throw Error("No debe alcanzar Rateware");}};
    for (const extra of [{owner_email:"org:ficticia"},{origin_city:"%"},{limit:500},{raw_upload_id:uuid(9)}]) {
      const r=await manejar("rateware-api",{action,origin_city:"Laredo",destination_city:"Monterrey",limit:20,...extra},"Bearer prueba",options);
      expect(r.status).toBe(400);
    }
    expect((await fuente([]).consulta()).tarifas).toEqual([]);
  });
  it("conserva el cursor de entrada cuando una página excede el límite del MCP",async()=>{
    const s=fuente([{...base,id:uuid(2),rate_basis:"X".repeat(210000)}]);
    expect(await s.consulta({limit:2,cursor:uuid(1)})).toMatchObject({
      completa:false, cursor_entrada:uuid(1), limit_sugerido:1, error:{codigo:"RESPUESTA_DEMASIADO_GRANDE"},
    });
  });
});
