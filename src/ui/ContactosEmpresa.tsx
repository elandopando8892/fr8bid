import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clasificarPuesto } from "../dominio/apollo";
import type { CandidatoContacto, ClienteContactos, ContextoContacto, EmpresaContacto, OperacionContacto, SolicitudContacto } from "../dominio/contactosEmpresa";
export interface PropsContactos {
  empresas: EmpresaContacto[]; contexto: string; cliente: ClienteContactos;
  seleccionInicial?: string | null; filtroInicial?: string; onSeleccion?: (id: string) => void; onFiltro?: (valor: string) => void;
  simulado?: boolean; onVinculado?: () => void;
}
// A session change destroys all selection and in-flight callbacks, even when
// the transport instance itself is unchanged.
export function ContactosEmpresa(props: PropsContactos) { return <ColaEmpresas key={props.contexto} {...props} />; }

function ColaEmpresas(props: PropsContactos) {
  const [seleccion, elegir] = useState(props.seleccionInicial || props.empresas[0]?.id);
  const [filtro, filtrar] = useState(props.filtroInicial || "");
  const [correos, setCorreos] = useState<Record<string, string | null>>({});
  const lista = useRef<HTMLDivElement>(null);
  useEffect(() => { lista.current?.querySelector<HTMLElement>('[aria-current]')?.scrollIntoView?.({ block: "nearest", inline: "center" }); }, [seleccion]);
  const seleccionar = (id: string) => { elegir(id); props.onSeleccion?.(id); };
  useEffect(() => { if (props.seleccionInicial) elegir(props.seleccionInicial); }, [props.seleccionInicial]);
  const empresas = props.empresas.filter(e => e.nombre.toLocaleLowerCase().includes(filtro.toLocaleLowerCase()));
  const empresa = props.empresas.find(e => e.id === seleccion) || props.empresas[0];
  const indice = empresas.findIndex(e => e.id === empresa?.id);
  if (!empresa) return null;
  return <section className="tarjeta contactos-empresa" aria-label="Contactos de empresas" id="contactos-empresas">
    <header className="fila"><div><h2>Contactos de empresas</h2><p className="tenue">Contacto conocido → correo de Apollo → guardado en la empresa.</p></div>
      {props.simulado && <span className="pill prueba">Demostración</span>}</header>
    <div className="contactos-cola">
      <nav aria-label="Empresas del evento">
        <label className="campo">Buscar empresa<input value={filtro} onChange={e => { filtrar(e.target.value); props.onFiltro?.(e.target.value); }} placeholder="Nombre de empresa" type="search" /></label>
        <div className="contactos-lista" ref={lista}>{empresas.map(e => <button key={e.id} type="button" aria-current={e.id === empresa.id ? "true" : undefined} onClick={() => seleccionar(e.id)}>
          <b>{e.nombre}</b><small>{(Object.hasOwn(correos, e.id) ? correos[e.id] : e.correo) ? "Con contacto" : "Por resolver"}</small>
        </button>)}</div>
        {!empresas.length && <p className="tenue">Ninguna empresa coincide.</p>}
      </nav>
      <div className="contactos-detalle">
        <div className="fila"><span className="tenue">{indice < 0 ? "Fuera del filtro" : `${indice + 1} de ${empresas.length}`}</span>
          <div className="contactos-pasos">
            <button type="button" className="btn-texto" disabled={indice <= 0} onClick={() => seleccionar(empresas[indice - 1].id)}>Anterior</button>
            <button type="button" className="btn-secundario" disabled={indice < 0 || indice >= empresas.length - 1} onClick={() => seleccionar(empresas[indice + 1].id)}>Siguiente empresa →</button>
          </div></div>
        <EmpresaPanel key={empresa.id} empresa={empresa} cliente={props.cliente} onVinculado={props.onVinculado} simulado={props.simulado}
          onCorreo={correo => setCorreos(prev => prev[empresa.id] === correo ? prev : { ...prev, [empresa.id]: correo })} />
      </div>
    </div>
  </section>;
}

