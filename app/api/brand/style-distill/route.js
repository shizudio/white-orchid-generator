/* ─────────────────────────────────────────────────────────────────────────
   STYLE DISTILL — docs/brand-style-dna-spec.md §3 (ratified 2026-08-03)

   POST { imageIds: [1–8 library image ids] }
     → { draft, perImageNotes }        (a DRAFT style block — nothing applies
                                        until the owner saves it via the brand
                                        PATCH: consent to SPEND ≠ consent to ADOPT)
     → { configured:false }            (no OpenAI key / no Supabase — HTTP 200)
     → { failed:true, reason }         (upstream trouble — HTTP 200, never a 500)
     → 400                             (bad ids; >8 is an honest 400, never a
                                        silent slice — this is a PAID pass)
     → 403 / 503                       (admin gate — lib/admin-auth.js, fail-closed)

   Per image: ONE cheap vision call (detail "low", small max_tokens) extracting
   style attributes — HOW it looks, never who is in it. Then ONE synthesis call
   writes the final block; its prompt forbids the brand name (read from the
   brand ROW at request time — zero brand facts in code), all text/poster/logo
   language, and subject-content prescriptions (style ≠ content). The engine
   and every prompt live in lib/style-dna.mjs (pure, mock-tested).

   Imports are RELATIVE (not @/) so scripts/tests can drive this route's gate,
   cap and degradation paths directly under node --test (no alias resolver).
   ───────────────────────────────────────────────────────────────────────── */

import { requireAdminKey } from '../../../../lib/admin-auth.js';
import { getAdminClient } from '../../../../lib/supabase.js';
import { sanitizeAnchorIds, distillStyle } from '../../../../lib/style-dna.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BRAND_ID = '00000000-0000-0000-0000-000000000001';

// Credit-spending endpoint → a tight window (distilling is a deliberate,
// occasional owner action, not a polling loop).
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const requestLog = new Map();
function isRateLimited(request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > MAX_REQUESTS;
}

function unconfigured(extra = {}) {
  return Response.json({ configured: false, ...extra });
}
function isMissingConfig(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || /not set|not configured|does not exist|schema cache/i.test(msg);
}

export async function POST(request) {
  if (isRateLimited(request)) {
    return Response.json({ error: 'One moment — please wait a minute and try again.' }, { status: 429 });
  }

  // Credit-spending gate FIRST (fail-closed: unconfigured key → 503).
  const denied = requireAdminKey(request);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  const { ids, error: idError } = sanitizeAnchorIds(body?.imageIds);
  if (idError) return Response.json({ error: idError }, { status: 400 });

  // Graceful degradation: no OpenAI key → the feature is honestly unavailable.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return unconfigured();

  let supabase;
  try { supabase = getAdminClient(); } catch { return unconfigured(); }

  try {
    // Resolve the chosen anchors to signed URLs (same storage flow as /api/images).
    const { data: rows, error: dbError } = await supabase
      .from('images')
      .select('id, storage_path, filename')
      .in('id', ids);
    if (dbError) {
      if (isMissingConfig(dbError)) return unconfigured();
      return Response.json({ failed: true, reason: 'The library could not be read just now.' });
    }
    if (!rows?.length) {
      return Response.json({ failed: true, reason: 'Those images were not found in the library.' });
    }
    const paths = rows.map((r) => r.storage_path);
    const { data: signed } = await supabase.storage.from('images').createSignedUrls(paths, 600);
    const urlMap = {};
    (signed || []).forEach((s) => { urlMap[s.path] = s.signedUrl; });
    const images = rows
      .map((r) => ({ id: r.id, url: urlMap[r.storage_path] || null }))
      .filter((img) => img.url);
    if (!images.length) {
      return Response.json({ failed: true, reason: 'The chosen photos could not be loaded from storage.' });
    }

    // The banned name is DATA from the brand row (zero-brand-facts) — a
    // missing row/column degrades to no name ban, never a failure.
    let bannedNames = [];
    try {
      const { data: kit } = await supabase.from('brand_kit').select('name').eq('id', BRAND_ID).single();
      if (kit?.name) bannedNames = [kit.name];
    } catch { /* no name ban — the generic proper-noun rule still applies */ }

    const result = await distillStyle({
      images,
      apiKey,
      model: process.env.OPENAI_STYLE_MODEL || 'gpt-4o-mini',
      bannedNames,
    });
    if (result.failed) return Response.json({ failed: true, reason: result.reason });
    return Response.json({ draft: result.draft, perImageNotes: result.perImageNotes });
  } catch (err) {
    if (isMissingConfig(err)) return unconfigured();
    return Response.json({ failed: true, reason: 'Distilling hit a snag — please try again.' });
  }
}
