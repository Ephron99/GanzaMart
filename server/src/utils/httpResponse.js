// One success envelope for the whole API: { success, data, ...meta }.
// Errors already have the mirror shape { success: false, error } from errorHandler,
// so the React client can branch on `json.success` everywhere.
export function ok(res, data, meta = {}) {
  return res.status(200).json({ success: true, data, ...meta });
}

export function created(res, data, meta = {}) {
  return res.status(201).json({ success: true, data, ...meta });
}

export function noContent(res) {
  return res.status(204).end();
}

// Convert MySQL's DECIMAL strings ("19000.00") to JS numbers at the boundary,
// so React receives plain numbers for display. Arithmetic is done server-side
// in SQL/string space before this point, never after.
export const money = (v) => (v === null || v === undefined ? null : Number(v));
