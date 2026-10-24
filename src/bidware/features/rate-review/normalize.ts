/**
 * Staged rates speak the words of whoever sent them ("Tractocamion",
 * "Arrastre portuario", "Redondo"); the rate base speaks the catalog's
 * ("Truck Trailer", "MX Drayage", "Roundtrip") in both its raw and normalized
 * columns, because the reports and the benchmarks group by them. Approving a
 * rate therefore also puts it in the catalog's words, keeping the original
 * ones in its notes.
 */
import {
  CATALOG_FIELDS,
  choiceKey,
  resolveValue,
  suggestValue,
  type CatalogField,
  type CatalogIndex,
  type Choice,
  type Choices,
} from "@/features/rfx-admin/laneImport";
import type { StagedRate } from "./readiness";

const FIELDS = CATALOG_FIELDS.map((field) => field.key);

export interface FieldValue {
  text: string;
  /** The official value, from the catalog or the team's choice; null while nobody decided. */
  value: string | null;
  via: "catalog" | "choice" | "keep" | null;
}

export type RateValues = Record<CatalogField, FieldValue>;

export function rateValues(row: StagedRate, index: CatalogIndex, choices: Choices): RateValues {
  return Object.fromEntries(
    FIELDS.map((field) => {
      const text = String(row[field] ?? "").trim();
      if (!text) return [field, { text, value: null, via: null }];
      const official = resolveValue(index, field, text);
      if (official) return [field, { text, value: official, via: "catalog" as const }];
      const choice = choices[choiceKey(field, text)];
      if (choice?.kind === "map") return [field, { text, value: choice.value, via: "choice" as const }];
      if (choice?.kind === "keep") return [field, { text, value: text, via: "keep" as const }];
      return [field, { text, value: null, via: null }];
    }),
  ) as RateValues;
}

/** Whether every word the row carries has an official value (or was kept on purpose). */
export const valuesSettled = (values: RateValues) => FIELDS.every((field) => !values[field].text || values[field].value);

/** One word the catalog didn't know, across the rows under review. */
export interface UnknownValue {
  field: CatalogField;
  text: string;
  count: number;
  suggestion: string | null;
  choice: Choice | null;
}

export function unknownValues(rows: StagedRate[], index: CatalogIndex, choices: Choices): UnknownValue[] {
  const found = new Map<string, UnknownValue>();
  for (const row of rows) {
    for (const field of FIELDS) {
      const text = String(row[field] ?? "").trim();
      if (!text || resolveValue(index, field, text)) continue;
      const key = choiceKey(field, text);
      const current = found.get(key);
      if (current) current.count += 1;
      else found.set(key, { field, text, count: 1, suggestion: suggestValue(index, field, text), choice: choices[key] ?? null });
    }
  }
  return [...found.values()].sort(
    (a, b) => Number(Boolean(a.choice)) - Number(Boolean(b.choice)) || FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field) || b.count - a.count,
  );
}

const FIELD_LABEL = Object.fromEntries(CATALOG_FIELDS.map((field) => [field.key, field.label])) as Record<CatalogField, string>;

/**
 * The patch that puts a row in the catalog's words: the official value in the
 * raw and the normalized column, the replaced words appended to the notes.
 */
export function normalizationPatch(row: StagedRate, values: RateValues): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const replaced: string[] = [];
  for (const field of FIELDS) {
    const { text, value, via } = values[field];
    if (!text || !value || via === "keep") continue;
    if (value !== text) {
      patch[field] = value;
      replaced.push(`${FIELD_LABEL[field]}: ${text}`);
    }
    patch[`normalized_${field}`] = value;
  }
  if (valuesSettled(values)) patch.catalog_match_status = "matched";
  if (replaced.length) {
    const note = `Texto original: ${replaced.join(" · ")}`;
    const notes = String(row.notes ?? "").trim();
    if (!notes.includes(note)) patch.notes = notes ? `${notes} | ${note}` : note;
  }
  return patch;
}
