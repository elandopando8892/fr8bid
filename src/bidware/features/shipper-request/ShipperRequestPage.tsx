import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { confirmAsync } from "@/components/confirm";
import { ErrorBanner, Spinner } from "@/components/ui";
import { COPY, initialLang, rememberLang, type Copy } from "./request.copy";
import {
  draftFromResponse,
  draftProblems,
  filledLanes,
  requestKind,
  type Lang,
  type RequestDraft,
  type RequestKind,
  type RequestResponse,
} from "./request.model";
import { explainRequestError, isAlreadySubmitted, loadRequest, saveRequest, submitRequest } from "./request.service";
import { RequestForm, routeText, unitText } from "./RequestForm";
import { useAutosave, useSecondsSince, type SaveState } from "./useAutosave";

const dateShort = (value: string | null | undefined, lang: Lang) => {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { day: "2-digit", month: "short", year: "numeric" });
};

function SaveStatus({ state, copy, lang, onRetry }: { state: SaveState; copy: Copy; lang: Lang; onRetry: () => void }) {
  const seconds = useSecondsSince(state.savedAt);
  if (state.status === "saving") return <span className="sr-save">{copy.saving}</span>;
  if (state.status === "error") {
    return (
      <span className="sr-save bad" title={state.error ? explainRequestError(state.error, lang) : undefined}>
        {copy.saveFailed} ·{" "}
        <button type="button" className="sr-link" onClick={onRetry}>
          {copy.retry}
        </button>
      </span>
    );
  }
  if (state.status === "saved" && seconds !== null) return <span className="sr-save ok">✓ {copy.savedAgo(seconds)}</span>;
  return null;
}

