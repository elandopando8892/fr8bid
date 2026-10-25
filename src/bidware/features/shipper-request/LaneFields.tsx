import type { ReactNode } from "react";
import { PlaceField } from "./PlaceField";
import {
  BORDER_CROSSINGS,
  CONFIG_TYPES,
  EQUIPMENT_TYPES,
  FACILITY_TYPES,
  LOAD_TYPES,
  OPERATION_TYPES,
  PACKAGING_TYPES,
  SCHEDULE_TYPES,
  SHIPMENT_KINDS,
  SHIPPER_SERVICE_TYPES,
  TRUCK_TYPES,
  YES_NO,
  catalogLabel,
  type CatalogOption,
} from "./catalog";
import type { Copy } from "./request.copy";
import {
  asksCrossing,
  inferredOperation,
  inferredSegment,
  WEEKDAYS,
  type Lang,
  type LaneDraft,
  type LaneProblem,
  type Place,
  type RequestDraft,
  type RequestKind,
} from "./request.model";
import { SEGMENTS, segmentLabel } from "./rubric";

type Patch = (patch: Partial<LaneDraft>) => void;
/** The lane's columns kept as typed text. */
type TextKey = { [K in keyof LaneDraft]-?: LaneDraft[K] extends string ? K : never }[keyof LaneDraft];

export interface LaneFieldProps {
  token: string;
  lane: LaneDraft;
  kind: RequestKind;
  /** The segments the shipper picked for the whole request. */
  segments: string[];
  /** The request's main commodity and standard equipment, which an empty lane takes. */
  defaults: Pick<RequestDraft, "commodity" | "equipment">;
  lang: Lang;
  copy: Copy;
  problems: LaneProblem[];
  onChange: Patch;
}