function EmpresaPanel({ empresa, cliente, onVinculado, simulado, onCorreo }: { empresa: EmpresaContacto; cliente: ClienteContactos; onVinculado?: () => void; simulado?: boolean; onCorreo: (correo: string | null) => void }) {
  const [contexto, setContexto] = useState<ContextoContacto | null>(null);
  const [op, setOp] = useState<OperacionContacto | null>(null);
  const [candidatos, setCandidatos] = useState<CandidatoContacto[] | null>(null);
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState<string | null>(null);
  const [cancelado, setCancelado] = useState(false);
  const vivo = useRef(false), cerrojo = useRef(false), aviso = useRef(onVinculado);
  aviso.current = onVinculado;
  const notificarCorreo = useRef(onCorreo); notificarCorreo.current = onCorreo;
  useEffect(() => { if (contexto) notificarCorreo.current(contexto.vendor.email); }, [contexto]);
  useLayoutEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const cargar = async (notificarVinculo = true) => {
    const r = await cliente({ action: "context", vendor_id: empresa.id });
    if (!vivo.current) return;
    if (!r.vendor || !r.known || !r.capabilities) throw new Error("El servicio de contactos todavía no está disponible.");
    let c = r as ContextoContacto;
    // Keep the successful read visible if automatic association is denied later.
    setContexto(c); setOp(c.operation); setCancelado(false);
    if (c.known.state === "matched" && c.capabilities.can_write) {
      const linked = await cliente({ action: "resolve_known", vendor_id: empresa.id });
      if (!vivo.current) return;
      if (!linked.vendor || !linked.known || !linked.capabilities) throw new Error("No se confirmó el vínculo. Consulta de nuevo la empresa.");
      c = linked as ContextoContacto;
      if (c.known.state === "linked" && notificarVinculo) aviso.current?.();
    }
    setContexto(c); setOp(c.operation); setCancelado(false);
  };
  const ejecutar = async (trabajo: () => Promise<void>) => {
    if (cerrojo.current || !vivo.current) return;
    cerrojo.current = true; setOcupado(true); setError(null);
    try { await trabajo(); }
    catch (e) { if (vivo.current) setError(e instanceof Error ? e.message : "No se pudo completar la consulta."); }
    finally { cerrojo.current = false; if (vivo.current) setOcupado(false); }
  };
  useEffect(() => { void ejecutar(cargar); }, [cliente]);
  const operar = async (solicitud: SolicitudContacto) => {
    const r = await cliente(solicitud);
    if (!vivo.current) return;
    if (r.operation) {
      setOp(r.operation); setCancelado(false);
      if (r.operation.state === "completed") {
        // linked describes the historical operation. Current restrictions and
        // the company's current contact remain authoritative after every replay.
        try { await cargar(false); }
        catch (e) { if (vivo.current) setError(e instanceof Error ? e.message : "Consulta el estado actual de la empresa."); }
        if (!vivo.current) return;
        aviso.current?.();
      }
    } else throw new Error("No se pudo recuperar la operación. Consulta el estado de esta empresa.");
  };
  const confirmar = () => ejecutar(async () => {
    if (!op?.confirmation_hash || op.state !== "draft" || Date.parse(op.expires_at) <= Date.now()) return;
    try { await operar({ action: "confirm_reveal", operation_id: op.id, confirmation_hash: op.confirmation_hash }); }
    catch (e) { if (vivo.current) setOp({ ...op, state: "uncertain" }); throw e; }
  });
  const pendiente = op && ["processing", "uncertain", "needs_link"].includes(op.state);
  const correo = contexto?.vendor.email;
  return <div aria-busy={ocupado}>
    <h3>{empresa.nombre}</h3>
    {contexto?.vendor.domain && <p className="mono tenue">{contexto.vendor.domain}</p>}
    {ocupado && <p role="status">{op?.state === "draft" ? "Guardando operación…" : "Consultando contactos…"}</p>}
    {error && <div className="estado estado-error" role="alert">{error}<button type="button" className="btn-texto" disabled={ocupado} onClick={() => void ejecutar(cargar)}>Consultar estado</button></div>}
    {contexto && <>
      {correo && !contexto.available && <p className="estado estado-permiso">Esta empresa tiene restricciones. El contacto guardado no habilita su uso.</p>}
      {correo && <div className="contacto-guardado" role="status"><span className="pill ok-pill">Contacto guardado</span><p className="mono">{correo}</p><small>{contexto.known.state === "linked" ? "Vinculado automáticamente desde los datos de la empresa." : "Disponible en el registro de la empresa."}</small></div>}
      {!correo && <p>{({ restricted: "Esta empresa tiene restricciones. Revisa su estado antes de contactar.", domain_required: "Agrega el dominio corporativo de la empresa para encontrar contactos.", ambiguous: "Hay más de una coincidencia. Revisa los contactos de esta empresa.", matched: "Encontramos un contacto conocido. Su vínculo requiere habilitar actualizaciones.", missing: "Falta un correo para esta empresa.", current: "Contacto disponible.", linked: "Contacto vinculado." })[contexto.known.state]}</p>}
      {contexto.known.candidates.length > 0 && !correo && <ul className="contactos-conocidos">{contexto.known.candidates.map(c => <li key={c.email}><span className="mono">{c.email}</span><small>{c.source}</small>
        {contexto.known.state === "ambiguous" && <button type="button" className="btn-texto" disabled={ocupado || !contexto.capabilities.can_write} onClick={() => void ejecutar(async () => {
          const r = await cliente({ action: "choose_known", vendor_id: empresa.id, email: c.email });
          if (!vivo.current) return;
          if (!r.vendor || !r.known || !r.capabilities) throw new Error("No se confirmó el vínculo. Consulta de nuevo la empresa.");
          setContexto(r as ContextoContacto); setOp(r.operation || null); if (r.known.state === "linked") aviso.current?.();
        })}>Usar este contacto</button>}</li>)}</ul>}
      {simulado && <p className="tenue">Datos de demostración. Apollo y el guardado real se habilitan en la conexión con Rateware.</p>}
      {!simulado && !contexto.capabilities.can_write && <p className="tenue">Modo consulta: las actualizaciones están deshabilitadas para esta cuenta o entorno.</p>}
      {!correo && !pendiente && (op?.state !== "draft" || cancelado) && <>
        <button type="button" className="btn-secundario" disabled={ocupado || !contexto.capabilities.can_search} onClick={() => void ejecutar(async () => {
          const r = await cliente({ action: "search", vendor_id: empresa.id });
          if (vivo.current) setCandidatos([...(r.candidates || [])].sort((a, b) => clasificarPuesto(a.title).prioridad - clasificarPuesto(b.title).prioridad || Number(b.has_email) - Number(a.has_email)));
        })}>Buscar en Apollo</button><span className="tenue contactos-gratis">Búsqueda sin créditos</span>
        {!contexto.capabilities.can_search && !simulado && <p className="tenue">La búsqueda requiere un dominio corporativo y la conexión de Apollo disponible.</p>}
        {candidatos && <div className="contactos-candidatos">
          {!candidatos.length && <p>No se encontraron candidatos. Revisa el dominio de la empresa.</p>}
          {candidatos.map(c => <article key={c.id}><div><b>{c.name || "Nombre reservado por Apollo"}</b><p>{c.title || "Cargo no informado"}</p><small>Empresa reportada: {c.company_name || "No informada"}</small></div>
            <button type="button" className="btn-secundario" disabled={ocupado || !c.has_email || !contexto.capabilities.can_spend} onClick={() => void ejecutar(() => operar({ action: "prepare_reveal", vendor_id: empresa.id, person_id: c.id }))}>{c.has_email ? "Ver correo" : "Sin correo disponible"}</button></article>)}
          {candidatos.length > 0 && !contexto.capabilities.can_spend && <p className="tenue">Un administrador puede confirmar créditos cuando la tarifa de Apollo esté verificada.</p>}
        </div>}
      </>}
      {op?.state === "draft" && !cancelado && <Confirmacion op={op} empresa={empresa.nombre} dominio={contexto.vendor.domain} ocupado={ocupado} permitido={contexto.capabilities.can_spend} confirmar={confirmar} cancelar={() => setCancelado(true)} renovar={() => ejecutar(() => operar({ action: "prepare_reveal", vendor_id: empresa.id, person_id: op.person_id }))} />}
      {pendiente && <div className="estado" role="status"><b>{op.state === "needs_link" ? "Correo recuperado; falta completar el vínculo" : op.state === "processing" ? "La operación sigue en curso" : "Resultado pendiente de conciliar"}</b>
        {op.code === "EMAIL_UNVERIFIED" && <p>Apollo no confirmó que el correo sea válido. No se vinculó.</p>}
        {op.code === "COMPANY_MISMATCH" && <p>La respuesta no acredita a la misma empresa. No se vinculó.</p>}
        {op.provider_reference && <p className="tenue">Referencia para consultar en Apollo: {op.provider_reference}</p>}
        <p>{op.state === "needs_link" ? "El resultado ya está guardado. Puedes completar el vínculo sin volver a solicitar créditos." : "No vuelvas a confirmar créditos. Consulta esta misma operación para recuperar el resultado."}</p>
        <button type="button" className="btn-secundario" disabled={ocupado || (op.state === "needs_link" && !contexto.capabilities.can_write)} onClick={() => void ejecutar(op.state === "needs_link" ? () => operar({ action: "apply_result", operation_id: op.id }) : cargar)}>{op.state === "needs_link" ? "Completar vínculo" : "Consultar estado"}</button>
      </div>}
      {op?.state === "completed" && !op.linked && <p className="estado">{op.code === "CURRENT_CONTACT_PRESERVED" ? "Se conservó el contacto válido que ya tenía la empresa." : "Apollo no devolvió un correo utilizable para esta persona."}</p>}
      {op && op.state !== "draft" && <p className="tenue">{op.code === "KNOWN_CONTACT_PRESERVED" ? "Se encontró un contacto válido antes de solicitar créditos. Se conservó y no se pidió enriquecimiento." : op.credits_confirmed === null ? "Consumo pendiente de confirmar en Apollo." : `${op.credits_confirmed} créditos confirmados.`} <span className="contactos-operacion">Operación {op.id}</span></p>}
      {correo && <p className="nota">El vínculo no envía invitaciones. Continúa con la revisión de la Mesa.</p>}
    </>}
  </div>;
}

