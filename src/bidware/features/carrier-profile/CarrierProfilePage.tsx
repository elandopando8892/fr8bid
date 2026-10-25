import { COPY } from "@/i18n/carrier-profile";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getProfile,
  submitProfile,
  addTicketFollowup,
  draftFrom,
  fieldValue,
  progressOf,
  buildSubmit,
  explainProfileError,
  NEVER_BLANK,
  type ProfileDraft,
  type ProfileResponse,
  type SupportTicket,
} from "./carrierProfile.service";
import { ALL_STEPS, COMPANY_STEP, OPTION_LABEL, type FieldSpec, type Lang, type StepSpec } from "./profile.schema";
import { Spinner, ErrorBanner, InfoBanner, Pill } from "@/components/ui";

/**
 * Carrier profile, reached from the "keep your carrier profile up to date"
 * link in every invitation. The backend composes it as
 * `/carrier-profile.html?token=…` on Bidware's origin, so Bidware must answer
 * that exact path — before this page it fell through to the login screen.
 */


const LANG_KEY = "bidware_carrier_profile_lang";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialLang(param: string | null): Lang {
  if (param?.toLowerCase().startsWith("en")) return "en";
  if (param?.toLowerCase().startsWith("es")) return "es";
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    /* storage can be blocked; fall through */
  }
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

