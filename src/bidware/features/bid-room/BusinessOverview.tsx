import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBanner, Pill, dateShort } from "@/components/ui";
import { useLang } from "@/i18n/language";
import { o } from "@/i18n/bid-room-overview";
import {
  COMMERCIAL_MODELS,
  modelCopy,
  modelKeyOf,
  isLockedBrokerage,
  explainBidError,
  requestLaneAccess,
  segmentProgress,
  segmentsOf,
  type Answer,
  type BookEvent,
  type BookLane,
} from "./bidroom.service";

const MODES = ["private", "anonymous_rank", "open_leaderboard"] as const;
/** The event's visibility mode in the carrier's language; an unknown mode reads as the anonymous ranking. */
export function modeCopy(mode: string): { label: string; text: string } {
  const key = MODES.find((m) => m === mode) ?? "anonymous_rank";
  return { label: o(`mode.${key}.label`), text: o(`mode.${key}.text`) };
}

const route = (lane: BookLane) => `${String(lane.origin ?? "—")} → ${String(lane.destination ?? "—")}`;

/** How many open lanes to list before pointing to the rest. */
const OPEN_LIMIT = 15;

/**
 * "El negocio" — understand the scope before pricing (wireframe 11, step 1):
 * what the invitation is, how quoting works, what each commercial model means,
 * plus the carrier's other open invitations and the owner's open lanes it can
 * ask to join.
 */