/** A template list; a saved value outside it still shows (and stays) as its own option. */
export function CatalogSelect({
  list,
  value,
  lang,
  empty,
  invalid,
  onChange,
}: {
  list: CatalogOption[];
  value: string;
  lang: Lang;
  empty: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const known = !value || list.some((entry) => entry.value === value);
  return (
    <select
      value={value}
      aria-invalid={invalid || undefined}
      className={invalid ? "sr-invalid-input" : undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{empty}</option>
      {list.map((entry) => (
        <option key={entry.value} value={entry.value}>
          {entry[lang]}
        </option>
      ))}
      {!known && <option value={value}>{value}</option>}
    </select>
  );
}

/** "catálogo": the list is the RFI template's own. */

/** A labelled control; `required` marks what the RFI template stars. */
function Field({
  label,
  required,
  wide,
  title,
  copy,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  title?: string;
  copy: Copy;
  children: ReactNode;
}) {
  return (
    <label className={`field${wide ? " sr-wide" : ""}`} title={title}>
      <span className="sr-field-head">
        {label}
        {required && (
          <i className="sr-req" title={copy.templateMark} aria-label={copy.templateMark}>
            •
          </i>
        )}
      </span>
      {children}
    </label>
  );
}

const numeric = (value: string) => value.replace(/[^\d.,]/g, "");

function NumberInput({ value, placeholder, invalid, onChange }: { value: string; placeholder?: string; invalid?: boolean; onChange: (value: string) => void }) {
  return (
    <input
      inputMode="decimal"
      className={`mono${invalid ? " sr-invalid-input" : ""}`}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(numeric(e.target.value))}
    />
  );
}

function WeightInput({ lane, copy, onChange }: { lane: LaneDraft; copy: Copy; onChange: Patch }) {
  return (
    <div className="field">
      <span className="sr-field-head">{copy.weight}</span>
      <div className="sr-weight">
        <input
          inputMode="decimal"
          className="mono"
          value={lane.weight}
          placeholder="40,000"
          aria-label={copy.weight}
          onChange={(e) => onChange({ weight: numeric(e.target.value) })}
        />
        <select value={lane.weight_unit} aria-label="lb / kg" onChange={(e) => onChange({ weight_unit: e.target.value as "lb" | "kg" })}>
          <option value="lb">lb</option>
          <option value="kg">kg</option>
        </select>
      </div>
    </div>
  );
}

/** A place's zip code, which the template asks next to each location. */
function PostalInput({ place, copy, onChange }: { place: Place | null; copy: Copy; onChange: (place: Place) => void }) {
  return (
    <input
      inputMode="numeric"
      className="mono"
      value={place?.postal_code ?? ""}
      placeholder={place ? "00000" : copy.placeHint}
      disabled={!place}
      onChange={(e) => place && onChange({ ...place, postal_code: e.target.value.replace(/[^\dA-Za-z -]/g, "").slice(0, 10) })}
    />
  );
}

/** The template's two yes/no columns. */
function YesNo({ value, lang, copy, onChange }: { value: string; lang: Lang; copy: Copy; onChange: (value: string) => void }) {
  return <CatalogSelect list={YES_NO} value={value} lang={lang} empty={copy.choose} onChange={onChange} />;
}

/**
 * One lane, every column of the RFI template's route matrix in the design's
 * sections. Only what rfx-bid-api requires (origin, destination, equipment,
 * volume) is checked; the rest is as partial as the shipper likes.
 */
export function LaneForm({ token, lane, kind, segments, defaults, lang, copy, problems, onChange }: LaneFieldProps) {
  const bad = (problem: LaneProblem) => problems.includes(problem);
  // The template's marks only mean something on the RFQ, which follows the workbook.
  const marks = kind === "rfq";
  const crossing = asksCrossing(lane);
  const operation = inferredOperation(lane);
  const segment = inferredSegment(lane) || (segments.length === 1 ? segments[0] : "");
  const segmentOptions = segments.length ? SEGMENTS.filter((entry) => segments.includes(entry.value) || entry.value === lane.segment) : SEGMENTS;
  const standard = (label: string) => `${copy.standard} · ${label}`;
  const number = (key: TextKey, placeholder?: string, invalid?: boolean) => (
    <NumberInput value={lane[key]} placeholder={placeholder} invalid={invalid} onChange={(value) => onChange({ [key]: value } as Partial<LaneDraft>)} />
  );
  const loads = (
    <Field label={kind === "spot" ? copy.loadsSpot : copy.loadsRfq} required={marks} copy={copy}>
      {number("loads", kind === "spot" ? "1" : "12", bad("loads"))}
    </Field>
  );
  const leadTime = (
    <Field label={copy.leadTime} required={marks} copy={copy}>
      {number("lead_time_days", "1")}
    </Field>
  );

  return (
    <div className="sr-lane-form">
      <h4 className="sr-sec-title">{copy.sections.origin}</h4>
      <div className="sr-grid4">
        <PlaceField token={token} label={copy.origin} value={lane.origin} lang={lang} invalid={bad("origin")} onChange={(origin) => onChange({ origin })} />
        <Field label={copy.postalCode} required={marks} copy={copy}>
          <PostalInput place={lane.origin} copy={copy} onChange={(origin) => onChange({ origin })} />
        </Field>
        <Field label={copy.facility} copy={copy}>
          <CatalogSelect list={FACILITY_TYPES} value={lane.origin_facility} lang={lang} empty={copy.choose} onChange={(origin_facility) => onChange({ origin_facility })} />
        </Field>
        <Field label={copy.shipper} copy={copy}>
          <input value={lane.origin_shipper} placeholder={copy.companyHint} onChange={(e) => onChange({ origin_shipper: e.target.value })} />
        </Field>
        <Field label={copy.loadType} required={marks} copy={copy}>
          <CatalogSelect list={LOAD_TYPES} value={lane.origin_load_type} lang={lang} empty={copy.choose} onChange={(origin_load_type) => onChange({ origin_load_type })} />
        </Field>
        <Field label={copy.loadHours} required={marks} copy={copy}>
          {number("origin_load_hours", "2")}
        </Field>
        <Field label={copy.pickupSchedule} copy={copy}>
          <CatalogSelect list={SCHEDULE_TYPES} value={lane.origin_schedule} lang={lang} empty={copy.choose} onChange={(origin_schedule) => onChange({ origin_schedule })} />
        </Field>
        <Field label={copy.pickupWindow} copy={copy}>
          <input value={lane.origin_window} placeholder={copy.windowHint} onChange={(e) => onChange({ origin_window: e.target.value })} />
        </Field>
        {/* A spot is one pickup: its date, loads and lead time belong here. */}
        {kind === "spot" && (
          <>
            <Field label={copy.pickupDate} copy={copy}>
              <input type="date" className="mono" value={lane.pickup_date} onChange={(e) => onChange({ pickup_date: e.target.value })} />
            </Field>
            {loads}
            {leadTime}
          </>
        )}
      </div>

      <h4 className="sr-sec-title">{copy.sections.destination}</h4>
      <div className="sr-grid4">
        <PlaceField
          token={token}
          label={copy.destination}
          value={lane.destination}
          lang={lang}
          invalid={bad("destination")}
          onChange={(destination) => onChange({ destination })}
        />
        <Field label={copy.postalCode} required={marks} copy={copy}>
          <PostalInput place={lane.destination} copy={copy} onChange={(destination) => onChange({ destination })} />
        </Field>
        <Field label={copy.facility} copy={copy}>
          <CatalogSelect
            list={FACILITY_TYPES}
            value={lane.destination_facility}
            lang={lang}
            empty={copy.choose}
            onChange={(destination_facility) => onChange({ destination_facility })}
          />
        </Field>
        <Field label={copy.consignee} copy={copy}>
          <input value={lane.destination_consignee} placeholder={copy.companyHint} onChange={(e) => onChange({ destination_consignee: e.target.value })} />
        </Field>
        <Field label={copy.unloadType} required={marks} copy={copy}>
          <CatalogSelect
            list={LOAD_TYPES}
            value={lane.destination_unload_type}
            lang={lang}
            empty={copy.choose}
            onChange={(destination_unload_type) => onChange({ destination_unload_type })}
          />
        </Field>
        <Field label={copy.unloadHours} required={marks} copy={copy}>
          {number("destination_unload_hours", "2")}
        </Field>
        <Field label={copy.deliverySchedule} copy={copy}>
          <CatalogSelect
            list={SCHEDULE_TYPES}
            value={lane.destination_schedule}
            lang={lang}
            empty={copy.choose}
            onChange={(destination_schedule) => onChange({ destination_schedule })}
          />
        </Field>
        <Field label={copy.deliveryWindow} copy={copy}>
          <input value={lane.destination_window} placeholder={copy.windowHint} onChange={(e) => onChange({ destination_window: e.target.value })} />
        </Field>
      </div>

      <h4 className="sr-sec-title">{copy.sections.cargo}</h4>
      <div className="sr-grid4">
        <Field label={copy.truck} required={marks} copy={copy}>
          <CatalogSelect list={TRUCK_TYPES} value={lane.truck} lang={lang} empty={copy.choose} invalid={bad("truck")} onChange={(truck) => onChange({ truck })} />
        </Field>
        <Field label={copy.equipment} required={marks} copy={copy}>
          <CatalogSelect
            list={EQUIPMENT_TYPES}
            value={lane.equipment}
            lang={lang}
            empty={defaults.equipment ? standard(catalogLabel(EQUIPMENT_TYPES, defaults.equipment, lang)) : copy.choose}
            invalid={bad("truck")}
            onChange={(equipment) => onChange({ equipment })}
          />
        </Field>
        <Field label={copy.config} required={marks} copy={copy}>
          <CatalogSelect list={CONFIG_TYPES} value={lane.config} lang={lang} empty={copy.choose} onChange={(config) => onChange({ config })} />
        </Field>
        <WeightInput lane={lane} copy={copy} onChange={onChange} />
        <Field label={copy.commodity} required={marks} copy={copy}>
          <input
            value={lane.commodity}
            placeholder={defaults.commodity ? standard(defaults.commodity) : copy.commodityHint}
            onChange={(e) => onChange({ commodity: e.target.value })}
          />
        </Field>
        <Field label={copy.packaging} required={marks} copy={copy}>
          <CatalogSelect list={PACKAGING_TYPES} value={lane.packaging} lang={lang} empty={copy.choose} onChange={(packaging) => onChange({ packaging })} />
        </Field>
        <Field label={copy.pieces} copy={copy}>
          {number("pieces", "26")}
        </Field>
        <div className="field">
          <span className="sr-field-head">{copy.hazmat}</span>
          <div className="sr-hazmat">
            <select
              value={lane.hazmat ? "Yes" : "No"}
              aria-label={copy.hazmat}
              onChange={(e) => onChange({ hazmat: e.target.value === "Yes", hazmat_un: e.target.value === "Yes" ? lane.hazmat_un : "" })}
            >
              {YES_NO.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry[lang]}
                </option>
              ))}
            </select>
            {lane.hazmat && (
              <input value={lane.hazmat_un} placeholder="UN ####" aria-label={copy.hazmatUn} onChange={(e) => onChange({ hazmat_un: e.target.value })} />
            )}
          </div>
        </div>
        <Field label={copy.invoiceValue} copy={copy}>
          {number("invoice_value", "180,000")}
        </Field>
        <Field label={copy.stacks} copy={copy}>
          {number("stacks")}
        </Field>
        <Field label={copy.cubicMeters} copy={copy}>
          {number("cubic_meters", "m³")}
        </Field>
        <Field label={copy.additionalItems} required={marks} title={copy.additionalItemsTitle} copy={copy}>
          <input value={lane.additional_items} placeholder={copy.additionalItemsHint} onChange={(e) => onChange({ additional_items: e.target.value })} />
        </Field>
      </div>

      {kind === "rfq" && (
        <>
          <h4 className="sr-sec-title">{copy.sections.volume}</h4>
          <div className="sr-grid4">
            {loads}
            <Field label={copy.shipmentKind} required copy={copy}>
              <CatalogSelect list={SHIPMENT_KINDS} value={lane.shipment_kind} lang={lang} empty={copy.choose} onChange={(shipment_kind) => onChange({ shipment_kind })} />
            </Field>
            {leadTime}
            <Field label={copy.annualVolume} copy={copy}>
              {number("annual_volume")}
            </Field>
            <div className="field sr-days-field">
              <span className="sr-field-head">{copy.daily}</span>
              <div className="sr-days">
                {WEEKDAYS.map((day, index) => (
                  <label key={day}>
                    <small>{copy.weekdays[index]}</small>
                    <input
                      inputMode="numeric"
                      className="mono"
                      value={lane.daily[day]}
                      aria-label={`${copy.daily} · ${copy.weekdays[index]}`}
                      onChange={(e) => onChange({ daily: { ...lane.daily, [day]: e.target.value.replace(/[^\d.]/g, "") } })}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <h4 className="sr-sec-title">{copy.sections.segment}</h4>
      <div className="sr-grid4">
        <Field label={copy.segment} copy={copy}>
          <select value={lane.segment} onChange={(e) => onChange({ segment: e.target.value })}>
            <option value="">{segment ? `${copy.auto} · ${segmentLabel(segment, lang)}` : copy.choose}</option>
            {segmentOptions.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry[lang]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.operation} required={marks} copy={copy}>
          <CatalogSelect
            list={OPERATION_TYPES}
            value={lane.operation}
            lang={lang}
            empty={operation ? `${copy.auto} · ${catalogLabel(OPERATION_TYPES, operation, lang)}` : copy.auto}
            onChange={(next) => onChange({ operation: next })}
          />
        </Field>
        {crossing && (
          <>
            <Field label={copy.crossing} required={marks} copy={copy}>
              <CatalogSelect list={BORDER_CROSSINGS} value={lane.border_crossing} lang={lang} empty={copy.choose} onChange={(border_crossing) => onChange({ border_crossing })} />
            </Field>
            <Field label={copy.borderDays} required={marks} copy={copy}>
              {number("border_days", "1")}
            </Field>
            <Field label={copy.broker} copy={copy}>
              <input value={lane.customs_broker} placeholder={copy.companyHint} onChange={(e) => onChange({ customs_broker: e.target.value })} />
            </Field>
            <Field label={copy.transfer} copy={copy}>
              <input value={lane.transfer} placeholder={copy.companyHint} onChange={(e) => onChange({ transfer: e.target.value })} />
            </Field>
          </>
        )}
      </div>

      <h4 className="sr-sec-title">{copy.sections.service}</h4>
      <div className="sr-grid4">
        <Field label={copy.service} required={marks} copy={copy}>
          <CatalogSelect list={SHIPPER_SERVICE_TYPES} value={lane.service} lang={lang} empty={copy.choose} onChange={(service) => onChange({ service })} />
        </Field>
        <Field label={copy.transitDays} copy={copy}>
          {number("transit_days", "2")}
        </Field>
        <Field label={copy.distance} copy={copy}>
          <input value={lane.distance} placeholder={copy.distanceHint} onChange={(e) => onChange({ distance: e.target.value })} />
        </Field>
        <Field label={copy.teamDriver} copy={copy}>
          <YesNo value={lane.team_driver} lang={lang} copy={copy} onChange={(team_driver) => onChange({ team_driver })} />
        </Field>
        <Field label={copy.driverAssist} copy={copy}>
          <YesNo value={lane.driver_assist} lang={lang} copy={copy} onChange={(driver_assist) => onChange({ driver_assist })} />
        </Field>
      </div>

      <h4 className="sr-sec-title">{copy.sections.notes}</h4>
      <textarea rows={2} value={lane.notes} placeholder={copy.notesHint} aria-label={copy.sections.notes} onChange={(e) => onChange({ notes: e.target.value })} />
    </div>
  );
}
