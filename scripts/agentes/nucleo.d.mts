export interface Paso { nombre: string; comando: string; args: string[] }
export interface ResultadoPaso { nombre: string; ok: boolean; ms?: number }
export interface Verificacion { sha: string; ok: boolean; limpio?: boolean; pasos: ResultadoPaso[]; revisionId?: string }
export type Veredicto = "BLOQUEA" | "CON_CAMBIOS" | "APROBADO";
export interface Revision { sha: string; veredicto: Veredicto | string; limpio?: boolean; completo?: boolean; id?: string; base?: string }

export const PASOS_VERIFICACION: Paso[];
export function validarNombre(nombre: string): string;
export function ramaDeTrabajo(nombre: string): string;
export function ramaPermitidaParaIntegrar(rama: string | null | undefined): boolean;
export function rutasSensibles(archivos: string[]): string[];
export function rutasSecretos(archivos: string[]): string[];
export function construirPromptDelegacion(o: { tarea: string; rama: string; base: string }): string;
export function construirPromptRevision(o: { base: string; diff: string; enfoque?: string }): string;
export function argShell(arg: string, win: boolean): string;
export function leerVeredicto(texto: string | null | undefined): Veredicto;
export function codigoRevision(veredicto: string, completo: boolean): number;
export function entornoVerificacion(entorno: Record<string, string | undefined>): Record<string, string>;
export function motivosRevision(o: { sha: string; base: string; revision?: Revision | null }): string[];
export function motivosParaNoIntegrar(o: {
  rama: string;
  sha: string;
  base: string;
  verificacion?: Verificacion | null;
  revision?: Revision | null;
  sensibles?: string[];
  aceptarSensibles?: boolean;
}): string[];
