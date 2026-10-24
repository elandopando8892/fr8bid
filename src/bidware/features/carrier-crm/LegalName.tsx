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
