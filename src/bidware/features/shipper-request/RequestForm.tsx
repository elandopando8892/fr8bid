import { useEffect, useRef, useState } from "react";
import { ErrorBanner, InfoBanner } from "@/components/ui";
import { catalogLabel, EQUIPMENT_TYPES, TRUCK_TYPES } from "./catalog";
import { downloadTemplate, importLanes } from "./excel";
import { CatalogSelect, LaneForm } from "./LaneFields";
import type { Copy } from "./request.copy";
import {
  answerKey,
  copyLane,
  emptyLane,
  filledLanes,
  isAnswered,
  laneProblems,
  placeText,
  requestSegments,
  withDefaults,
  type Answer,
  type Contact,
  type Lang,
  type LaneDraft,
  type RequestDraft,
} from "./request.model";
import {
  GENERAL_GROUPS,
  RESPONSE_CATALOGS,
  SEGMENTS,
  responseLabel,
  segmentKeyRows,
  segmentLabel,
  segmentModelRows,
  segmentMoreRows,
  type ResponseCatalog,
  type RubricCategory,
  type RubricRow,
} from "./rubric";

export interface FormProps {
  token: string;
  draft: RequestDraft;
  /** The project's opportunity type: the team sets it, the shipper sees it. */
  type: string | null;
  lang: Lang;
  copy: Copy;
  showProblems: boolean;
  update: (recipe: (draft: RequestDraft) => RequestDraft) => void;
  onSubmit: () => void;
  sending: boolean;
  error: string | null;
}

export const routeText = (lane: LaneDraft) => {
  const from = placeText(lane.origin);
  const to = placeText(lane.destination);
  return from || to ? `${from || "—"} → ${to || "—"}` : "";
};

/** "Tractocamión · Caja seca": the lane's unit as the template names it. */
export const unitText = (lane: LaneDraft, lang: Lang) =>
  [lane.truck && catalogLabel(TRUCK_TYPES, lane.truck, lang), lane.equipment && catalogLabel(EQUIPMENT_TYPES, lane.equipment, lang)]
    .filter(Boolean)
    .join(" · ");

/** "Live/Drop-Off": how the lane loads and unloads, in the template's short words. */
const handlingText = (lane: LaneDraft) =>
  [lane.origin_load_type, lane.destination_unload_type]
    .map((value) => value.split(/\s/)[0])
    .filter(Boolean)
    .join("/");

// ------------------------------------------------------------- the request

/** The request's type, as the team opened it; the shipper can't change it here. */
function RequestType({ type, copy }: { type: string | null; copy: Copy }) {
  const current = String(type || "spot").toLowerCase();
  // Read-only: a plain line, not a control that looks clickable.
  return (
    <p className="sr-type">
      <span className="sr-type-label">{copy.requestType}:</span> <b>{copy.types[current] ?? current}</b>
      <small> · {copy.requestTypeHint}</small>
    </p>
  );
}

/** Several operating segments in the space of one select. */
function SegmentPicker({ value, lang, copy, onChange }: { value: string[]; lang: Lang; copy: Copy; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((entry) => entry !== key) : [...value, key]);
  const shown = value.map((key) => segmentLabel(key, lang)).join(", ");
  return (
    <div ref={box} className="sr-multi" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button type="button" className="sr-multi-button" aria-haspopup="listbox" aria-expanded={open} title={shown || undefined} onClick={() => setOpen(!open)}>
        <span className={shown ? undefined : "placeholder"}>{shown || copy.choose}</span>
        <i aria-hidden="true">▾</i>
      </button>
      {open && (
        <div className="sr-multi-list" role="listbox" aria-multiselectable="true" aria-label={copy.segments}>
          {SEGMENTS.map((segment) => (
            <label key={segment.value} className="sr-check">
              <input type="checkbox" checked={value.includes(segment.value)} onChange={() => toggle(segment.value)} />
              <span>{segment[lang]}</span>
            </label>
          ))}
          <small className="sr-hint">{copy.segmentsHint}</small>
        </div>
      )}
    </div>
  );
}

