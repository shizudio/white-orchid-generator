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

// (2.4 data hygiene) Load FEEDBACK_DEV_KEY from .env.local (Node doesn't auto-load
// it like Next does) so a RE-RUN can read back the like events it already wrote and
// PRESERVE their original at-like-time genes. Without this, a re-run recomputes genes
// from the session's CURRENT state and — because the stable turn_id makes the second
// POST an enrichment that replaces the whole `verdict` — silently overwrites the
// snapshot with drifted state (3 of the 6 seed sessions were edited after the first
// backfill; their live state no longer equals what was liked). The rotation weights +
// exemplars in lib/preferences.js read exactly this event `verdict.genes`, so that
// corruption would flow straight into the priors. --key <k> overrides the env value.
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  let raw;
  try { raw = fs.readFileSync(envPath, 'utf8'); } catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (m[1] in process.env && process.env[m[1]] !== '') continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}
loadEnvLocal();
const DEV_KEY = process.argv.includes('--key')
  ? process.argv[process.argv.indexOf('--key') + 1]
  : process.env.FEEDBACK_DEV_KEY || null;

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

  // (2.4) Re-run safety: pull the like events we may have written on a prior run so we
  // can PRESERVE their original genes rather than overwrite them with drifted state.
  // Keyed by turn_id (t_v8_<slug>). Requires the dev key; without it we cannot verify
  // and MUST NOT write (a blind re-run would clobber the snapshot) — so we refuse a
  // non-dry run and tell the operator how to unblock. A dry run never writes, so it's
  // always allowed to proceed (and still reports what it WOULD do).
  const priorGenesByTurn = new Map();
  if (DEV_KEY) {
    const fb = await j(`${BASE}/api/feedback?key=${encodeURIComponent(DEV_KEY)}&limit=500`);
    if (fb && Array.isArray(fb.events)) {
      for (const e of fb.events) {
        const v = e && e.verdict;
        if (v && v.kind === 'like' && v.backfill === 'v8' && e.turn_id && v.genes && typeof v.genes === 'object') {
          if (!priorGenesByTurn.has(e.turn_id)) priorGenesByTurn.set(e.turn_id, { genes: v.genes, ts: v.ts || e.created_at || null });
        }
      }
    }
    console.log(`[v8-backfill] prior v8 like snapshot(s) found: ${priorGenesByTurn.size} (their genes will be preserved, not recomputed).`);
  } else if (!DRY) {
    console.error('[v8-backfill] REFUSING to write without FEEDBACK_DEV_KEY: a re-run cannot verify existing snapshots and would risk overwriting the original at-like-time genes with the sessions\' current (possibly drifted) state. Set FEEDBACK_DEV_KEY (it is in .env.local) or pass --key <k>. Use --dry to preview safely.');
    process.exit(3);
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
    const turnId = `t_v8_${slug}`.slice(0, 100); // stable id → re-runs enrich, never duplicate
    // (2.4) PRESERVE the original at-like-time snapshot on a re-run: if we already
    // wrote a like event for this slug, reuse its genes verbatim instead of rebuilding
    // from the session's current (possibly drifted) state. Only capture fresh genes on
    // the FIRST write, when there is nothing to preserve.
    const prior = priorGenesByTurn.get(turnId);
    const genes = prior ? prior.genes : buildGenes(s.state);
    const preserved = !!prior;
    const mtime = fs.statSync(path.join(V8_DIR, file)).mtimeMs;
    results.push({ file, slug, matched: true, sessionId: s.id, title: s.title,
      via: byHeadline.length ? 'headline' : 'title',
      ambiguous: pool.length > 1 ? pool.length : null, genes, preserved });
    if (DRY) continue;
    // 1) The like EVENT (genes → rotation weighting + exemplars). Keep the ORIGINAL ts
    // when preserving so the like's identity/ordering is stable across re-runs.
    const ts = prior && prior.ts ? prior.ts : new Date().toISOString();
    await j(`${BASE}/api/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turn_id: turnId,
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
    if (r.matched) console.log(`  ✓ ${r.file} → ${r.sessionId} ("${r.title}") via ${r.via}${r.ambiguous ? ` [${r.ambiguous} candidates, newest kept]` : ''}${r.preserved ? ' [genes PRESERVED from prior run — session has since drifted]' : ''}\n      genes: ${JSON.stringify(r.genes)}`);
    else console.log(`  ✗ ${r.file} — UNMATCHED (${r.reason})`);
  }
  console.log(`\n[v8-backfill] ${matched.length}/${files.length} matched${DRY ? ' (dry run — nothing written)' : ' — likes emitted'}.`);
}

main().catch(e => { console.error('[v8-backfill] FATAL', e); process.exit(1); });
