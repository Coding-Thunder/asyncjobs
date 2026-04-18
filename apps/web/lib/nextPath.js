// Sanitize a `?next=` redirect target from untrusted input.
// Returns the path when safe, or null. A safe path is a same-origin
// absolute path: starts with `/`, but not `//` or `/\` (those are
// protocol-relative URLs that browsers resolve to external origins).
export function sanitizeNextPath(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw[0] !== '/') return null;
  if (raw[1] === '/' || raw[1] === '\\') return null;
  return raw;
}
