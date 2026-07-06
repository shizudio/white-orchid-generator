#!/usr/bin/env node
// ── v8 LIKE BACKFILL (ratified item 14) ──────────────────────────────────────
// The client hand-picked the exports in ~/Desktop/claude_is_growing/v8/ — each
// filename IS the export slug the studio wrote (white-orchid-<slugified
// headline>.<ext>, slug truncated to 30 chars). This script matches each file
// to a CLOUD session by exact slug equality against the session's slugified
// headline (then title), emits a like event carrying that session's design
// GENES through /api/feedback, and marks the session liked (+ exportedAt from
// the file's mtime) via /api/sessions — dropped gracefully on an un-migrated
// DB, in which case only the gene events land (they alone power the rotation
// weighting + exemplars).
//
// HONESTY RULE: matches are exact-slug only. Anything ambiguous or unmatched
// is REPORTED, never guessed.
//
// Usage: node scripts/backfill-v8-likes.js [--dry] [--base http://localhost:3100]

const fs = require('fs');
const path = require('path');

const V8_DIR = '/Users/shinamua/Desktop/claude_is_growing/v8';
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:3100';
const DRY = process.argv.includes('--dry');

// EXACT mirror of components/Generator.jsx download()'s slugify.
const slugify = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

// Mirror of lib/sessions buildGenes (server script — no client import).
function buildGenes(st) {
  st = st && typeof st === 'object' ? st : {};
  return {
    archetypeId: st.archetypeId ?? null,
    archVariant: Number.isInteger(st.archVariant) ? st.archVariant : 0,
    bgColor: st.bgColor ?? null,
    photoTreatment: st.photoTreatment ?? null,
    heroRegister: st.heroRegister ?? null,
    postType: st.postType ?? null,
    dimensionId: st.dimensionId ?? null,
    sceneCategory: null, // genBrief isn't persisted on sessions — never guess
  };
}

async function j(url, opts) {
  const res = await fetch(url, opts);
  return res.json().catch(() => ({}));
}

async function main() {
  const files = fs.readdirSync(V8_DIR)
    .filter(f => /^white-orchid-.+\.(png|jpe?g)$/i.test(f))
    .sort();
  console.log(`[v8-backfill] ${files.length} export file(s) in ${V8_DIR}`);

  // Pull EVERY cloud session (active + archived), then its full state.
  const [active, archived] = await Promise.all([
    j(`${BASE}/api/sessions`), j(`${BASE}/api/sessions?archived=1`),
  ]);
  if (active.configured === false && archived.configured === false) {
    console.error('[v8-backfill] cloud sessions unconfigured — nothing to match against.');
    process.exit(2);
  }
  const tiles = [...(active.sessions || []), ...(archived.sessions || [])];
  console.log(`[v8-backfill] ${tiles.length} cloud session(s) (active+archived)`);

  const sessions = [];
  for (const t of tiles) {
    const d = await j(`${BASE}/api/sessions?id=${encodeURIComponent(t.id)}`);
    if (d?.session) sessions.push(d.session);
  }

  const results = [];
  for (const file of files) {
    const slug = file.replace(/^white-orchid-/, '').replace(/\.(png|jpe?g)$/i, '');
    const byHeadline = sessions.filter(s => slugify(s.state?.headline) === slug);
    const byTitle = sessions.filter(s => slugify(s.title) === slug);
    const pool = byHeadline.length ? byHeadline : byTitle;
    if (!pool.length) { results.push({ file, slug, matched: false, reason: 'no session with this slug (headline or title)' }); continue; }
    // Ambiguity → newest updated wins, but say so.
    pool.sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0));
    const s = pool[0];
    const genes = buildGenes(s.state);
    const mtime = fs.statSync(path.join(V8_DIR, file)).mtimeMs;
    results.push({ file, slug, matched: true, sessionId: s.id, title: s.title,
      via: byHeadline.length ? 'headline' : 'title',
      ambiguous: pool.length > 1 ? pool.length : null, genes });
    if (DRY) continue;
    // 1) The like EVENT (genes → rotation weighting + exemplars).
    const ts = new Date().toISOString();
    await j(`${BASE}/api/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turn_id: `t_v8_${slug}`.slice(0, 100), // stable id → re-runs enrich, never duplicate
        session_id: s.id,
        user_message: '[heart] like (v8 backfill — client-picked export)',
        verdict: { kind: 'like', genes, thumb: typeof s.thumb === 'string' && s.thumb.length <= 40 * 1024 ? s.thumb : null, sessionId: s.id, ts, backfill: 'v8' },
      }),
    });
    // 2) liked + exportedAt on the session record (graceful on un-migrated DB).
    await j(`${BASE}/api/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: s.id, title: s.title, thumb: s.thumb, state: s.state,
        conversation: s.conversation || [],
        liked: true, exportedAt: Math.round(mtime),
      }),
    });
  }

  const matched = results.filter(r => r.matched);
  console.log('\n[v8-backfill] REPORT');
  for (const r of results) {
    if (r.matched) console.log(`  ✓ ${r.file} → ${r.sessionId} ("${r.title}") via ${r.via}${r.ambiguous ? ` [${r.ambiguous} candidates, newest kept]` : ''}\n      genes: ${JSON.stringify(r.genes)}`);
    else console.log(`  ✗ ${r.file} — UNMATCHED (${r.reason})`);
  }
  console.log(`\n[v8-backfill] ${matched.length}/${files.length} matched${DRY ? ' (dry run — nothing written)' : ' — likes emitted'}.`);
}

main().catch(e => { console.error('[v8-backfill] FATAL', e); process.exit(1); });
