// Si un evento acepta invitaciones. Se lee al mostrar la página y se vuelve a
// confirmar justo antes de preparar borradores.
type EventLike = { status?: unknown; due_date?: unknown } | null | undefined;

export function isEventClosed(event: EventLike, now = Date.now()): boolean {
  if (!event) return false;
  const status = String(event.status ?? "").toLowerCase();
  const due = event.due_date ? Date.parse(`${String(event.due_date).slice(0, 10)}T23:59:59-06:00`) : NaN;
  return ["closed", "awarded", "archived", "cancelled"].includes(status) || (Number.isFinite(due) && due < now);
}

/**
 * Justo antes de preparar invitaciones se exige lo contrario: un estado abierto
 * conocido y, si trae plazo, uno legible y futuro. Ante la duda, no se prepara.
 */
export function isEventConfirmedOpen(event: EventLike, now = Date.now()): boolean {
  if (!event) return false;
  const status = String(event.status ?? "").toLowerCase();
  if (!["draft", "open", "live", "published"].includes(status)) return false;
  if (!event.due_date) return true;
  const due = Date.parse(`${String(event.due_date).slice(0, 10)}T23:59:59-06:00`);
  return Number.isFinite(due) && due >= now;
}
