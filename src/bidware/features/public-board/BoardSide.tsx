import { tr } from "@/i18n/public-board";
import { useLang } from "@/i18n/language";
import { corridors, loads, type BoardEvent, type BoardRow } from "./publicBoard.service";
import type { Access } from "./AccessDialogs";

/**
 * The column beside the board: where the viewer stands, where the market is
 * moving, and how to get in. Everything here is public: no carrier identity,
 * no rates.
 */
export function BoardSide({
  rows,
  events,
  access,
  notify,
  onFind,
  onNotify,
}: {
  rows: BoardRow[];
  events: BoardEvent[];
  access: Access | null;
  notify: boolean;
  onFind: () => void;
  onNotify: () => void;
}) {
  useLang();
  const hot = corridors(rows.filter((r) => r.board_status === "live" || r.board_status === "closing"));
  const top = Math.max(1, ...hot.map((c) => c.offers));
  const mine = access ? events.filter((e) => access.eventIds.includes(e.id) && (e.status === "live" || e.status === "closing")) : [];

  return (
    <aside className="pb-side">
      <section className="pb-panel dark">
        <span className="pb-eyebrow">{tr("text036")}</span>
        {access ? (
          <>
            <b>{mine.length ? tr("text037", mine.length, mine.length === 1 ? "" : "s") : tr("text038")}</b>
            <p>{access.email}</p>
            {mine.length > 0 && (
              <ul>
                {mine.slice(0, 4).map((e) => (
                  <li key={e.id} title={e.name}>
                    {e.name}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="primary" onClick={onFind}>
              {mine.length ? tr("text039") : tr("text040")}
            </button>
          </>
        ) : (
          <>
            <b>{tr("text041")}</b>
            <p>{tr("text042")}</p>
            <button type="button" className="primary" onClick={onFind}>
              {tr("text020")}</button>
            <p className="pb-small">{tr("text043")}</p>
          </>
        )}
      </section>

      <section className="pb-panel">
        <span className="pb-eyebrow">{tr("text044")}</span>
        {hot.length ? (
          <ol className="pb-corridors">
            {hot.map((c) => (
              <li key={c.label}>
                <div>
                  <b title={c.label}>{c.label}</b>
                  <span className="mono">{c.offers}{tr("text045")}</span>
                </div>
                <span className="pb-bar">
                  <i style={{ width: `${Math.max(6, (c.offers / top) * 100)}%` }} />
                </span>
                <small>
                  {tr("text141", c.lanes, c.lanes === 1 ? "" : "s")}
                  {c.loads ? tr("text046", loads(c.loads)) : ""}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="pb-small">{tr("text047")}</p>
        )}
      </section>

      <section className="pb-panel">
        <span className="pb-eyebrow">{tr("text048")}</span>
        <ol className="pb-steps">
          <li>
            <b>{tr("text049")}</b>{tr("text050")}</li>
          <li>
            <b>{tr("text051")}</b>{tr("text052")}</li>
          <li>
            <b>{tr("text053")}</b>{tr("text054")}</li>
        </ol>
      </section>

      {!notify && (
        <section className="pb-panel accent">
          <b>{tr("text055")}</b>
          <p>{tr("text056")}</p>
          <button type="button" onClick={onNotify}>
            {tr("text057")}</button>
        </section>
      )}
    </aside>
  );
}
