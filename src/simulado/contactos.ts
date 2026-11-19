// Doble local de carrier-contacts-api (rateware#203) para pruebas del MCP: reproduce
// las reglas del contrato durable (organización del principal, una operación por
// organización·empresa·persona, «claim» atómico con hash y vencimiento, política de
// créditos, rebotados y suprimidos fuera) y un Apollo falso que cuenta créditos.
// Nunca llama a Apollo ni a Rateware reales.

export interface UsuarioSim { actor: string; organizacion: string; rol: "admin" | "operator" | "viewer" }
export interface EmpresaSim { id: string; organizacion: string; nombre: string; dominio: string; correo: string | null; correoVigente: boolean; conocidos: string[]; rebotados?: string[]; restringida?: boolean }
export interface PersonaApolloSim { id: string; name: string; title: string; has_email: boolean; email?: string; email_status?: string }

const PUBLICOS = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com"]);
const hex = () => Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const tick = () => new Promise(r => setTimeout(r, 0));

export function crearContactosSimulados(o: { usuarios: Record<string, UsuarioSim>; empresas: EmpresaSim[]; apollo: Record<string, PersonaApolloSim[]>; ahora?: () => number }) {
  const ahora = o.ahora ?? (() => Date.now());
  const estado = {
    escrituras: true, politica: { id: "apollo-email-2026-11", max_credits: 1 } as { id: string; max_credits: number } | null,
    creditos: 0, llamadas: [] as string[], cache: new Map<string, any>(), ops: [] as any[],
    /** Fallo de Apollo en people/match: «red» simula respuesta perdida (incierta). */
    falloMatch: null as null | "red"
  };
  const fallo = (status: number, code: string) => ({ status, body: { code, error: code } });
  const empresaDe = (u: UsuarioSim, id: unknown) => o.empresas.find(e => e.id === id && e.organizacion === u.organizacion) ?? null;
  const opPublica = (op: any, u: UsuarioSim) => op ? { id: op.id, vendor_id: op.vendor_id, person_id: op.person_id, person_name: op.candidate.name, state: op.state,
    confirmation_hash: op.actor === u.actor && u.rol === "admin" ? op.confirmation_hash : null, expires_at: new Date(op.expires_at).toISOString(),
    max_credits: op.policy.max_credits, credits_confirmed: op.credits_confirmed ?? null, email: op.result?.email ?? null, linked: op.linked, code: op.code ?? null } : null;
  function contexto(e: EmpresaSim) {
    const dominioOk = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e.dominio) && !PUBLICOS.has(e.dominio);
    const comparten = o.empresas.filter(x => x.organizacion === e.organizacion && x.dominio === e.dominio).length > 1;
    const candidatos = e.conocidos.filter(c => c.endsWith(`@${e.dominio}`) && !(e.rebotados ?? []).includes(c)).sort().map(email => ({ email, source: "Registro de la empresa" }));
    const known = e.restringida ? "restricted" : e.correoVigente ? "current" : !dominioOk ? "domain_required" : comparten ? "ambiguous" : candidatos.length === 0 ? "missing" : candidatos.length === 1 ? "matched" : "ambiguous";
    return { vendor: { id: e.id, name: e.nombre, domain: e.dominio, email: e.correoVigente ? e.correo : null }, known: { state: known, candidates: e.restringida || e.correoVigente || !dominioOk || comparten ? [] : candidatos }, available: !e.restringida, dominioOk, comparten };
  }
  async function llamar(body: Record<string, any>, auth: string) {
    const u = o.usuarios[auth.replace(/^Bearer /, "")];
    if (!u) return fallo(401, "SESSION_REQUIRED");
    estado.llamadas.push(String(body.action));
    await tick();
    const escribe = ["search", "prepare_reveal", "confirm_reveal", "choose_known", "resolve_known", "apply_result"].includes(body.action);
    if (escribe && u.rol === "viewer") return fallo(403, "ACCESS_DENIED");
    if (["prepare_reveal", "confirm_reveal"].includes(body.action) && u.rol !== "admin") return fallo(403, "ADMIN_REQUIRED");
    if (escribe && !estado.escrituras) return fallo(403, "WRITES_DISABLED");
    if (["prepare_reveal", "confirm_reveal"].includes(body.action) && !estado.politica) return fallo(503, "CREDIT_POLICY_UNAVAILABLE");
    if (body.action === "confirm_reveal") return reclamar(u, body);
    const e = empresaDe(u, body.vendor_id);
    if (!e) return fallo(403, "CONTACT_ACCESS");
    const c = contexto(e);
    const opActual = estado.ops.filter(x => x.organizacion === u.organizacion && x.vendor_id === e.id).sort((a, b) => b.actualizada - a.actualizada)[0] ?? null;
    const caps = { can_write: estado.escrituras && u.rol !== "viewer", can_search: estado.escrituras && u.rol !== "viewer" && c.available && c.dominioOk && !(c.known.state === "ambiguous" && !c.known.candidates.length),
      can_spend: estado.escrituras && u.rol === "admin" && !!estado.politica && c.available, max_credits: estado.politica?.max_credits ?? null };
    if (body.action === "context") return { status: 200, body: { vendor: c.vendor, known: c.known, operation: opPublica(opActual, u), available: c.available, capabilities: caps } };
    if (body.action === "choose_known") {
      if (c.known.state === "current") return { status: 200, body: { vendor: c.vendor, known: c.known } };
      if (!c.known.candidates.some(x => x.email === body.email)) return fallo(409, "CONFIRMATION_CHANGED");
      e.correo = body.email; e.correoVigente = true;
      return { status: 200, body: { vendor: { ...c.vendor, email: body.email }, known: { state: "linked", candidates: c.known.candidates } } };
    }
    if (!c.available) return fallo(403, "CONTACT_ACCESS");
    if (body.action === "search") {
      if (!c.dominioOk || c.comparten) return fallo(409, "COMPANY_DOMAIN_REQUIRED");
      const gente = (o.apollo[e.dominio] ?? []).map(p => ({ id: p.id, name: p.name, title: p.title, domain: e.dominio, company_name: e.nombre, company_verified: true, has_email: p.has_email }));
      for (const p of gente) estado.cache.set(`${u.organizacion}|${e.id}|${p.id}`, { p, vence: ahora() + 3600_000 });
      return { status: 200, body: { candidates: gente } };
    }
    if (body.action === "prepare_reveal") {
      if (!c.dominioOk || c.comparten) return fallo(409, "CONFIRMATION_CHANGED");
      const activa = estado.ops.find(x => x.organizacion === u.organizacion && x.vendor_id === e.id && ["processing", "needs_link", "uncertain"].includes(x.state));
      if (activa) return { status: 200, body: { operation: opPublica(activa, u) } };
      let op = estado.ops.find(x => x.organizacion === u.organizacion && x.vendor_id === e.id && x.person_id === body.person_id);
      if (op && op.state !== "draft") return { status: 200, body: { operation: opPublica(op, u) } };
      const cand = estado.cache.get(`${u.organizacion}|${e.id}|${body.person_id}`);
      if (!cand || cand.vence <= ahora() || !cand.p.has_email) return fallo(409, "CONFIRMATION_CHANGED");
      for (const x of estado.ops) if (x.organizacion === u.organizacion && x.vendor_id === e.id && x.state === "draft" && x.person_id !== body.person_id) x.expires_at = ahora();
      if (!op) { op = { id: crypto.randomUUID(), organizacion: u.organizacion, vendor_id: e.id, person_id: body.person_id, domain: e.dominio, linked: false }; estado.ops.push(op); }
      Object.assign(op, { actor: u.actor, candidate: cand.p, policy: { ...estado.politica }, confirmation_hash: hex(), expires_at: ahora() + 15 * 60_000, state: "draft", actualizada: ahora() });
      return { status: 200, body: { operation: opPublica(op, u) } };
    }
    return fallo(400, "INVALID_REQUEST");
  }
  async function reclamar(u: UsuarioSim, body: Record<string, any>) {
    const op = estado.ops.find(x => x.id === body.operation_id && x.organizacion === u.organizacion);
    if (!op) return fallo(409, "CONFIRMATION_CHANGED");
    if (op.actor !== u.actor) return fallo(403, "CONTACT_ACCESS");
    if (op.state !== "draft") return { status: 200, body: { operation: opPublica(op, u) } };
    if (op.expires_at <= ahora() || op.confirmation_hash !== body.confirmation_hash || op.policy.max_credits !== estado.politica?.max_credits) return fallo(409, "CONFIRMATION_CHANGED");
    // Claim atómico: el estado cambia antes de cualquier espera.
    op.state = "processing"; op.actualizada = ahora();
    await tick();
    estado.creditos += 1;
    if (estado.falloMatch === "red") { op.state = "uncertain"; op.code = "APOLLO_UNCERTAIN"; throw new Error("respuesta perdida"); }
    const p = (o.apollo[op.domain] ?? []).find(x => x.id === op.person_id);
    const e = o.empresas.find(x => x.id === op.vendor_id)!;
    if (p?.email && p.email_status === "verified" && p.email.endsWith(`@${op.domain}`)) {
      op.result = { email: p.email }; e.correo = p.email; e.correoVigente = true; op.state = "completed"; op.linked = true; op.code = "RESULT_SAVED";
    } else { op.state = "completed"; op.code = "EMAIL_UNAVAILABLE"; op.result = { email: null }; }
    op.credits_confirmed = 1; op.actualizada = ahora();
    return { status: 200, body: { operation: opPublica(op, u) } };
  }
  return { estado, llamar };
}
