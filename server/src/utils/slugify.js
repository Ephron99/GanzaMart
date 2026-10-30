// URL-friendly slug helper.
// "Cotton Oxford Men's Shirt" → "cotton-oxford-mens-shirt"
export function slugify(input) {
  return String(input)
    .normalize('NFKD')                      // split accented chars from their marks
    .replace(/[\u0300-\u036f]/g, '')        // drop the marks: é → e
    .toLowerCase()
    .replace(/['’]/g, '')                  // apostrophes disappear rather than become '-'
    .replace(/[^a-z0-9]+/g, '-')            // any other run of chars becomes one '-'
    .replace(/^-+|-+$/g, '')                // trim leading/trailing dashes
    .slice(0, 180);
}

// Append -2, -3, … until the slug is free. `isTaken` is supplied by the caller
// (one COUNT query per candidate), so this helper stays storage-agnostic.
export async function uniqueSlug(base, isTaken) {
  if (!(await isTaken(base))) return base;

  for (let n = 2; n <= 50; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Extremely unlikely; guarantees uniqueness without an infinite loop.
  return `${base}-${Date.now()}`;
}
