import { tr } from "@/i18n/carrier-crm";
import { useLang } from "@/i18n/language";
import { useState } from "react";
import { Dialog, ErrorBanner, InfoBanner, dateShort } from "@/components/ui";
import type { Vendor } from "@/types/domain";
import { vendorLabel } from "./crm.service";
import { createProfileLink } from "./contact.service";

/**
 * The carrier's own profile link, made on request (opening this creates
 * nothing). The team sends it by mail or WhatsApp, as it did from rateware.
 */
export function ProfileLinkDialog({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await createProfileLink(vendor.id);
      setLink({ url: res.url, expires_at: res.expires_at });
      await copy(res.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false); // The link stays on screen to copy by hand.
    }
  }

  return (
    <Dialog
      title={tr("text222", vendorLabel(vendor))}
      onClose={onClose}
      footer={
        link ? (
          <button className="primary" onClick={() => copy(link.url)}>
            {copied ? tr("text223") : tr("text224")}
          </button>
        ) : (
          <button className="primary" disabled={busy} onClick={create}>
            {busy ? tr("text225") : tr("text226")}
          </button>
        )
      }
    >
      <p style={{ marginTop: 0, fontSize: 13.5, lineHeight: 1.5 }}>
        {tr("text227")}</p>
      {error && <ErrorBanner message={error} />}
      {link && (
        <div style={{ display: "grid", gap: 8 }}>
          <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="mono" style={{ fontSize: 12 }} />
          <InfoBanner>
            {copied ? tr("text228") : tr("text229")}
            {tr("text230")}{dateShort(link.expires_at)}{tr("text231")}</InfoBanner>
        </div>
      )}
    </Dialog>
  );
}