function Basics({ draft, type, lang, copy, update }: FormProps) {
  const setContact = (patch: Partial<Contact>) => update((d) => ({ ...d, contact: { ...d.contact, ...patch } }));
  return (
    <section className="sr-card sr-basics">
      <RequestType type={type} copy={copy} />
      <div className="sr-grid3">
        <label className="field">
          <span className="sr-field-head">{copy.mainCommodity}</span>
          <input value={draft.commodity} placeholder={copy.mainCommodityHint} onChange={(e) => update((d) => ({ ...d, commodity: e.target.value }))} />
        </label>
        <label className="field">
          <span className="sr-field-head">{copy.standardEquipment}</span>
          <CatalogSelect list={EQUIPMENT_TYPES} value={draft.equipment} lang={lang} empty={copy.choose} onChange={(equipment) => update((d) => ({ ...d, equipment }))} />
        </label>
        <div className="field">
          <span className="sr-field-head">{copy.segments}</span>
          <SegmentPicker value={draft.segments} lang={lang} copy={copy} onChange={(segments) => update((d) => ({ ...d, segments }))} />
        </div>
      </div>
      <h4 className="sr-sec-title">{copy.contact}</h4>
      <div className="sr-grid5">
        <label className="field">
          <span className="sr-field-head">{copy.company}</span>
          <input value={draft.contact.company} autoComplete="organization" onChange={(e) => setContact({ company: e.target.value })} />
        </label>
        <label className="field">
          <span className="sr-field-head">{copy.yourName}</span>
          <input value={draft.contact.name} autoComplete="name" onChange={(e) => setContact({ name: e.target.value })} />
        </label>
        <label className="field" title={copy.emailHint}>
          <span className="sr-field-head">{copy.email}</span>
          <input type="email" value={draft.contact.email} autoComplete="email" placeholder="name@company.com" onChange={(e) => setContact({ email: e.target.value })} />
        </label>
        <label className="field">
          <span className="sr-field-head">{copy.phone}</span>
          <input type="tel" value={draft.contact.phone} autoComplete="tel" onChange={(e) => setContact({ phone: e.target.value })} />
        </label>
        <label className="field">
          <span className="sr-field-head">{copy.currency}</span>
          <select value={draft.currency} onChange={(e) => update((d) => ({ ...d, currency: e.target.value as RequestDraft["currency"] }))}>
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
          </select>
        </label>
      </div>
    </section>
  );
}

// ------------------------------------------------------------- lanes

/** Helpers to edit one lane inside the draft. */
function laneEditors(update: FormProps["update"], kind: RequestDraft["kind"]) {
  return {
    patch: (key: string, patch: Partial<LaneDraft>) =>
      update((draft) => ({ ...draft, lanes: draft.lanes.map((lane) => (lane.key === key ? { ...lane, ...patch } : lane)) })),
    add: (lane: LaneDraft) => update((draft) => ({ ...draft, lanes: [...draft.lanes, lane] })),
    duplicate: (key: string, copied: LaneDraft) =>
      update((draft) => {
        const index = draft.lanes.findIndex((lane) => lane.key === key);
        if (index < 0) return draft;
        const lanes = [...draft.lanes];
        lanes.splice(index + 1, 0, copied);
        return { ...draft, lanes };
      }),
    remove: (key: string) =>
      update((draft) => {
        const lanes = draft.lanes.filter((lane) => lane.key !== key);
        return { ...draft, lanes: lanes.length ? lanes : [emptyLane(kind)] };
      }),
  };
}

