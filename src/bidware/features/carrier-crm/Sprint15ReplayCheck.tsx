import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { ErrorBanner, InfoBanner } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { callRatewareApi } from "@/lib/api-client";
import { translator, useLang } from "@/i18n/language";
import type { Vendor } from "@/types/domain";

// Temporary acceptance surface, opened explicitly with ?comprobar=s15.
// Fixed synthetic case only; no arbitrary action, payload, token or new UUID.
const CASE = {
  id: "349691cf-f8ae-4f5b-aa36-e4b62b7228b1",
  bounced_email: "s15-bad@example.test",
  replacement_email: "s15-good@example.test",
  operation_id: "23c0d300-9c31-47e8-8f08-b066bc35dcab",
};
const RESOLVED_AT = "2026-10-03T04:20:12.228177+00:00";
const tr = translator({
  title: { es: "Comprobación controlada S15", en: "Controlled S15 check" },
  explanation: { es: "Comprueba el reemplazo ya resuelto de bad a good en example.test. Repite su misma solicitud y compara el contacto antes y después.", en: "Checks the already resolved replacement from bad to good at example.test. Replays the same request and compares the contact before and after." },
  check: { es: "Comprobar la resolución existente", en: "Check the existing resolution" },
  working: { es: "Comprobando…", en: "Checking…" },
  passed: { es: "Reintento reconocido; contacto y fecha de resolución sin cambios.", en: "Replay recognized; contact and resolution date unchanged." },
  role: { es: "Se requiere una sesión Admin u Operador verificada.", en: "A verified Admin or Operator session is required." },
  account: { es: "La cuenta cambió. Se detuvo la comprobación.", en: "The account changed. The check was stopped." },
  state: { es: "El caso no conserva el estado controlado esperado. No se repitió el reemplazo.", en: "The case no longer has the expected controlled state. The replacement was not replayed." },
  protocol: { es: "El servidor no confirmó el mismo reintento. No se realizará otro intento automáticamente.", en: "The server did not confirm the same replay. No further attempt will run automatically." },
  changed: { es: "La lectura posterior difiere del estado inicial. Requiere revisión.", en: "The follow-up read differs from the initial state. Review is required." },
});

function controlledState(row: Vendor) {
  const profile = row.profile_data as { bounced_emails?: unknown } | undefined;
  const bounces = Array.isArray(profile?.bounced_emails) ? profile.bounced_emails : [];
  const matches = bounces.filter((b) => b?.email === CASE.bounced_email);
  return row.id === CASE.id && row.primary_email === CASE.replacement_email && matches.length === 1 &&
    matches[0].resolved_at === RESOLVED_AT && matches[0].replacement_email === CASE.replacement_email;
}
function fingerprint(row: Vendor) {
  return JSON.stringify([row.id, row.primary_email, row.secondary_emails, row.tags, row.profile_data, row.updated_at]);
}
async function readCase() {
  const result = await callRatewareApi<{ rows?: Vendor[] }>("list_vendors", { ids: [CASE.id], lightweight: false, limit: 1 });
  return result.rows?.length === 1 ? result.rows[0] : null;
}

export function Sprint15ReplayCheck() {
  useLang();
  const { user, role, roleLoaded, can } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"passed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setResult(null); setError(null); setBusy(false);
  }, [user?.id, role, roleLoaded]);

  async function check() {
    if (busy || result || !roleLoaded || !can("operate") || !user) return;
    const current = revision.current;
    const actorId = user.id;
    const sameActor = async () => {
      if (current !== revision.current || (await getUser())?.id !== actorId) throw new Error(tr("account"));
    };
    setBusy(true); setError(null);
    try {
      await sameActor();
      const before = await readCase();
      if (!before || !controlledState(before)) throw new Error(tr("state"));
      await sameActor();
      const response = await callRatewareApi<{ row?: Vendor; replayed?: boolean; operation_id?: string; bounced_email?: string; replacement_email?: string }>("replace_bounced_vendor_email", CASE);
      if (response.replayed !== true || response.operation_id !== CASE.operation_id || response.bounced_email !== CASE.bounced_email ||
          response.replacement_email !== CASE.replacement_email || !response.row || fingerprint(response.row) !== fingerprint(before)) {
        throw new Error(tr("protocol"));
      }
      await sameActor();
      const after = await readCase();
      if (!after || fingerprint(after) !== fingerprint(before)) throw new Error(tr("changed"));
      if (current === revision.current) setResult("passed");
    } catch (e) {
      if (current === revision.current) setError((e as Error).message);
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  return <section className="card" aria-label={tr("title")}>
    <h2>{tr("title")}</h2>
    <p>{tr("explanation")}</p>
    <button disabled={busy || !!result || !roleLoaded || !can("operate")} onClick={check}>{busy ? tr("working") : tr("check")}</button>
    {!roleLoaded || !can("operate") ? <p>{tr("role")}</p> : null}
    {error && <ErrorBanner message={error} />}
    {result && <InfoBanner>{tr("passed")}</InfoBanner>}
  </section>;
}
