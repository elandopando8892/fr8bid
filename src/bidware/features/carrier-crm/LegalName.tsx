import { tr } from "@/i18n/carrier-crm";
import { useLang } from "@/i18n/language";
import type { Vendor } from "@/types/domain";

/**
 * "Razón social" cell. The CRM column wins; when it is empty, the legal name
 * the carrier typed in its profile is shown and marked as coming from there
 * (rateware's lightweight list returns it as `profile_legal_name`).
 */
export function legalNameOf(v: Vendor): { text: string; fromProfile: boolean } | null {
  const own = String(v.legal_name ?? "").trim();
  if (own) return { text: own, fromProfile: false };
  const profile = String(v.profile_legal_name ?? "").trim();
  return profile ? { text: profile, fromProfile: true } : null;
}

export function LegalName({ vendor }: { vendor: Vendor }) {
  useLang();
  const name = legalNameOf(vendor);
  if (!name) return <>—</>;
  return (
    <>
      {name.text}
      {name.fromProfile && (
        <div className="cell-sub" title={tr("text201")}>
          {tr("text202")}</div>
      )}
    </>
  );
}

/**
 * La razón social debajo del nombre del carrier, solo cuando dice otra cosa:
 * dos columnas con el mismo texto en casi todas las filas eran ruido (recorrido 3.10).
 */
export function legalNameIfDifferent(v: Vendor, label: string) {
  const name = legalNameOf(v);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return name && !same(name.text, label) ? name : null;
}

export function LegalNameUnder({ vendor, label }: { vendor: Vendor; label: string }) {
  useLang();
  const name = legalNameIfDifferent(vendor, label);
  if (!name) return null;
  return (
    <div className="cell-sub" title={name.fromProfile ? tr("text201") : undefined}>
      {name.text}
      {name.fromProfile ? ` · ${tr("text202")}` : ""}
    </div>
  );
}
