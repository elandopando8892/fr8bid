type Message = Record<string, unknown>;
const object = (value: unknown): Message => value && typeof value === "object" && !Array.isArray(value) ? value as Message : {};
export type DiagnosisKind = "none" | "accepted" | "manual" | "recorded" | "uncertain" | "unavailable" | "quota" | "authorization" | "precondition" | "failure";
export function deliveryDiagnosis(message: Message) {
  const issue = object(message.delivery_issue), result = object(message.send_result);
  const error = typeof issue.error === "string" ? issue.error : typeof message.delivery_error === "string" ? message.delivery_error : "";
  const codes = Array.isArray(issue.reason_codes) ? issue.reason_codes.filter((v): v is string => typeof v === "string") : [];
  const http = Number.isInteger(issue.http_status) ? issue.http_status as number : null;
  const signal = `${codes.join(" ")} ${error}`;
  let kind: DiagnosisKind = "none";
  if (message.channel === "email") {
    if (message.provider_message_id) kind = "accepted";
    else if (message.manual_sent_at || message.status === "manual_sent") kind = "manual";
    else if (["delivery_unknown", "sending"].includes(String(message.status)) || issue.status === "delivery_unknown") kind = "uncertain";
    else if (message.sent_at || ["sent", "delivered", "read"].includes(String(message.status))) kind = "recorded";
    else if (message.delivery_issue_unavailable) kind = "unavailable";
    else if (http === 429 || /quota|rateLimitExceeded|dailyLimitExceeded|RESOURCE_EXHAUSTED|rate limit|daily limit/i.test(signal)) kind = "quota";
    else if (http === 401 || /authError|domainPolicy|invalid credentials|insufficientPermissions|UNAUTHENTICATED|PERMISSION_DENIED/i.test(signal)) kind = "authorization";
    else if (/precondition/i.test(signal)) kind = "precondition";
    else if (error || codes.length > 0 || (http !== null && http >= 400 && http <= 599) || message.status === "failed" || issue.status === "failed") kind = "failure";
  }
  return { kind, error, codes, http, occurredAt: typeof issue.occurred_at === "string" ? issue.occurred_at : null,
    historical: Boolean(issue.occurred_at) || result.stage === "manual_status", unavailable: Boolean(message.delivery_issue_unavailable) };
}
