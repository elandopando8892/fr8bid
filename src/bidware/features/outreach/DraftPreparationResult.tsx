import { Link } from "react-router-dom";
import { useLang } from "@/i18n/language";
import { generationText, tr, words } from "@/i18n/outreach";
import { draftPreparationText as text } from "@/i18n/draft-preparation";
import type { DraftPreparation } from "./draft-preparation";
import "./draft-preparation.css";

export function DraftPreparationResult({ result, eventId, templateName }: {
  result: DraftPreparation; eventId: string; templateName: string;
}) {
  useLang();
  const complete = result.phase === "complete", stopped = result.phase === "stopped";
  const prepared = result.steps.reduce((sum, step) => sum + (step.receipt?.prepared ?? 0), 0);
  return <section className="card draft-preparation" aria-label={text("title")}>
    <header><h2>{text("title")}</h2><span>{templateName}</span></header>
    <p role="status" aria-live="polite">
      {stopped ? text("stopped") : complete ? text(prepared ? "complete" : "zero") : text(result.phase === "campaign" ? "campaign" : "running")}
    </p>
    {stopped && result.steps.every(step => step.state === "waiting") && <p>{text("campaignUnconfirmed")}</p>}
    <ul className="draft-preparation-steps">
      {result.steps.map(step => <li key={step.channel} data-state={step.state}>
        <b>{step.channel === "email" ? words("word5") : step.channel === "whatsapp" ? "WhatsApp" : tr("text146")}</b>
        <span className="draft-preparation-state">{text(step.state)}</span>
        <span className="draft-preparation-detail">
          {step.receipt && <>{text("counts", step.receipt.prepared, step.receipt.skipped.length)}
            {step.receipt.skipped.length > 0 && <small>{[...new Set(step.receipt.skipped.map(skip =>
              skip.reason_code === "daily_cap" ? generationText("dailyCap") : skip.reason_code === "not_reviewed" ? generationText("notReviewed") : skip.reason,
            ).filter(Boolean))].join("; ")}</small>}
          </>}
          {step.state === "unconfirmed" && text("unknownHelp")}
          {step.state === "rejected" && text("audience")}
        </span>
      </li>)}
    </ul>
    <div className="draft-preparation-footer">
      <p className="msg-hint">{text("scope")}</p>
      {(stopped || complete) && <Link className="btn" to={`/rfx/${eventId}/delivery`}>{text("queue")}</Link>}
    </div>
  </section>;
}
