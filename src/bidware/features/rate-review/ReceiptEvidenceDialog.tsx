import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { Dialog } from "@/components/ui";
import { useLang } from "@/i18n/language";
import type { StagedRate } from "./readiness";
import { getStagingReceipt } from "./rateReview.service";
import { parseStagingReceipt, type ReceiptView } from "./receiptEvidence";
import { createReceiptRequest } from "./receiptRequest";

export function ReceiptEvidenceDialog({ row, onClose }: { row: StagedRate | null; onClose: () => void }) {
  const auth = useAuth();
  const ready = auth.authenticated && !auth.loading && auth.roleLoaded;
  // Losing verification unmounts the reader. Restoring the same account must load afresh,
  // rather than displaying a prior result whose boolean "ready" binding happens to match.
  const binding = JSON.stringify([auth.user?.id, auth.role, row?.id, row?.raw_upload_id]);
  return ready && row
    ? <ReceiptRead key={binding} binding={binding} row={row} onClose={onClose} />
    : <ReceiptDisplay view={{ state: "unavailable" }} onClose={onClose} />;
}

function ReceiptRead({ binding, row, onClose }: { binding: string; row: StagedRate; onClose: () => void }) {
  const [view, setView] = useState<ReceiptView>({ state: "loading" });
  const id = row.id, rawUploadId = row.raw_upload_id;
  useEffect(() => {
    const request = createReceiptRequest<ReceiptView>((_key, result) => setView(result));
    void request.load(binding, async () => parseStagingReceipt(await getStagingReceipt(id), {
      id, raw_upload_id: rawUploadId,
    }), { state: "unavailable" });
    return () => request.retire();
  }, [binding, id, rawUploadId]);
  return <ReceiptDisplay view={view} row={row} onClose={onClose} />;
}

function ReceiptDisplay({ view, row, onClose }: { view: ReceiptView; row?: StagedRate; onClose: () => void }) {
  const lang = useLang();
  const t = (es: string, en: string) => lang === "en" ? en : es;
  const title = t("Recibo de la cotización", "Quote receipt");
  return (
    <Dialog title={title} ariaLabel={title} onClose={onClose} footer={<button onClick={onClose}>{t("Cerrar", "Close")}</button>}>
      <div style={{ display: "grid", gap: 14, overflowWrap: "anywhere" }}>
        {row && view.state !== "unavailable" && view.state !== "loading" && <p>{row.origin || "—"} → {row.destination || "—"}</p>}
        <p>{t("Consulta de la evidencia conservada por Rateware. El recibo no equivale a aprobación de tarifa ni adjudicación.", "Evidence retained by Rateware. A receipt is not rate approval or an award.")}</p>
        {view.state === "loading" && <p role="status">{t("Consultando el recibo…", "Loading receipt…")}</p>}
        {view.state === "unavailable" && <p role="alert">{t("No pudimos consultar el recibo. No podemos determinar si existe.", "Receipt could not be read. Its existence is unknown.")}</p>}
        {view.state === "missing" && <p role="status">{t("No hay evidencia de recibo disponible para este registro. Esto no significa que no exista una cotización.", "No receipt evidence is available for this record. This does not mean no quote exists.")}</p>}
        {view.state === "inconsistent" && <p role="alert">{t("La evidencia del recibo es inconsistente. No podemos vincularla con seguridad a este registro y su original.", "Receipt evidence is inconsistent. It cannot safely be linked to this record and its original.")}</p>}
        {view.state === "recorded" && <>
          <dl>
            <dt>{t("Recibo", "Receipt")}</dt><dd>{view.receiptId}</dd>
            <dt>Staging</dt><dd>{view.stagingId}</dd>
            <dt>{t("Estado actual del registro", "Current record status")}</dt><dd>{view.currentStatus || t("No informado", "Not provided")}</dd>
          </dl>
          {view.original ? <section aria-label={t("Archivo de respaldo", "Supporting original")}>
            <h3>{t("Archivo de respaldo", "Supporting original")}</h3>
            <dl>
              <dt>{t("Original registrado", "Registered original")}</dt><dd>{view.original.rawUploadId}</dd>
              <dt>{t("Versión", "Version")}</dt><dd>{view.original.objectVersion}</dd>
              <dt>{t("Tamaño", "Size")}</dt><dd>{view.original.sizeBytes} bytes</dd>
              <dt>SHA-256</dt><dd>{view.original.sha256}</dd>
            </dl>
            <p>{t("Referencia histórica: no habilita descargas ni nuevos envíos.", "Historical reference: does not enable downloads or new submissions.")}</p>
          </section> : <p>{t("El recibo no incluye una referencia verificable de archivo original.", "The receipt has no verifiable original file reference.")}</p>}
        </>}
      </div>
    </Dialog>
  );
}