function Lanes({ token, draft, lang, copy, showProblems, update }: FormProps) {
  const editors = laneEditors(update, draft.kind);
  // One lane open at a time, the design's way; the first one to start.
  const [openKey, setOpenKey] = useState<string | null>(draft.lanes[0]?.key ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const filled = filledLanes(draft);
  const filledKeys = new Set(filled.map((lane) => lane.key));
  const complete = filled.filter((lane) => laneProblems(lane).length === 0).length;
  const total = draft.lanes.length;

  function addLane() {
    const lane = emptyLane(draft.kind);
    editors.add(lane);
    setOpenKey(lane.key);
  }

  function duplicate(lane: LaneDraft) {
    const copied = copyLane(lane);
    editors.duplicate(lane.key, copied);
    setOpenKey(copied.key);
  }

  async function onFile(file: File) {
    setBusy(true);
    setNotice(null);
    try {
      const { lanes: imported, sheet } = await importLanes(file);
      if (!imported.length) {
        setNotice(copy.importEmpty);
        return;
      }
      // The blank lanes give way to the imported ones.
      update((d) => {
        const kept = new Set(filledLanes(d).map((lane) => lane.key));
        return { ...d, lanes: [...d.lanes.filter((lane) => kept.has(lane.key)), ...imported] };
      });
      setNotice(copy.imported(imported.length, sheet));
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sr-h">
        <h2>{copy.lanesTitle}</h2>
        {draft.kind === "rfq" && (
          <span className="sr-hint">
            <i className="sr-req">•</i> {copy.templateMark}
          </span>
        )}
        <span className="spacer" />
        {filled.length > 0 && <span className="sr-count">{copy.lanesComplete(complete, filled.length)}</span>}
        <button type="button" className="sr-link" onClick={() => void downloadTemplate(lang)}>
          ↓ {copy.template}
        </button>
        <button type="button" className="sr-link" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? copy.importing : `↑ ${copy.import}`}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onFile(file);
          }}
        />
      </div>
      {notice && <InfoBanner>{notice}</InfoBanner>}
      {draft.lanes.map((lane, index) => {
        const sent = withDefaults(draft, lane);
        const problems = filledKeys.has(lane.key) ? laneProblems(sent) : [];
        const flagged = showProblems && problems.length > 0;
        const remove =
          total > 1 ? (
            <button type="button" className="sr-link" onClick={() => editors.remove(lane.key)}>
              {copy.remove}
            </button>
          ) : null;
        if (openKey === lane.key) {
          return (
            <section key={lane.key} className={`sr-card sr-lane${flagged ? " sr-lane-bad" : ""}`}>
              <header className="sr-lane-head">
                <span className="sr-lane-tag">{copy.laneTag(index + 1)}</span>
                <strong>{routeText(lane) || copy.newLane}</strong>
                <span className="spacer" />
                <span className="sr-actions quiet">
                  <button type="button" className="sr-link" onClick={() => duplicate(lane)}>
                    {copy.duplicate}
                  </button>
                  {remove && <>· {remove}</>}
                </span>
              </header>
              <LaneForm
                token={token}
                lane={lane}
                kind={draft.kind}
                segments={draft.segments}
                defaults={draft}
                lang={lang}
                copy={copy}
                problems={flagged ? problems : []}
                onChange={(patch) => editors.patch(lane.key, patch)}
              />
              {flagged && <p className="sr-problems">{problems.map((problem) => copy.problem[problem]).join(" · ")}</p>}
            </section>
          );
        }
        const loads = sent.loads ? copy.loadCount(sent.loads, draft.kind === "spot") : "";
        return (
          <section key={lane.key} className={`sr-card sr-lane-row${flagged ? " sr-lane-bad" : ""}`}>
            <span className="sr-lane-tag">{copy.laneTag(index + 1)}</span>
            <strong>{routeText(lane) || copy.newLane}</strong>
            <span className="sr-lane-sum">{[unitText(sent, lang), loads, handlingText(lane)].filter(Boolean).join(" · ")}</span>
            <span className="spacer" />
            {filledKeys.has(lane.key) && (
              <em className={problems.length ? "sr-state warn" : "sr-state ok"}>{problems.length ? copy.problem[problems[0]] : copy.complete}</em>
            )}
            <span className="sr-actions">
              <button type="button" className="sr-link" onClick={() => setOpenKey(lane.key)}>
                {copy.edit}
              </button>
              {remove && <>· {remove}</>}
            </span>
          </section>
        );
      })}
      <button type="button" className="sr-add" onClick={addLane}>
        + {copy.addLane}
      </button>
    </>
  );
}

