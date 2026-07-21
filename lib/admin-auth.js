/* ─────────────────────────────────────────────────────────────────────────
   ADMIN-KEY GATE — the fail-closed guard for the dev/admin routes that either
   spend real credits (brand-library, feed-photo) or write the live brand kit
   (brand PATCH). Phase-0 hardening (docs/milestone-audit-2026-07-21.md §6):
   before this, those routes were public, unauthenticated and unthrottled — a
   direct financial-abuse / brand-vandalism vector (tech-audit-full.md §4).

   Contract:
     • env WO_ADMIN_KEY unset       → 503 { configured:false }  (fail CLOSED —
                                       an unconfigured gate is NEVER open)
     • header x-wo-admin-key wrong  → 403
     • header x-wo-admin-key absent → 403
     • correct header               → null  (caller proceeds)

   This is a single shared OWNER secret (uuid-strength), not per-user auth —
   real tenant identity/RLS is Phase 1 (docs/multi-tenancy-spec.md §P2). The
   compare is constant-time so the gate leaks no timing signal about the secret.
   Set WO_ADMIN_KEY in the server environment (.env.local locally, Vercel env in
   deploys); never commit a real value.
   ───────────────────────────────────────────────────────────────────────── */

import { timingSafeEqual } from 'crypto';

export const ADMIN_KEY_HEADER = 'x-wo-admin-key';

// Length is not itself a secret, so an early length mismatch is safe; equal
// lengths go through timingSafeEqual so no per-byte timing leaks.
function safeEqual(provided, expected) {
  const a = Buffer.from(String(provided ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Returns null when the request is authorised; otherwise the Response to return.
// Routes call this FIRST (after any rate-limit) and short-circuit on a Response.
export function requireAdminKey(request) {
  const expected = process.env.WO_ADMIN_KEY;
  if (!expected) {
    // No key configured → the gate can't be satisfied, so the route is
    // unavailable rather than silently open. {configured:false} reuses the
    // graceful-degradation shape the client already understands.
    return Response.json(
      { configured: false, error: 'Admin key not configured on this server.' },
      { status: 503 },
    );
  }
  const provided = request.headers.get(ADMIN_KEY_HEADER) || '';
  if (!safeEqual(provided, expected)) {
    return Response.json({ error: 'Forbidden — a valid admin key is required.' }, { status: 403 });
  }
  return null;
}
