/** A place picked from the shared catalog, or typed by the shipper. */
export interface Place {
  id?: number | string | null;
  value: string;
  label?: string | null;
  city?: string | null;
  state_code?: string | null;
  state_name?: string | null;
  country?: string | null;
  zip_prefix?: string | null;
  market?: string | null;
  region?: string | null;
  postal_code?: string | null;
}

export const titleCase = (text: string, spanish = false) => {
  const words = text.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
  // "Estado de Mexico", "San Juan del Rio": inside a Mexican name the particles stay lowercase.
  return spanish ? words.replace(/(?<=\s)(De|Del|La|Las|Los|Y)(?=\s)/g, (word) => word.toLowerCase()) : words;
};

export const plain = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * How a place reads everywhere in the form and the RFI: "Laredo, TX", and in
 * Mexico the state's name ("Saltillo, Coahuila"), since the catalog's MX codes
 * aren't the ones people use.
 */
export function placeText(place: Place | null | undefined): string {
  if (!place) return "";
  const mx = place.country === "MX";
  // The catalog names Mexico City's state "Mexico, DF".
  const stateName = mx && place.state_name ? (/\bDF\b/i.test(place.state_name) ? "CDMX" : titleCase(place.state_name, true)) : null;
  const state = stateName || place.state_code || place.state_name;
  if (place.city && state) return `${titleCase(place.city, mx)}, ${state}`;
  return place.value.trim();
}

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "),
);
const MX_STATES = new Set([
  ..."AGS BC BCS CAMP CHIS CHIH CDMX COAH COL DGO GTO GRO HGO JAL MEX EDOMEX MICH MOR NAY NL OAX PUE QRO QROO SLP SIN SON TAB TAMPS TLAX VER YUC ZAC".split(" "),
  // The location catalog's codes, which the RFI template's examples use ("Ramos Arizpe, CU").
  ..."AG BN BS CH CL CM CS CU DF DU EM GJ GR HG JA MC MR MX NA OA PB QE QR SI SL SO TB TL TM VE YU ZA".split(" "),
]);
const MX_STATE_NAMES = new Set([
  "aguascalientes", "baja california", "baja california sur", "campeche", "chiapas", "chihuahua", "ciudad de mexico",
  "coahuila", "colima", "durango", "guanajuato", "guerrero", "hidalgo", "jalisco", "estado de mexico", "mexico",
  "michoacan", "morelos", "nayarit", "nuevo leon", "oaxaca", "puebla", "queretaro", "quintana roo", "san luis potosi",
  "sinaloa", "sonora", "tabasco", "tamaulipas", "tlaxcala", "veracruz", "yucatan", "zacatecas",
]);
const US_STATE_NAMES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia",
  "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland",
  "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire",
  "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
  "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington",
  "west virginia", "wisconsin", "wyoming", "district of columbia",
]);
/** US codes Mexicans also use for their own states (Coahuila/Colima, Michoacán, Morelos). */
const AMBIGUOUS_CODES = new Set(["CO", "MI", "MO"]);
const COUNTRY_WORDS: Record<string, string> = {
  mx: "MX", mex: "MX", mexico: "MX",
  us: "US", usa: "US", eeuu: "US", "ee uu": "US", "estados unidos": "US", "united states": "US", "united states of america": "US",
  ca: "CA", can: "CA", canada: "CA",
};

/** "México", "USA", "EE.UU." -> a country code. */
export function countryFromWord(word: unknown): string | null {
  return COUNTRY_WORDS[plain(word)] ?? null;
}

/** A complete state token (code or name) that only one country uses. */
export function countryOfState(state: string | null | undefined): string | null {
  const code = String(state ?? "").trim().toUpperCase().replace(/[.\s]/g, "");
  if (!code || AMBIGUOUS_CODES.has(code)) return null;
  if (MX_STATES.has(code)) return "MX";
  if (US_STATES.has(code)) return "US";
  const name = plain(state);
  if (MX_STATE_NAMES.has(name)) return "MX";
  if (US_STATE_NAMES.has(name)) return "US";
  return null;
}

/**
 * A typed place. The country comes from the caller, else from a trailing
 * country ("…, USA") or a state only one country uses; otherwise it stays
 * unknown and the form's country toggle decides.
 */
export function placeFromText(text: string, country?: string | null, postalCode?: string | null): Place | null {
  const value = text.trim();
  if (!value) return null;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const trailing = parts.length >= 3 ? countryFromWord(parts[parts.length - 1]) : null;
  const named = parts.length === 2 && plain(parts[1]).length > 2 ? countryFromWord(parts[1]) : null;
  const state = named ? null : parts[1] ?? null;
  const stateCode = state ? (state.length <= 5 ? state.toUpperCase() : state) : null;
  return {
    value,
    city: parts.length >= 2 ? parts[0] : null,
    state_code: stateCode,
    country: (country ? country.toUpperCase() : null) || trailing || named || countryOfState(state),
    postal_code: postalCode || null,
  };
}
