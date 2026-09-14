/* The predicate that decides whether a backing service failure degrades
   honestly ({configured:false}) or explodes as a 500.

   Written after a live production incident (2026-09-14): the Supabase project
   auto-paused, its host stopped resolving, and /api/brand returned 500 — taking
   the new template gallery's front page down with it — because ten copy-pasted
   copies of this predicate each recognised only "unconfigured" and "no such
   table", never "cannot reach it at all". */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isServiceUnavailable } from '../../lib/service-availability.mjs';

test('the shape that actually took production down is recognised', () => {
  // Exactly what Node throws when the Supabase host no longer resolves.
  assert.equal(isServiceUnavailable(new TypeError('fetch failed')), true);
  const nested = new TypeError('fetch failed');
  nested.cause = Object.assign(new Error('getaddrinfo ENOTFOUND db.supabase.co'), { code: 'ENOTFOUND' });
  assert.equal(isServiceUnavailable(nested), true, 'the real reason nests on .cause');
});

test('unreachable in every ordinary flavour', () => {
  for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']) {
    assert.equal(isServiceUnavailable(Object.assign(new Error('boom'), { code })), true, code);
  }
  assert.equal(isServiceUnavailable(new Error('socket hang up')), true);
});

test('the original two shapes still degrade', () => {
  assert.equal(isServiceUnavailable(Object.assign(new Error('relation does not exist'), { code: '42P01' })), true);
  assert.equal(isServiceUnavailable(new Error('SUPABASE_SERVICE_ROLE_KEY is not set')), true);
  assert.equal(isServiceUnavailable(new Error('could not find the table in the schema cache')), true);
});

test('a REAL error still explodes — degradation is not a blanket catch', () => {
  // If everything degraded, a genuine bug would return 200 {configured:false}
  // and we would never hear about it. These must NOT be swallowed.
  assert.equal(isServiceUnavailable(new Error('duplicate key value violates unique constraint')), false);
  assert.equal(isServiceUnavailable(new Error('permission denied for table brand_kit')), false);
  assert.equal(isServiceUnavailable(new TypeError("Cannot read properties of undefined (reading 'id')")), false);
  assert.equal(isServiceUnavailable(null), false);
  assert.equal(isServiceUnavailable(undefined), false);
});

test('every API route shares the ONE predicate — no route re-derives it', () => {
  // The incident existed because ten routes each owned a copy and every copy had
  // the same blind spot. A local redefinition is how that comes back.
  const apiDir = join(process.cwd(), 'app', 'api');
  const routes = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name === 'route.js') routes.push(p);
    }
  };
  walk(apiDir);
  assert.ok(routes.length >= 10, 'found the API routes');
  for (const p of routes) {
    const src = readFileSync(p, 'utf8');
    assert.ok(!/function\s+isMissingConfig\s*\(/.test(src), `${p}: re-derives the predicate locally`);
    if (src.includes('isServiceUnavailable')) {
      assert.match(src, /service-availability\.mjs/, `${p}: uses the predicate without importing it`);
    }
  }
});
