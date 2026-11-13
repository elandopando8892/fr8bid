import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// Contrato de confirmación SIN estado de servidor (Entrega 2 del MCP).
// preparar_* firma un JWT HS256 con FR8BID_MCP_CONFIRM_SECRET que lleva los
// cuerpos exactos que irán al proxy, su huella (h) y una foto de las
// precondiciones (pre). confirmar valida firma, vigencia (15 min), sesión,
// rol y h; vuelve a leer el evento y se niega si la foto ya no coincide.
// Riesgo residual documentado (docs/mcp-escrituras.md): dos confirmar
// simultáneos de la misma vista previa pueden pasar ambos la relectura; las
// claves idempotentes de Rateware cubren intentos, campaña y tandas, pero no
// una captura de oferta. Mejora posterior: tabla de nonces en Rateware.

export const EMISOR = "fr8bid-mcp";
export const AUDIENCIA = "fr8bid-mcp-confirmar";
export const VIGENCIA_S = 15 * 60;

/** null = confirmaciones pendientes de configurar (las lecturas siguen). */
export function secretoConfirmacion(env: NodeJS.ProcessEnv): Uint8Array | null {
  const s = env.FR8BID_MCP_CONFIRM_SECRET;
  return s && s.length >= 32 ? new TextEncoder().encode(s) : null;
}

/** JSON canónico: llaves ordenadas, sin undefined. */
export function canonico(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonico).join(",")}]`;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(x ?? null);
}

export const huella = (x: unknown) => createHash("sha256").update(canonico(x)).digest("hex");
/** h: cuerpos exactos y, si existe, el contenido fijado que no viaja en ellos (p. ej. la plantilla). */
export const huellaCuerpos = (cuerpos: unknown, fijo?: unknown) => huella(fijo === undefined ? cuerpos : { cuerpos, fijo });

export interface Captura {
  sub: string;
  client_id: string;
  act: string;
  ev: string;
  arg: Record<string, unknown>;
  cuerpos: Record<string, unknown>[];
  fijo?: unknown;
  h: string;
  pre: string;
  jti: string;
  exp: number;
}

export async function firmar(c: Omit<Captura, "h" | "jti" | "exp">, secreto: Uint8Array, ahora: Date): Promise<{ token: string; vence: string; h: string }> {
  const iat = Math.floor(ahora.getTime() / 1000);
  const h = huellaCuerpos(c.cuerpos, c.fijo);
  const token = await new SignJWT({ client_id: c.client_id, act: c.act, ev: c.ev, arg: c.arg, cuerpos: c.cuerpos, ...(c.fijo === undefined ? {} : { fijo: c.fijo }), h, pre: c.pre })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(c.sub)
    .setIssuer(EMISOR)
    .setAudience(AUDIENCIA)
    .setIssuedAt(iat)
    .setExpirationTime(iat + VIGENCIA_S)
    .setJti(randomUUID())
    .sign(secreto);
  return { token, vence: new Date((iat + VIGENCIA_S) * 1000).toISOString(), h };
}

/** Lanza si la firma, el emisor, la audiencia o la vigencia no son válidos. */
export async function verificar(token: string, secreto: Uint8Array, ahora: Date): Promise<Captura> {
  const { payload: p } = await jwtVerify(token, secreto, {
    algorithms: ["HS256"], issuer: EMISOR, audience: AUDIENCIA, currentDate: ahora,
    requiredClaims: ["sub", "exp", "iat", "jti", "client_id", "act", "ev", "arg", "cuerpos", "h", "pre"]
  });
  if (typeof p.client_id !== "string" || typeof p.act !== "string" || typeof p.ev !== "string" || typeof p.h !== "string" || typeof p.pre !== "string" ||
      !Array.isArray(p.cuerpos) || !p.arg || typeof p.arg !== "object") throw new Error("Confirmación incompleta");
  return p as unknown as Captura;
}