export function BusinessOverview({
  token,
  event,
  lanes,
  openLanes,
  others,
  answers,
  deadline,
  closing,
  mode,
  onQuote,
}: {
  token: string;
  event: BookEvent;
  lanes: BookLane[];
  openLanes: BookLane[];
  others: { event: BookEvent; lanes: BookLane[] }[];
  answers: Map<string, Answer>;
  deadline: string;
  closing: boolean;
  mode: string;
  onQuote: () => void;
}) {
  useLang();
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const lockedCommercialModel = lanes.length > 0 && lanes.every(isLockedBrokerage);
  const segments = segmentsOf(lanes);
  const quoted = lanes.filter((l) => l.bid_rate != null).length;
  const terms = segments.reduce(
    (acc, s) => {
      const p = segmentProgress(s.key, answers);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 },
  );
  const visibility = modeCopy(mode);
  // Solo los modelos de sus rutas (decisión de Jose, 6-nov); sin modelo guardado, los que el panel le deja elegir.
  const ownModels = new Set(lanes.filter((l) => l.commercial_model).map((l) => modelKeyOf(l.commercial_model)));
  const models = ownModels.size ? COMMERCIAL_MODELS.filter((m) => ownModels.has(m.key)) : COMMERCIAL_MODELS;

  async function askAccess(laneId: string) {
    setError(null);
    try {
      await requestLaneAccess(token, laneId);
      setRequested((prev) => new Set(prev).add(laneId));
    } catch (e) {
      setError(explainBidError(e));
    }
  }

  return (
    <div className="croom-body side-narrow">
      <div className="croom-main">
        {error && <ErrorBanner message={error} />}

        <section className="croom-card">
          <header className="croom-card-head">
            <b className="grow">{o("biz.invitation")}</b>
          </header>
          <dl className="croom-facts pad">
            <div>
              <dt>{o("biz.close")}</dt>
              <dd>
                {event.due_date ? `${dateShort(event.due_date)} · ` : ""}
                {deadline}
              </dd>
            </div>
            {event.operation_start_date && (
              <div>
                <dt>{o("biz.start")}</dt>
                <dd>{o("biz.startText", dateShort(event.operation_start_date))}</dd>
              </div>
            )}
            <div>
              <dt>{o("biz.lanes")}</dt>
              <dd>{o("biz.lanesText", lanes.length, segments.length)}</dd>
            </div>
            <div>
              <dt>{o("biz.visibility")}</dt>
              <dd>
                <b>{visibility.label}:</b> {visibility.text}
              </dd>
            </div>
          </dl>
        </section>

        <section className="croom-card ayuda">
          <header className="croom-card-head">
            <b className="grow">{o("biz.howTitle")}</b>
          </header>
          <ol className="croom-steps">
            <li>
              <b>{o("biz.step1Bold")}</b>
              {o("biz.step1Text")}
            </li>
            <li>
              <b>{o("biz.step2Bold")}</b>
              {o("biz.step2Text")}
            </li>
            <li>
              <b>{o("biz.step3Bold")}</b>
              {o("biz.step3Text")}
            </li>
          </ol>
        </section>

        {lockedCommercialModel ? <section className="croom-card">
          <header className="croom-card-head"><b>{o("biz.fixedTitle")}</b></header>
          <p className="pad">{o("biz.fixedText")}</p>
        </section> : (        <section className="croom-card">
          <header className="croom-card-head">
            <b className="grow">{models.length === 1 ? o("biz.modelOne") : o("biz.modelMany")}</b>
          </header>
          <div className="croom-table flat">
            <table className="data fixed">
              <colgroup>
                <col style={{ width: 190 }} />
                <col className="ayuda" />
                <col style={{ width: 170 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{o("biz.colModel")}</th>
                  <th className="ayuda">{o("biz.colWhat")}</th>
                  <th>{o("biz.colPct")}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const text = modelCopy(m.key);
                  return (
                    <tr key={m.key}>
                      <td>
                        <b>{text.label}</b>
                      </td>
                      <td className="croom-wrap ayuda">
                        {text.enter} {text.effect}
                      </td>
                      <td className="mono">{o("biz.pctRange", m.min, m.max, m.blank)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>) }

        {others.length > 0 && (
          <section className="croom-card">
            <header className="croom-card-head">
              <b className="grow">{o("biz.others")}</b>
              <Pill tone="blue">{others.length}</Pill>
            </header>
            <div className="croom-table flat">
              <table className="data fixed">
                <colgroup>
                  <col />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 90 }} />
                </colgroup>
                <tbody>
                  {others.map(({ event: other, lanes: rows }) => (
                    <tr key={String(other.id ?? rows[0]?.rfx_event_id)}>
                      <td className="ellipsis" title={String(other.name ?? "")}>
                        <span className="croom-num">{String(other.rfx_id ?? "")}</span>
                        {String(other.name ?? o("biz.event"))}
                      </td>
                      <td className="mono">{o("biz.laneCount", rows.length)}</td>
                      <td className="mono">{other.due_date ? dateShort(other.due_date) : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link className="btn" to={`/bid/${encodeURIComponent(String(rows[0].invitation_token))}`}>
                          {o("biz.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {openLanes.length > 0 && (
          <section className="croom-card">
            <header className="croom-card-head">
              <b className="grow">{o("biz.notInvited")}</b>
              <Pill>{openLanes.length}</Pill>
            </header>
            <p className="croom-card-note">{o("biz.notInvitedNote")}</p>
            <div className="croom-table flat">
              <table className="data fixed">
                <colgroup>
                  <col style={{ width: 110 }} />
                  <col />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 150 }} />
                </colgroup>
                <tbody>
                  {openLanes.slice(0, OPEN_LIMIT).map((lane) => {
                    const id = String(lane.rfx_lane_id ?? "");
                    return (
                      <tr key={id}>
                        <td className="mono croom-soft ellipsis">{String(lane.event?.rfx_id ?? "")}</td>
                        <td className="ellipsis" title={route(lane)}>
                          {route(lane)}
                        </td>
                        <td className="ellipsis croom-soft">{String(lane.equipment ?? "—")}</td>
                        <td style={{ textAlign: "right" }}>
                          {requested.has(id) ? (
                            <Pill tone="green">{o("biz.requested")}</Pill>
                          ) : (
                            <button type="button" onClick={() => askAccess(id)}>
                              {o("biz.askAccess")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {openLanes.length > OPEN_LIMIT && (
              <p className="croom-card-note">
                {o("biz.more", openLanes.length - OPEN_LIMIT)}
              </p>
            )}
          </section>
        )}
      </div>

      <aside className="croom-side">
        <div className="croom-eyebrow">{o("biz.progress")}</div>
        <div className="croom-meter">
          <div>
            <b>{o("biz.count", quoted, lanes.length)}</b> {o("biz.lanesQuoted")}
          </div>
          <span>
            <i style={{ width: `${lanes.length ? (quoted / lanes.length) * 100 : 0}%` }} />
          </span>
        </div>
        <div className="croom-meter">
          <div>
            <b>{o("biz.count", terms.done, terms.total)}</b> {o("biz.termsConfirmed")}
          </div>
          <span>
            <i style={{ width: `${terms.total ? (terms.done / terms.total) * 100 : 0}%` }} />
          </span>
        </div>
        <div className={`croom-box${closing ? " amber" : ""}`}>
          <b>{deadline.charAt(0).toUpperCase() + deadline.slice(1)}</b>
          <p>
            {event.due_date
              ? o("biz.windowCloses", dateShort(event.due_date))
              : o("biz.noDeadline")}
          </p>
        </div>
        <button type="button" className="primary" onClick={onQuote}>
          {o("biz.goQuote")}
        </button>
      </aside>
    </div>
  );
}
