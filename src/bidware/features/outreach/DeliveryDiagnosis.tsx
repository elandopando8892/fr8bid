import { Link } from "react-router-dom";
import { diagnosisText as t } from "@/i18n/delivery-diagnosis";
import { useLang, locale } from "@/i18n/language";
import { deliveryDiagnosis } from "./delivery-diagnosis";
import type { OutreachMessage } from "./outreach.service";
export function DeliveryDiagnosis({ message }: { message: OutreachMessage }) {
  useLang();
  const d = deliveryDiagnosis(message);
  if (d.kind === "none") return null;
  const time = d.occurredAt ? Date.parse(d.occurredAt) : NaN;
  return <section aria-label={t("title")} style={{ border: "1px solid var(--line)", padding: 12, margin: "12px 0", overflowWrap: "anywhere" }}>
    <h3 style={{ marginTop: 0 }}>{t("title")}</h3><p>{t(d.kind)}</p>
    {d.historical && <p className="cell-sub">{t("historical")}</p>}
    <p className="cell-sub"><strong>{t("step_label")}: </strong>{t(`step_${d.kind}`)}
      {(d.kind === "authorization" || d.kind === "precondition") && <> <Link to="/integraciones">{t("link_integrations")}</Link></>}</p>
    {(d.error || d.http !== null || d.codes.length > 0 || d.occurredAt) && <>{d.error && <p><strong>{t("error")}: </strong>{d.error}</p>}<dl>
      <dt>{t("date")}</dt><dd>{Number.isFinite(time) ? new Date(time).toLocaleString(locale()) : t("missing")}</dd>
      <dt>{t("http")}</dt><dd>{d.http ?? t("missing")}</dd>
      <dt>{t("reasons")}</dt><dd>{d.codes.length ? d.codes.join(", ") : t("missing")}</dd>
    </dl></>}
  </section>;
}