// ------------------------------------------------------------- criteria

type Item = { scope: string; row: RubricRow };

/** How a category moves the sourcing, as the design tells the shipper. */
const CARDS: { category: RubricCategory; effect: "widens" | "narrows" | null }[] = [
  { category: "logistics_model", effect: "widens" },
  { category: "operation_criteria", effect: "widens" },
  { category: "business_rules", effect: "widens" },
  { category: "service_specifications", effect: "narrows" },
  { category: "carrier_requirements", effect: "narrows" },
  { category: "other_notes", effect: null },
];

/**
 * A category's questions: each segment's defining one first, then the ones
 * every segment shares, then the rest of each segment's rubric.
 */
function itemsFor(category: RubricCategory, segments: string[]): Item[] {
  const ofSegments = (rows: (segment: string) => RubricRow[]) =>
    segments.flatMap((segment) => rows(segment).filter((row) => row.category === category).map((row) => ({ scope: segment, row })));
  if (category === "logistics_model") return [...ofSegments(segmentModelRows), ...ofSegments(segmentMoreRows)];
  const general = (GENERAL_GROUPS.find((group) => group.key === category)?.rows ?? []).map((row) => ({ scope: "general", row }));
  return [...ofSegments(segmentKeyRows), ...general, ...ofSegments(segmentMoreRows)];
}

const listId = (catalog: ResponseCatalog, lang: Lang) => `sr-answers-${catalog}-${lang}`;

/** A tick says the requirement applies, as rateware's own checklist does. */
const tickValue = (catalog: ResponseCatalog) => (catalog === "response_yes_no" ? "Yes" : "Required");

/**
 * One question of rateware's questionnaire as the design's checkbox: ticking
 * it answers "applies", and the answer can then be refined from the list or
 * in the shipper's own words.
 */
function Criterion({ item, segmentTag, props }: { item: Item; segmentTag: boolean; props: FormProps }) {
  const { draft, lang, copy, update } = props;
  const { scope, row } = item;
  const key = answerKey(scope, row.key);
  const answer = draft.answers[key];
  const checked = isAnswered(answer);
  // The answer box stays while it's being edited, even emptied.
  const [editing, setEditing] = useState(false);
  const text = row[lang];
  const set = (next: Answer | null) =>
    update((d) => {
      const answers = { ...d.answers };
      if (next) answers[key] = next;
      else delete answers[key];
      return { ...d, answers };
    });
  return (
    <div className={`sr-crit-row${checked ? " on" : ""}`}>
      <label className="sr-crit-check" title={text.question}>
        <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked ? { value: tickValue(row.catalog), note: "" } : null)} />
        <span>
          {text.label}
          {segmentTag && scope !== "general" && <em>{segmentLabel(scope, lang)}</em>}
        </span>
      </label>
      {(checked || editing) && (
        <input
          list={listId(row.catalog, lang)}
          value={answer?.value ? responseLabel(row.catalog, answer.value, lang) : ""}
          placeholder={text.expected || copy.answerHint}
          title={`${text.question} ${copy.answerHint}`}
          aria-label={text.label}
          onFocus={() => setEditing(true)}
          onBlur={() => {
            setEditing(false);
            if (answer && !checked) set(null);
          }}
          onChange={(e) => {
            // Only a pick from the list (its exact label) becomes the list's value;
            // anything typed stays exactly as typed.
            const typed = e.target.value;
            const picked = RESPONSE_CATALOGS[row.catalog].find((entry) => typed === entry[lang] || typed === entry.value);
            set({ value: picked ? picked.value : typed, note: answer?.note ?? "" });
          }}
        />
      )}
    </div>
  );
}

