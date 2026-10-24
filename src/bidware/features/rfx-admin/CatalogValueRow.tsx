import { tr } from "@/i18n/rfx-admin";
import { domainLabel } from "@/i18n/domain";
import { useLang } from "@/i18n/language";
import { Pill } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { NEED_REASON } from "@/lib/roles";
import { CATALOG_FIELDS, valueLabel, type CatalogField, type CatalogIndex, type Choice } from "./laneImport";

export interface CatalogValueItem {
  field: CatalogField;
  text: string;
  count: number;
  suggestion: string | null;
  choice: Choice | null;
}

/**
 * One word the catalog didn't know: map it to an official value, optionally
 * saved as a synonym (the shared catalog is an Administrador's), or keep it as
 * written where the caller allows that.
 */
export function CatalogValueRow({
  item,
  index,
  unit,
  allowKeep = true,
  onDecide,
}: {
  item: CatalogValueItem;
  index: CatalogIndex;
  /** What the count counts: "ruta(s)", "tarifa(s)". */
  unit: string;
  allowKeep?: boolean;
  onDecide: (choice: Choice | null) => void;
}) {
  const lang = useLang();
  const { can } = useAuth();
  const field = CATALOG_FIELDS.find((entry) => entry.key === item.field)!;
  const mapped = item.choice?.kind === "map" ? item.choice : null;
  const selected = mapped?.value ?? "";
  return (
    <tr>
      <td>
        <div className="cell-title">{item.text}</div>
        <div className="cell-sub">
          {domainLabel(field.label)} · {item.count} {unit}
        </div>
      </td>
      <td>
        <select
          value={item.choice?.kind === "keep" ? "__keep__" : selected}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) onDecide(null);
            else if (next === "__keep__") onDecide({ kind: "keep" });
            else onDecide({ kind: "map", value: next, saveAlias: mapped?.saveAlias ?? false });
          }}
        >
          <option value="">{tr("text104")}</option>
          {index.options[item.field].map((option) => (
            <option key={option} value={option}>
              {valueLabel(index, item.field, option, lang)}
              {option === item.suggestion ? tr("text105") : ""}
            </option>
          ))}
          {allowKeep && <option value="__keep__">{tr("text106")}</option>}
        </select>
        {!item.choice && item.suggestion && (
          <button className="ne-link" onClick={() => onDecide({ kind: "map", value: item.suggestion!, saveAlias: false })}>
            {tr("text107")}{valueLabel(index, item.field, item.suggestion, lang)}»
          </button>
        )}
      </td>
      <td>
        {mapped ? (
          <label className="row" style={{ gap: 6, fontSize: 12 }}>
            <input
              type="checkbox"
              style={{ width: 15 }}
              checked={mapped.saveAlias}
              disabled={!can("admin")}
              title={can("admin") ? undefined : NEED_REASON.admin}
              onChange={(e) => onDecide({ ...mapped, saveAlias: e.target.checked })}
            />
            {tr("text108")}</label>
        ) : item.choice?.kind === "keep" ? (
          <Pill tone="amber">{tr("text109")}</Pill>
        ) : (
          <Pill tone="amber">{tr("text110")}</Pill>
        )}
      </td>
    </tr>
  );
}
