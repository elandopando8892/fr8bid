import { tr } from "@/i18n/quotedesk";
import { useLang, getLang } from "@/i18n/language";
import { useMemo, useState } from "react";
import { Dialog, money } from "@/components/ui";
import { computeLane, pct, toNumber } from "./calc";
import {
  MARKUP_MODES,
  UNIT_LABEL,
  type AccessorialLine,
  type AccessorialUnit,
  type CatalogItem,
  type Currency,
  type MarkupMode,
} from "./quotedesk.service";

interface Row {
  key: string;
  code: string | null;
  label: string;
  unit: AccessorialUnit;
  quantity: string;
  rate: string;
  checked: boolean;
  custom: boolean;
}

const UNITS = Object.keys(UNIT_LABEL) as AccessorialUnit[];

/** Catalog rates are kept in their own currency; show them in the quote's. */
function catalogRate(item: CatalogItem, currency: Currency, fx: number | null): number {
  const rate = toNumber(item.default_rate) ?? 0;
  if (item.currency === currency) return rate;
  if (!fx) return rate;
  return item.currency === "USD" ? Math.round(rate * fx * 100) / 100 : Math.round((rate / fx) * 100) / 100;
}

export function AccessorialsModal({
  title,
  catalog,
  currency,
  fx,
  components,
  initialLines,
  initialMode,
  initialValue,
  onApply,
  onClose,
}: {
  title: string;
  catalog: CatalogItem[];
  currency: Currency;
  fx: number | null;
  components: Record<string, unknown>;
  initialLines: AccessorialLine[];
  initialMode: MarkupMode;
  initialValue: string;
  onApply: (lines: AccessorialLine[], mode: MarkupMode, value: string) => void;
  onClose: () => void;
}) {
  useLang();
  const [rows, setRows] = useState<Row[]>(() => {
    const byCode = new Map(initialLines.filter((l) => l.code).map((l) => [l.code as string, l]));
    const fromCatalog: Row[] = catalog
      .filter((item) => item.active)
      .map((item) => {
        const line = byCode.get(item.code);
        return {
          key: item.code,
          code: item.code,
          label: item.label,
          unit: item.unit,
          quantity: line ? String(line.quantity) : "1",
          rate: line ? String(line.rate) : String(catalogRate(item, currency, fx)),
          checked: Boolean(line),
          custom: false,
        };
      });
    const known = new Set(fromCatalog.map((r) => r.code));
    const custom: Row[] = initialLines
      .filter((l) => !l.code || !known.has(l.code))
      .map((l, i) => ({
        key: `custom-${i}`,
        code: l.code,
        label: l.label,
        unit: l.unit,
        quantity: String(l.quantity),
        rate: String(l.rate),
        checked: true,
        custom: true,
      }));
    return [...fromCatalog, ...custom];
  });
  const [mode, setMode] = useState<MarkupMode>(initialMode);
  const [value, setValue] = useState(initialValue);

  const lines = useMemo<AccessorialLine[]>(
    () =>
      rows
        .filter((r) => r.checked && r.label.trim())
        .map((r) => ({
          code: r.code,
          label: r.label.trim(),
          unit: r.unit,
          quantity: toNumber(r.quantity) ?? 0,
          rate: toNumber(r.rate) ?? 0,
          subtotal: 0,
        })),
    [getLang(), rows],
  );
  const preview = computeLane({ ...components, accessorials: lines, markup_mode: mode, markup_value: value });
  const modeHint = MARKUP_MODES.find((m) => m.key === mode)?.hint ?? "";

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <Dialog
      title={tr("text001")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>{tr("text002")}</button>
          <button
            className="primary"
            disabled={Boolean(preview.problem)}
            onClick={() => onApply(preview.accessorials, mode, value)}
          >
            {tr("text003")}</button>
        </>
      }
    >
      <p className="qd-modal-sub mono">{title}</p>
      <h3 className="qd-section-title">{tr("text004")}</h3>
      <table className="data qd-acc-table">
        <thead>
          <tr>
            <th style={{ width: 28 }} />
            <th>{tr("text005")}</th>
            <th>{tr("text006")}</th>
            <th style={{ width: 80 }}>{tr("text007")}</th>
            <th style={{ width: 110 }}>{tr("text008")}</th>
            <th style={{ width: 100 }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const subtotal = (toNumber(r.quantity) ?? 0) * (toNumber(r.rate) ?? 0);
            return (
              <tr key={r.key} className={r.checked ? "qd-acc-on" : "qd-acc-off"}>
                <td>
                  <input
                    type="checkbox"
                    checked={r.checked}
                    aria-label={tr("text009", r.label || tr("text010"))}
                    onChange={(e) => update(r.key, { checked: e.target.checked })}
                  />
                </td>
                <td>
                  {r.custom ? (
                    <input
                      value={r.label}
                      placeholder={tr("text005")}
                      onChange={(e) => update(r.key, { label: e.target.value })}
                    />
                  ) : (
                    r.label
                  )}
                </td>
                <td>
                  {r.custom ? (
                    <select value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value as AccessorialUnit })}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {UNIT_LABEL[u]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    UNIT_LABEL[r.unit]
                  )}
                </td>
                <td>
                  <input
                    inputMode="decimal"
                    value={r.quantity}
                    disabled={!r.checked}
                    onChange={(e) => update(r.key, { quantity: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    inputMode="decimal"
                    value={r.rate}
                    disabled={!r.checked}
                    onChange={(e) => update(r.key, { rate: e.target.value })}
                  />
                </td>
                <td className="mono">{r.checked ? money(subtotal, currency) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="qd-dashed"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: `custom-${Date.now()}`,
                code: null,
                label: "",
                unit: "event",
                quantity: "1",
                rate: "0",
                checked: true,
                custom: true,
              },
            ])
          }
        >
          {tr("text011")}</button>
        <div className="spacer" />
        <span className="qd-muted">{tr("text012")}</span>
        <strong className="mono">{money(preview.accessorials_total, currency)}</strong>
      </div>

      <h3 className="qd-section-title">Markup</h3>
      <div className="row qd-markup">
        <div className="qd-segmented">
          {MARKUP_MODES.map((m) => (
            <button key={m.key} className={mode === m.key ? "active" : undefined} onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <input
          inputMode="decimal"
          style={{ width: 110 }}
          value={value}
          placeholder={mode === "fixed_amount" ? currency : "%"}
          onChange={(e) => setValue(e.target.value)}
        />
        <span className="qd-muted mono">
          {modeHint}
          {mode === "percent_on_cost" ? ` (${money(preview.cost_total, currency)})` : ""}
        </span>
      </div>
      {preview.problem && <p className="qd-error">{preview.problem}</p>}

      <div className="qd-summary">
        <div>
          <span>{tr("text013")}</span>
          <strong>{preview.base_cost === null ? "—" : money(preview.base_cost, currency)}</strong>
        </div>
        <div>
          <span>{tr("text014")}</span>
          <strong>{money(preview.accessorials_total, currency)}</strong>
        </div>
        <div>
          <span>+ Markup</span>
          <strong>{preview.markup_amount === null ? "—" : money(preview.markup_amount, currency)}</strong>
        </div>
        <div>
          <span>All-in</span>
          <strong className="accent">{preview.all_in_rate === null ? "—" : money(preview.all_in_rate, currency)}</strong>
        </div>
        <div>
          <span>{tr("text015")}</span>
          <strong className="good">{pct(preview.margin_pct)}</strong>
        </div>
      </div>
    </Dialog>
  );
}
