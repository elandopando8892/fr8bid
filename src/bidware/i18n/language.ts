import { useEffect, useSyncExternalStore } from "react";

export type Lang = "es" | "en";
export const LANGUAGE_KEY = "bidware.team.lang";
const listeners = new Set<() => void>();
function initialLang(): Lang {
  try { return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "es"; }
  catch { return "es"; }
}
let lang: Lang = initialLang();
let teamBoard = false;
// Public portals keep their own language controls and storage keys.
const publicPage = () => typeof location !== "undefined" && /^\/(?:bid\/|rfi\/|board(?:\/|$)|(?:rfx-bid|customer-rfi|carrier-profile|shipper-profile|bid-room-board)\.html)/.test(location.pathname);
const boardPage = () => typeof location !== "undefined" && /^\/(?:board(?:\/|$)|bid-room-board\.html)/.test(location.pathname);
export const getLang = (): Lang => publicPage() && !(teamBoard && boardPage()) ? "es" : lang;
export const locale = (spanishLocale = "es-MX") => getLang() === "en" ? "en-US" : spanishLocale;
/** The authenticated team uses its preference on the board; anonymous visitors keep ES. */
export function useTeamBoardLanguage(authenticated: boolean) {
  useEffect(() => {
    teamBoard = authenticated;
    listeners.forEach((notify) => notify());
    return () => {
      teamBoard = false;
      listeners.forEach((notify) => notify());
    };
  }, [authenticated]);
}
export function setLang(next: Lang) {
  lang = next;
  try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* Storage may be blocked. */ }
  listeners.forEach((notify) => notify());
}
if (typeof window !== "undefined") window.addEventListener("storage", (event) => {
  if (event.key === LANGUAGE_KEY || event.key === null) {
    lang = initialLang();
    listeners.forEach((notify) => notify());
  }
});
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
};
export const useLang = () => useSyncExternalStore(subscribe, getLang, () => "es" as Lang);

export type Copy = Record<string, { es: string; en: string }>;
/** Parameters are interpolated after choosing copy; user data is never translated. */
const SIN_ACENTO: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };
const plural = (word: string, suffix: string) =>
  suffix === "es" ? `${word.replace(/([áéíóú])([nsl])$/, (_m, v: string, c: string) => SIN_ACENTO[v] + c)}es` : `${word}s`;

// Hasta dos palabras sin marca entre el número y la primera «(s)»: «2 new
// draft(s)», «1 reading warning(s)».
const MARKED_WORDS = String.raw`((?:\s+[^\s(){}\d]+){0,2}?(?:\s+[^\s(){}]+\((?:s|es)\))+)`;

/**
 * «1 tarifa(s)» → «1 tarifa»; «7 tarifa(s)» → «7 tarifas»; «2 acción(es)» →
 * «2 acciones». Every «palabra(s)» right after a number agrees with it, so
 * «1 correo(s) rebotado(s)» reads «1 correo rebotado».
 */
export function pluralize(text: string): string {
  return text.replace(new RegExp(String.raw`(\d[\d.,]*)` + MARKED_WORDS, "g"), (_m, n: string, words: string) => {
    const one = Number(n.replace(/[.,]/g, "")) === 1;
    return n + words.replace(/([^\s(){}]+)\((s|es)\)/g, (_w, word: string, suffix: string) => (one ? word : plural(word, suffix)));
  });
}

export function translator<T extends Copy>(copy: T) {
  return (key: keyof T, ...values: unknown[]) => {
    const value = (index: string) => String(values[Number(index)] ?? "");
    // Solo el texto de la plantilla se pluraliza: «{0} tarifa(s)» concuerda con
    // el valor, y los valores interpolados (nombres, datos) quedan intactos.
    const text = pluralize(copy[key]?.[getLang()] ?? String(key)).replace(
      new RegExp(String.raw`\{(\d+)\}` + MARKED_WORDS + "?", "g"),
      (token, index: string, words: string) => {
        if (Number(index) >= values.length) return token;
        return words ? pluralize(`${value(index)}${words}`) : value(index);
      });
    return text;
  };
}

/** Locale-aware numbers with the currency symbols already used by the ES UI. */
export function formatCurrency(value: number, currency: string, options: Intl.NumberFormatOptions = {}) {
  const formatter = new Intl.NumberFormat(locale(), { style: "currency", currency, ...options });
  if (getLang() === "en") return formatter.format(value);
  const symbol = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0).find(p => p.type === "currency")?.value ?? currency;
  return formatter.formatToParts(value)
    .filter(p => !(p.type === "literal" && /^\s+$/.test(p.value)))
    .map(p => p.type === "currency" ? symbol : p.value).join("");
}
