/* ── WHEN A BACKING SERVICE IS SIMPLY NOT THERE ──────────────────────────────
   The graceful-degradation contract (operating-manual.md §4) says an env/table/
   connection problem degrades to { configured:false } (HTTP 200) — NEVER a 500.

   Ten API routes each carried their own copy of this predicate, and every copy
   recognised only two shapes: missing env ("not set", "not configured") and a
   missing table (Postgres 42P01). None of them recognised the database being
   UNREACHABLE.

   That gap had teeth. On 2026-09-14 the Supabase project auto-paused, its host
   stopped resolving, and `fetch` threw "TypeError: fetch failed" — matching no
   pattern — so /api/brand returned 500 instead of degrading. The new template
   gallery reads the brand palette to paint its cards, so a paused database took
   down the front page rather than showing honest empty cards.

   An unreachable service is the same class of fact as an unconfigured one: we
   cannot answer, and saying so is the honest response. This is the one shared
   predicate; routes import it instead of re-deriving it. */

const UNAVAILABLE_CODES = new Set([
  '42P01',      // Postgres: undefined_table
  'ENOTFOUND',  // DNS: host does not resolve (a paused project)
  'EAI_AGAIN',  // DNS: temporary failure
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const UNAVAILABLE_PATTERNS =
  /not set|not configured|does not exist|schema cache|fetch failed|failed to fetch|getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|network|socket hang up|timed? ?out|terminated/i;

/** True when the backing service cannot answer: unconfigured, missing, or unreachable. */
export function isServiceUnavailable(err) {
  if (!err) return false;
  if (UNAVAILABLE_CODES.has(err.code)) return true;
  // fetch failures nest the real reason on `cause`.
  if (err.cause && isServiceUnavailable(err.cause)) return true;
  return UNAVAILABLE_PATTERNS.test(String(err?.message || err || ''));
}