function Shell({
  lang,
  setLang,
  title,
  sub,
  meta,
  aside,
  children,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  title: string;
  sub?: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const copy = COPY[lang];
  return (
    <div className="sr-page">
      <div className="sr-bar">
        <span className="sr-mark" aria-hidden="true" />
        <strong>BIDWARE</strong>
        <span className="spacer" />
        <span className="sr-bar-note">{copy.barNote}</span>
        <div className="profile-lang sr-lang" role="group" aria-label="Idioma / Language">
          {(["es", "en"] as Lang[]).map((code) => (
            <button key={code} type="button" className={lang === code ? "active" : ""} onClick={() => setLang(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="sr-body">
        <div className="sr-head">
          <div>
            <h1>{title}</h1>
            {sub && <p className="sub">{sub}</p>}
            {meta && <p className="sr-meta">{meta}</p>}
          </div>
          <span className="spacer" />
          {aside}
        </div>
        {children}
      </div>
    </div>
  );
}

function Thanks({ kind, draft, copy, lang, submittedAt, readOnly }: {
  kind: RequestKind;
  draft: RequestDraft;
  copy: Copy;
  lang: Lang;
  submittedAt: string | null;
  readOnly: boolean;
}) {
  const lanes = filledLanes(draft);
  return (
    <section className="card sr-thanks">
      <span className="sr-thanks-mark" aria-hidden="true">
        ✓
      </span>
      <h2>{readOnly ? copy.readOnly : copy.thanksTitle}</h2>
      {!readOnly && <p>{kind === "spot" ? copy.thanksSpot : copy.thanksRfq}</p>}
      {submittedAt && (
        <p className="sr-muted mono">
          {copy.sentOn} {dateShort(submittedAt, lang)}
        </p>
      )}
      <ul className="sr-review-lanes">
        {lanes.map((lane, index) => (
          <li key={lane.key}>
            <span className="mono">L{index + 1}</span> {routeText(lane)} · {unitText(lane, lang) || "—"}
            {lane.loads && <> · {copy.loadCount(lane.loads, kind === "spot")}</>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The shipper's link: `/customer-rfi.html?token=…` (the path rfx-bid-api's
 * link builder composes) or `/rfi/:token`. One page for every request; the
 * project's type (spot or not) only changes the lanes' volume columns.
 */
export function ShipperRequestPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const token = (search.get("token") || params.token || "").trim();
  return <ShipperRequestContent key={token} token={token} />;
}

function ShipperRequestContent({ token }: { token: string }) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const [lang, setLangState] = useState<Lang>(initialLang);
  const copy = COPY[lang];
  const setLang = (next: Lang) => {
    setLangState(next);
    rememberLang(next);
  };

  const [response, setResponse] = useState<RequestResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [version, setVersion] = useState(0);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [alreadySent, setAlreadySent] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  // The response as loaded: what this form doesn't edit is sent back from it.
  const baseRef = useRef<Record<string, unknown>>({});

  const load = useCallback(async () => {
    const res = await loadRequest(token);
    const saved = res.submission?.response;
    baseRef.current = saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
    setResponse(res);
    setDraft(draftFromResponse(requestKind(res.project.opportunity_type), res));
    if (res.submission?.status === "submitted") {
      setAlreadySent(true);
      setSubmittedAt(res.submission.submitted_at);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    load().catch((e) => live && setLoadError((e as Error).message));
    return () => {
      live = false;
    };
  }, [token, load]);

  const kind: RequestKind = requestKind(response?.project.opportunity_type);
  const done = alreadySent || Boolean(submittedAt);

  useEffect(() => {
    document.title = `Bidware · ${copy.pageTitle}`;
  }, [copy]);

  const autosave = useAutosave(
    () => (draftRef.current ? saveRequest(token, draftRef.current, baseRef.current) : Promise.resolve()),
    version,
    Boolean(draft) && !done && !sending,
  );

  // Sent from another tab (or a lost reply): show what was sent instead of failing saves.
  const reloadedAfterSent = useRef(false);
  const closeSaving = autosave.close;
  useEffect(() => {
    if (reloadedAfterSent.current || !autosave.state.error || !isAlreadySubmitted(autosave.state.error)) return;
    reloadedAfterSent.current = true;
    void closeSaving()
      .then(load)
      .catch(() => undefined);
  }, [autosave.state.error, closeSaving, load]);

  const update = useCallback((recipe: (draft: RequestDraft) => RequestDraft) => {
    setDraft((current) => (current ? recipe(current) : current));
    setVersion((v) => v + 1);
    setError(null);
  }, []);

  async function submit() {
    const current = draftRef.current;
    if (!current) return;
    const problems = draftProblems(current);
    if (problems.noLanes || problems.lanes.length) {
      setShowProblems(true);
      setError(problems.noLanes ? copy.noLanes : copy.fixLanes);
      return;
    }
    const lanes = filledLanes(current).length;
    const confirmed = await confirmAsync(copy.confirm(lanes), {
      ok: copy.confirmOk,
      cancel: copy.confirmCancel,
    });
    if (!confirmed) return;
    if (!active.current) return;
    setSending(true);
    setError(null);
    try {
      // Pending edits land first, then no save may start until this settles:
      // a save that raced the submit could reopen the request as a draft.
      await autosave.flush();
      await autosave.close();
      if (!active.current) return;
      await submitRequest(token, draftRef.current ?? current, baseRef.current, () => active.current);
      setSubmittedAt(new Date().toISOString());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const message = (e as Error).message;
      if (isAlreadySubmitted(message)) {
        await load().catch(() => undefined);
        return;
      }
      autosave.reopen();
      setError(explainRequestError(message, lang));
    } finally {
      setSending(false);
    }
  }

  if (!token) {
    return (
      <Shell lang={lang} setLang={setLang} title={copy.missingTitle} sub={copy.missingBody}>
        <span />
      </Shell>
    );
  }
  if (loadError) {
    return (
      <Shell lang={lang} setLang={setLang} title={copy.loadError}>
        <ErrorBanner message={explainRequestError(loadError, lang)} />
      </Shell>
    );
  }
  if (!response || !draft) {
    return (
      <div className="center-screen">
        <Spinner label={copy.loading} />
      </div>
    );
  }

  const project = response.project;
  const customer = project.customer_name || draft.contact.company || "";
  const due = project.due_date ? `${copy.due}: ${dateShort(project.due_date, lang)}` : "";
  const formProps = { token, draft, type: project.opportunity_type, lang, copy, showProblems, update, onSubmit: submit, sending, error };

  return (
    <Shell
      lang={lang}
      setLang={setLang}
      title={done ? customer || project.title || copy.pageTitle : copy.pageTitle}
      sub={done ? project.title || "" : copy.pageSub}
      meta={done ? null : [customer, due, copy.autosaves].filter(Boolean).join(" · ")}
      aside={!done && !sending && <SaveStatus state={autosave.state} copy={copy} lang={lang} onRetry={() => void autosave.retry()} />}
    >
      {done ? (
        <Thanks kind={kind} draft={draft} copy={copy} lang={lang} submittedAt={submittedAt} readOnly={alreadySent} />
      ) : (
        // Nothing can be edited while the request is on its way.
        <fieldset className="sr-fieldset" disabled={sending}>
          <RequestForm {...formProps} />
        </fieldset>
      )}
    </Shell>
  );
}