function formatDate(value: string | null | undefined, lang: Lang) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export function CarrierProfilePage() {
  const [search] = useSearchParams();
  const token = search.get("token") || "";
  const [lang, setLang] = useState<Lang>(() => initialLang(search.get("lang")));
  const t = COPY[lang];

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [loadError, setLoadError] = useState<string | null>(null);

  const [original, setOriginal] = useState<ProfileDraft | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitter, setSubmitter] = useState({ name: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${COPY[lang].eyebrow} · Marksman`;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    getProfile(token)
      .then((res) => {
        if (!alive) return;
        setData(res);
        const d = draftFrom(res.vendor);
        setOriginal(d);
        setDraft(d);
        setTickets(res.support_tickets ?? []);
      })
      .catch((e) => alive && setLoadError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = useMemo(
    () => (original && draft ? buildSubmit(original, draft, lang) : null),
    [original, draft, lang],
  );
  const dirty = (submit?.changed ?? 0) > 0;

  // Leaving with unsaved answers loses them; the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Blank name/email would erase them from the carrier record; bad email is refused. */
  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!draft || !original) return errors;
    for (const key of NEVER_BLANK) {
      if (!draft.vendor[key]?.trim() && original.vendor[key]?.trim()) errors[key] = t.required;
    }
    const email = draft.vendor.primary_email?.trim();
    if (email && !EMAIL_RE.test(email)) errors.primary_email = t.badEmail;
    if (submitter.email.trim() && !EMAIL_RE.test(submitter.email.trim())) errors.submitter_email = t.badEmail;
    return errors;
  }, [draft, original, submitter.email, t]);

  if (!token) {
    return (
      <Shell lang={lang} setLang={setLang} title={t.missingTokenTitle} sub={t.missingToken} />
    );
  }
  if (loading) {
    return (
      <div className="center-screen">
        <Spinner label={t.loading} />
      </div>
    );
  }
  if (loadError || !data || !draft || !original) {
    return (
      <Shell lang={lang} setLang={setLang} title={COPY[lang].eyebrow}>
        <ErrorBanner message={explainProfileError(loadError || "", lang)} />
      </Shell>
    );
  }

  const progress = progressOf(draft);
  const step = ALL_STEPS[stepIndex];
  const vendorName = original.vendor.vendor_name || (lang === "es" ? "Tu empresa" : "Your company");

  function setField(stepKey: string, field: FieldSpec, value: string | string[]) {
    setNotice(null);
    setSaveError(null);
    setDraft((prev) => {
      if (!prev) return prev;
      if (stepKey === COMPANY_STEP.key) {
        return { ...prev, vendor: { ...prev.vendor, [field.key]: value as string } };
      }
      return {
        ...prev,
        profile: { ...prev.profile, [stepKey]: { ...prev.profile[stepKey], [field.key]: value } },
      };
    });
  }

  async function save() {
    if (!submit || !dirty || Object.keys(fieldErrors).length || saving) return;
    setSaving(true);
    setNotice(null);
    setSaveError(null);
    try {
      const res = await submitProfile(token, {
        vendor: submit.vendor,
        profile_data: submit.profile_data,
        submitted_contact: { name: submitter.name.trim(), email: submitter.email.trim() },
      });
      const next = draftFrom(res.vendor);
      setOriginal(next);
      setDraft(next);
      if (res.support_tickets) setTickets(res.support_tickets);
      setNotice(t.saved);
    } catch (e) {
      setSaveError(explainProfileError((e as Error).message, lang));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell
      lang={lang}
      setLang={setLang}
      title={vendorName}
      sub={t.intro}
      aside={
        data.request?.expires_at ? (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            {t.expires} {formatDate(data.request.expires_at, lang)}
          </span>
        ) : null
      }
    >
      {notice && <InfoBanner>{notice}</InfoBanner>}
      {saveError && <ErrorBanner message={saveError} />}

      <div className="profile-layout">
        <aside className="profile-aside">
          <div className="card">
            <div className="cell-sub" style={{ marginBottom: 6 }}>
              {t.progress}
            </div>
            <div className="row" style={{ alignItems: "baseline" }}>
              <strong style={{ fontSize: 22 }}>
                {progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%
              </strong>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {progress.done} / {progress.total} {t.recommended}
              </span>
            </div>
            <div className="profile-meter">
              <div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>

          <nav className="profile-steps" aria-label={t.progress}>
            {ALL_STEPS.map((s, i) => {
              const p = progress.perStep[i];
              const complete = p.total ? p.done === p.total : p.filled > 0;
              return (
                <button
                  key={s.key}
                  type="button"
                  className={i === stepIndex ? "active" : ""}
                  aria-current={i === stepIndex ? "step" : undefined}
                  onClick={() => setStepIndex(i)}
                >
                  <span className={`profile-step-num${complete ? " done" : ""}`}>{complete ? "✓" : i + 1}</span>
                  <span className="profile-step-label">{s.label[lang]}</span>
                  <span className="profile-step-count">
                    {p.total ? `${p.done}/${p.total}` : `${p.filled}/${p.fields}`}
                  </span>
                </button>
              );
            })}
          </nav>

          <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "4px 2px 0" }}>{t.privacy}</p>
        </aside>

        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <StepCard
            step={step}
            lang={lang}
            draft={draft}
            errors={fieldErrors}
            onChange={(field, value) => setField(step.key, field, value)}
          />

          <div className="row">
            <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
              ← {t.back}
            </button>
            <div className="spacer" />
            {stepIndex < ALL_STEPS.length - 1 && (
              <button type="button" onClick={() => setStepIndex((i) => i + 1)}>
                {t.next} →
              </button>
            )}
          </div>

          <div className="card profile-save">
            <div className="cell-title" style={{ marginBottom: 10 }}>
              {t.whoSaves}
            </div>
            <div className="profile-grid">
              <label className="field">
                <span>{t.yourName}</span>
                <input
                  value={submitter.name}
                  onChange={(e) => setSubmitter((s) => ({ ...s, name: e.target.value }))}
                  autoComplete="name"
                />
              </label>
              <label className="field">
                <span>{t.yourEmail}</span>
                <input
                  type="email"
                  value={submitter.email}
                  onChange={(e) => setSubmitter((s) => ({ ...s, email: e.target.value }))}
                  autoComplete="email"
                />
                {fieldErrors.submitter_email && <FieldError text={fieldErrors.submitter_email} />}
              </label>
            </div>
            <div className="row">
              <span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1 }}>
                {dirty ? t.pending(submit!.changed) : t.nothingToSave}
              </span>
              <button
                type="button"
                className="primary"
                disabled={!dirty || saving || Object.keys(fieldErrors).length > 0}
                onClick={save}
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </div>

          <SupportLog
            token={token}
            lang={lang}
            tickets={tickets}
            onTickets={setTickets}
            onNotice={setNotice}
            onError={setSaveError}
          />
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  lang,
  setLang,
  title,
  sub,
  aside,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  title: string;
  sub?: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 60px" }}>
      <div className="brand" style={{ paddingLeft: 0 }}>
        <span className="dot" /> Marksman
      </div>
      <div className="public-head">
        <div>
          <p className="crumb">{COPY[lang].eyebrow}</p>
          <h1>{title}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        <div className="spacer" />
        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          <div className="profile-lang" role="group" aria-label="Idioma / Language">
            {(["es", "en"] as Lang[]).map((l) => (
              <button key={l} type="button" className={lang === l ? "active" : ""} onClick={() => setLang(l)}>
                {l === "es" ? COPY[lang].spanishLanguage : "English"}
              </button>
            ))}
          </div>
          {aside}
        </div>
      </div>
      <div style={{ display: "grid", gap: 14 }}>{children}</div>
    </div>
  );
}

function FieldError({ text }: { text: string }) {
  return <span style={{ color: "var(--red)", fontSize: 11.5, fontWeight: 500 }}>{text}</span>;
}

function optionLabel(value: string, lang: Lang) {
  return OPTION_LABEL[value]?.[lang] ?? value;
}

function StepCard({
  step,
  lang,
  draft,
  errors,
  onChange,
}: {
  step: StepSpec;
  lang: Lang;
  draft: ProfileDraft;
  errors: Record<string, string>;
  onChange: (field: FieldSpec, value: string | string[]) => void;
}) {
  const t = COPY[lang];
  return (
    <section className="card">
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>{step.label[lang]}</h2>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>{step.help[lang]}</p>
      </div>
      <div className="profile-grid">
        {step.fields.map((field) => {
          const value = fieldValue(draft, step.key, field);
          const wide = field.wide || field.type === "checks";
          const error = step.key === COMPANY_STEP.key ? errors[field.key] : undefined;
          const label = (
            <span>
              {field.label[lang]}
              {field.recommended && (
                <span className="profile-rec" title={t.recommendedTag}>
                  {" "}
                  · {t.recommendedTag}
                </span>
              )}
            </span>
          );

          if (field.type === "checks") {
            const selected = value as string[];
            // Stored answers outside today's list still show, so nothing is silently dropped.
            const options = [...field.options!, ...selected.filter((v) => !field.options!.includes(v))];
            return (
              <fieldset key={field.key} className="field profile-wide" style={{ border: "none", padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 11.5, fontWeight: 600, color: "var(--grey)", padding: 0, marginBottom: 6 }}>
                  {field.label[lang]}
                  {field.recommended && <span className="profile-rec"> · {t.recommendedTag}</span>}
                  <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                    {" "}
                    ({selected.length} {t.selected})
                  </span>
                </legend>
                <div className="profile-checks">
                  {options.map((opt) => {
                    const on = selected.includes(opt);
                    return (
                      <label key={opt} className={`profile-check${on ? " on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            onChange(field, on ? selected.filter((v) => v !== opt) : [...selected, opt])
                          }
                        />
                        <span>{optionLabel(opt, lang)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          }

          if (field.type === "select") {
            const current = value as string;
            const options = current && !field.options!.includes(current) ? [...field.options!, current] : field.options!;
            return (
              <label key={field.key} className={`field${wide ? " profile-wide" : ""}`}>
                {label}
                <select value={current} onChange={(e) => onChange(field, e.target.value)}>
                  <option value="">{t.choose}</option>
                  {options.map((opt) => (
                    <option key={opt} value={opt}>
                      {optionLabel(opt, lang)}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          return (
            <label key={field.key} className={`field${wide ? " profile-wide" : ""}`}>
              {label}
              {field.type === "textarea" ? (
                <textarea rows={3} value={value as string} onChange={(e) => onChange(field, e.target.value)} />
              ) : (
                <input
                  type={field.type === "email" ? "email" : "text"}
                  value={value as string}
                  onChange={(e) => onChange(field, e.target.value)}
                  aria-invalid={Boolean(error)}
                />
              )}
              {error && <FieldError text={error} />}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function SupportLog({
  token,
  lang,
  tickets,
  onTickets,
  onNotice,
  onError,
}: {
  token: string;
  lang: Lang;
  tickets: SupportTicket[];
  onTickets: (rows: SupportTicket[]) => void;
  onNotice: (m: string | null) => void;
  onError: (m: string | null) => void;
}) {
  const t = COPY[lang];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function send(ticketId: string) {
    const message = (drafts[ticketId] ?? "").trim();
    if (!message || busy) return;
    setBusy(ticketId);
    onNotice(null);
    onError(null);
    try {
      const res = await addTicketFollowup(token, ticketId, message);
      if (res.support_tickets) onTickets(res.support_tickets);
      setDrafts((d) => ({ ...d, [ticketId]: "" }));
      onNotice(t.followupSaved);
    } catch (e) {
      onError(explainProfileError((e as Error).message, lang));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 14, margin: "0 0 2px" }}>{t.support}</h2>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>{t.supportHelp}</p>
        </div>
        <Pill>{tickets.length}</Pill>
      </div>
      {tickets.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>{t.noTickets}</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {tickets.slice(0, 8).map((row) => {
            const status = row.support_status || "open";
            return (
              <article key={row.id} className="profile-ticket">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div className="cell-title">{row.question || row.subject || "—"}</div>
                    <div className="cell-sub">
                      {[row.route, formatDate(row.occurred_at, lang)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Pill tone={status === "resolved" ? "green" : status === "archived" ? "" : "amber"}>
                    {t.status[status] ?? status}
                  </Pill>
                </div>
                {row.answer && (
                  <p style={{ fontSize: 12, margin: "8px 0 0" }}>
                    <b>{t.answer}:</b> {row.answer}
                  </p>
                )}
                {row.latest_followup && (
                  <p style={{ fontSize: 12, margin: "6px 0 0", color: "var(--grey)" }}>
                    <b>{t.lastFollowup}:</b> {row.latest_followup}
                  </p>
                )}
                <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
                  <textarea
                    rows={2}
                    style={{ flex: 1 }}
                    placeholder={t.followupPlaceholder}
                    value={drafts[row.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    disabled={!(drafts[row.id] ?? "").trim() || busy === row.id}
                    onClick={() => send(row.id)}
                  >
                    {t.followup}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