function Confirmacion({ op, empresa, dominio, ocupado, permitido, confirmar, cancelar, renovar }: { op: OperacionContacto; empresa: string; dominio: string; ocupado: boolean; permitido: boolean; confirmar: () => Promise<void>; cancelar: () => void; renovar: () => Promise<void> }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, [op.id, op.confirmation_hash]);
  const [vencida, vencer] = useState(Date.parse(op.expires_at) <= Date.now());
  useEffect(() => { vencer(Date.parse(op.expires_at) <= Date.now()); const id = setTimeout(() => vencer(true), Math.min(2147483647, Math.max(0, Date.parse(op.expires_at) - Date.now()))); return () => clearTimeout(id); }, [op.expires_at]);
  return <section className="confirmar" aria-label="Confirmar créditos">
    <h4 ref={titulo} tabIndex={-1}>Correo de {op.person_name}</h4><p><b>{empresa}</b> · {dominio}</p>
    <p>Hasta <b>{op.max_credits} créditos</b> de Apollo para esta persona. Solo correo profesional.</p>
    <p className="tenue">Comprobaremos que el correo pertenezca a esta empresa antes de vincularlo. Apollo puede consumir créditos aunque no devuelva correo.</p>
    {vencida && <p role="status">Esta confirmación venció. Actualízala para continuar.</p>}
    <div className="fila-botones"><button type="button" className="btn-primario" disabled={ocupado || !permitido || !op.confirmation_hash || op.max_credits === null} onClick={() => void (vencida ? renovar() : confirmar())}>{vencida ? "Actualizar confirmación" : "Confirmar y guardar"}</button>
      <button type="button" className="btn-texto" disabled={ocupado} onClick={cancelar}>Volver a los contactos</button></div>
  </section>;
}
