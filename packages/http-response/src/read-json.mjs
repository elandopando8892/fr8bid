export const HTTP_RESPONSE_CONTRACT = "marksman.http-response.v1";

// Decode only. Authentication, HTTP errors and domain validation stay in the app.
export async function readJsonResponse(response, mode) {
  if (mode === "json-or-empty") {
    return { data: await response.json().catch(() => ({})), text: undefined };
  }
  if (mode !== "text-or-error") throw new TypeError("Explicit response policy required");
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  return { data, text };
}