const SHOWN = 6;

function CriteriaCard({ category, effect, segments, props }: { category: RubricCategory; effect: "widens" | "narrows" | null; segments: string[]; props: FormProps }) {
  const { draft, copy, update } = props;
  const [all, setAll] = useState(false);
  const items = itemsFor(category, segments);
  const answered = (item: Item) => isAnswered(draft.answers[answerKey(item.scope, item.row.key)]);
  // What the shipper answered always shows, folded or not.
  const shown = all ? items : items.filter((item, index) => index < SHOWN || answered(item));
  const hidden = items.length - shown.length;
  return (
    <section className="sr-card sr-crit">
      <header>
        <h3>{copy.criteria[category]}</h3>
        <span className="spacer" />
        {effect && <em className={`sr-tag ${effect === "widens" ? "green" : "amber"}`}>{copy[effect]}</em>}
      </header>
      {category === "logistics_model" && !segments.length && <p className="sr-hint">{copy.pickSegment}</p>}
      {shown.map((item) => (
        <Criterion key={`${item.scope}:${item.row.key}`} item={item} segmentTag={segments.length > 1} props={props} />
      ))}
      {items.length > SHOWN && (all || hidden > 0) && (
        <button type="button" className="sr-link sr-crit-more" onClick={() => setAll(!all)}>
          {all ? copy.showLess : copy.showMore(hidden)}
        </button>
      )}
      {category === "other_notes" && (
        <label className="field sr-crit-notes">
          <span className="sr-field-head">{copy.otherNotes}</span>
          <textarea rows={3} value={draft.notes} placeholder={copy.otherNotesHint} onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))} />
        </label>
      )}
    </section>
  );
}

function Criteria(props: FormProps) {
  const { draft, lang, copy } = props;
  const segments = requestSegments(draft);
  // Optional: folded until the shipper wants it, or once something in it is answered.
  const started = Object.values(draft.answers).some(isAnswered) || Boolean(draft.notes.trim());
  return (
    <details className="sr-crit-fold" open={started || undefined}>
      <summary className="sr-h">
        <h2>{copy.criteriaTitle}</h2>
        <span className="sr-hint">{copy.criteriaTag}</span>
      </summary>
      <section className="sr-card sr-tip">
        <strong>{copy.tipTitle}</strong>
        <p className="widens">{copy.tipWide}</p>
        <p className="narrows">{copy.tipNarrow}</p>
      </section>
      {/* The answer lists, once: every answer box suggests from its own. */}
      {(Object.keys(RESPONSE_CATALOGS) as ResponseCatalog[]).map((catalog) => (
        <datalist key={catalog} id={listId(catalog, lang)}>
          {RESPONSE_CATALOGS[catalog].map((entry) => (
            <option key={entry.value} value={entry[lang]} />
          ))}
        </datalist>
      ))}
      <div className="sr-criteria">
        {CARDS.map((card) => (
          <CriteriaCard key={card.category} category={card.category} effect={card.effect} segments={segments} props={props} />
        ))}
      </div>
    </details>
  );
}

// ------------------------------------------------------------- the page

/**
 * Every request on one page, the design's way: what the shipper can tell us
 * about the whole request, its lanes, and rateware's questionnaire as the
 * project's criteria. Spot or RFQ only changes the volume columns.
 */
export function RequestForm(props: FormProps) {
  const { copy, onSubmit, sending, error } = props;
  return (
    <div className="sr-form">
      <Basics {...props} />
      <Lanes {...props} />
      <Criteria {...props} />
      {error && <ErrorBanner message={error} />}
      <button type="button" className="primary sr-submit" disabled={sending} onClick={onSubmit}>
        {sending ? copy.sending : copy.submit}
      </button>
      <p className="sr-footnote">{copy.footnote}</p>
    </div>
  );
}
