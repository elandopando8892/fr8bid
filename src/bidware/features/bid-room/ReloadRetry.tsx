import { q } from "@/i18n/bid-room-quote";

/** After a failed reload: why the lanes just answered still show their answer, and a way to read them again. */
export function ReloadRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="croom-note warn" role="alert">
      <span>{q("page.reloadFailed")}</span>
      <button type="button" onClick={onRetry}>
        {q("page.retry")}
      </button>
    </div>
  );
}
