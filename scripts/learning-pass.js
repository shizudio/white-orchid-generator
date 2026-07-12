#!/usr/bin/env node
// ── NIGHTLY LEARNING PASS — moodboard reconsolidation (P1 §3 + P2 §4) ─────────
// docs/moodboard-templates-spec.md §3 (nightly reconsolidation + pattern ledger)
// and §4 (proposal cadence). This is the machine half of the learning ritual in
// docs/self-improvement-loop.md §4 — it GATHERS and REPORTS; nothing here
// self-applies. The only rows it ever writes are (a) genes onto brand_moodboard
// rows that have none, and (b) a design_templates row with status:'proposed'
// that a HUMAN must gate through the review pop-up (spec §5) before it exists
// anywhere a user can see.
//
// WHAT ONE RUN DOES, IN ORDER
//   1. BACKFILL — classify up to BACKFILL_CAP (20) gene-less brand_moodboard
//      rows via lib/moodboard-genes classifyMoodboardImage (one cheap vision
//      call each — the SAME classifier the upload path uses, never re-implemented
//      here). Oldest first, so the original board is worked through before new
//      uploads. Rows that fail classification stay genes:null and are retried
//      on later nights (the cap makes cost boring: ≤20 cheap calls/night).
//   2. AGGREGATE — getLikePreferences() (hearts 1.0 + moodboard genes 0.5; a
//      fresh process = a fresh cache, so this run always recomputes).
//   3. PATTERN LEDGER — buildPatternLedger over the classified rows: device /
//      palette / register / density frequencies, expressibility, and the
//      strongest under-served cluster. Written into the report (spec §3 —
//      "evidence, not action").
//   4. PROPOSAL — synthesizeProposalRun: respects PROPOSAL_COOLDOWN_DAYS (5)
//      and the one-pending limit; inserts a status:'proposed' row only when
//      every gate clears and the composed state passes the born-clean precheck.
//
// GRACEFUL: env absent, table absent, or the un-migrated DB (no genes/status
// columns yet) all degrade to a report that SAYS so and exit 0 — never a throw.
//
// Usage:  node scripts/learning-pass.js [--dry-run] [--propose-now] [--no-report]
//   --dry-run      compose + report the proposal but do NOT insert it
//   --propose-now  bypass the 5-day cooldown ("propose a template now" — spec §4;
//                  the one-pending limit still holds, force never bypasses it)
//   --no-report    print to stdout only; skip writing generated/learning-pass/
// Report lands at generated/learning-pass/<YYYY-MM-DD>.md (gitignored — evidence
// for the human ritual, not repo history; M10).
//
// lib/ modules use the Next '@/…' alias AND ESM syntax in .js files (Next
// transpiles them; plain Node would parse them as CJS since package.json has no
// "type":"module"). This entry registers a tiny module hook (data: URL — no
// second file) that (a) maps '@/x' → <repo>/x and (b) forces format:'module'
// for <repo>/lib/*.js, before any lib import happens.

const fs = require('fs');
const path = require('path');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

// Node doesn't auto-load .env.local the way Next does (same pattern as
// scripts/backfill-v8-likes.js — shell env wins over the file).
function loadEnvLocal() {
  let raw;
  try { raw = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8'); } catch { return; }
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

const rootHref = pathToFileURL(ROOT + path.sep).href;
register(
  'data:text/javascript,' + encodeURIComponent(
    `import { readFileSync } from 'node:fs';
     import { fileURLToPath } from 'node:url';
     const ROOT = '${rootHref}';
     export function resolve(specifier, context, next) {
       if (specifier.startsWith('@/')) {
         // Next's alias is extensionless; ESM resolution wants the file — add .js.
         const rel = /\\.(js|mjs|cjs|json)$/.test(specifier) ? specifier.slice(2) : specifier.slice(2) + '.js';
         return next(new URL(rel, ROOT).href, context);
       }
       return next(specifier, context);
     }
     export async function load(url, context, next) {
       if (url.startsWith(ROOT + 'lib/') && url.endsWith('.js')) {
         return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true };
       }
       return next(url, context);
     }`
  ),
  rootHref
);

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
const BACKFILL_CAP = 20;   // ≤20 cheap vision calls per night (spec §2 "capped per night")

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--propose-now');
const NO_REPORT = process.argv.includes('--no-report');

function isMissingColumn(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42703' || /column .* does not exist/i.test(msg);
}

// ── 1 · Backfill (≤ BACKFILL_CAP gene-less rows, oldest first) ────────────────
async function backfillGenes(supabase, classifyMoodboardImage) {
  const out = { attempted: 0, classified: 0, failed: 0, remaining: null, unmigrated: false, error: null };
  let rows;
  try {
    const q = await supabase
      .from('brand_moodboard')
      .select('id, image', { count: 'exact' })
      .eq('brand_id', BRAND_ID)
      .is('genes', null)
      .order('ts', { ascending: true })
      .limit(BACKFILL_CAP);
    if (q.error) {
      if (isMissingColumn(q.error)) { out.unmigrated = true; return out; }
      out.error = q.error.message; return out;
    }
    rows = q.data || [];
    out.remaining = Math.max(0, (q.count || rows.length) - rows.length);
  } catch (err) { out.error = String(err?.message || err); return out; }

  for (const row of rows) {
    out.attempted++;
    const genes = await classifyMoodboardImage(row.image); // null on ANY problem — never throws
    if (!genes) { out.failed++; continue; }
    const upd = await supabase
      .from('brand_moodboard')
      .update({ genes })
      .eq('id', row.id)
      .eq('brand_id', BRAND_ID)
      .is('genes', null); // idempotent guard: never clobber a row classified since we read it
    if (upd.error) { out.failed++; continue; }
    out.classified++;
  }
  return out;
}

// ── Report rendering ─────────────────────────────────────────────────────────
function pct(share) { return `${Math.round(share * 100)}%`; }
function freqLines(freq) {
  if (!freq?.length) return ['  (none classified)'];
  return freq.map(f => `  - ${f.value}: ${f.count} (${pct(f.share)})`);
}

function renderReport({ when, backfill, prefs, ledger, proposal }) {
  const L = [];
  L.push(`# Learning pass — ${when.toISOString()}`);
  L.push('');
  L.push('Nightly moodboard reconsolidation (docs/moodboard-templates-spec.md §3/§4).');
  L.push('Evidence, not action — nothing in this report self-applies.');
  L.push('');
  L.push('## Backfill (gene classification)');
  if (backfill.unmigrated) {
    L.push('- SKIPPED — the `genes` column does not exist yet (re-run lib/schema.sql in Supabase).');
  } else if (backfill.error) {
    L.push(`- SKIPPED — ${backfill.error}`);
  } else {
    L.push(`- attempted ${backfill.attempted} (cap ${BACKFILL_CAP}/night), classified ${backfill.classified}, failed ${backfill.failed} (retried next night), still unclassified after this run: ${backfill.remaining + backfill.failed}`);
  }
  L.push('');
  L.push('## Aggregate (hearts 1.0 + moodboard 0.5)');
  L.push(`- configured: ${prefs.configured} · liked sessions: ${prefs.likedCount} · classified moodboard rows folded: ${prefs.moodboardCount ?? 0}`);
  L.push('');
  L.push('## Pattern ledger (spec §3)');
  if (!ledger || !ledger.moodboardCount) {
    L.push('- No classified moodboard rows yet — the ledger is empty.');
  } else {
    L.push(`Classified moodboard images: ${ledger.moodboardCount}`);
    L.push('');
    L.push('### Composition devices (frequency · expressibility · like-served share)');
    for (const d of ledger.devices) {
      L.push(`  - ${d.device}: ${d.count} (${pct(d.share)}) — ${d.expressible ? `expressible via ${d.archetypes.join(', ')}` : 'NOT yet expressible with brand elements'} · served by hearts: ${pct(d.served)} · under-served score: ${d.underservedScore.toFixed(3)}`);
    }
    L.push('');
    L.push('### Palette classes'); L.push(...freqLines(ledger.paletteFreq));
    L.push('### Type registers'); L.push(...freqLines(ledger.registerFreq));
    L.push('### Density'); L.push(...freqLines(ledger.densityFreq));
    L.push('');
    L.push(`Strongest under-served expressible cluster: ${ledger.strongest ? `**${ledger.strongest.device}** (score ${ledger.strongest.underservedScore.toFixed(3)})` : 'none'}`);
  }
  L.push('');
  L.push('## Proposal run (spec §4)');
  if (!proposal) {
    L.push('- Not attempted (unconfigured).');
  } else if (proposal.proposed) {
    L.push(`- ${proposal.dryRun ? 'DRY RUN — would propose' : 'PROPOSED'}${proposal.forced ? ' (cooldown bypassed on request)' : ''}: "${proposal.plan.cluster.device}" via ${proposal.plan.state.archetypeId} on ${proposal.plan.state.bgColor}${proposal.row ? ` → row ${proposal.row.id}` : ''}`);
    L.push(`- rationale: ${proposal.plan.rationale}`);
    L.push(`- sources: ${proposal.plan.sourceIds.join(', ')}`);
    L.push('- precheck: enum-clean; needsRenderCheck:true (the real 6-format born-clean render is the review pop-up\'s gate — P3).');
  } else {
    const why = {
      'unconfigured': 'cloud unconfigured, table absent, or the P1/P2 columns not yet migrated (re-run lib/schema.sql)',
      'no-classified-moodboard': 'no classified moodboard rows to mine',
      'pending-exists': `a proposal is already awaiting review (${proposal.pending ?? 1} pending — limit 1; force never bypasses this)`,
      'cooldown': `inside the ${5}-day cooldown (${(proposal.cooldownRemainingDays ?? 0).toFixed(1)} days remain)`,
      'no-expressible-cluster': 'no under-served cluster is expressible with brand elements',
      'precheck-failed': `composed state failed the born-clean precheck — discarded, never surfaced (${(proposal.precheck?.reasons || []).join('; ')})`,
      'insert-failed': `insert failed: ${proposal.error}`,
      'insert-threw': `insert threw: ${proposal.error}`,
    }[proposal.reason] || proposal.reason;
    L.push(`- No proposal this run — ${why}.`);
  }
  L.push('');
  return L.join('\n');
}

// ── The run ──────────────────────────────────────────────────────────────────
async function main() {
  // Dynamic imports so the '@/…' resolve hook above is active first.
  const { classifyMoodboardImage } = await import('../lib/moodboard-genes.js');
  const { getLikePreferences } = await import('../lib/preferences.js');
  const { buildPatternLedger, fetchClassifiedMoodboard, synthesizeProposalRun } = await import('../lib/proposal-engine.js');

  const when = new Date();
  let supabase = null;
  try {
    const { getAdminClient } = await import('../lib/supabase.js');
    supabase = getAdminClient();
  } catch {
    // Env absent: still produce an honest report (everything degraded).
  }

  const backfill = supabase
    ? await backfillGenes(supabase, classifyMoodboardImage)
    : { attempted: 0, classified: 0, failed: 0, remaining: null, unmigrated: false, error: 'Supabase env not set' };

  const prefs = await getLikePreferences(); // never throws; EMPTY when unconfigured

  let ledger = null;
  let proposal = null;
  if (supabase) {
    const mb = await fetchClassifiedMoodboard(supabase);
    ledger = buildPatternLedger(mb.rows, prefs.counts || {});
    proposal = await synthesizeProposalRun(supabase, {
      force: FORCE, dryRun: DRY_RUN, counts: prefs.counts || {},
    });
  }

  const report = renderReport({ when, backfill, prefs, ledger, proposal });
  console.log(report);

  if (!NO_REPORT) {
    const dir = path.join(ROOT, 'generated', 'learning-pass');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${when.toISOString().slice(0, 10)}.md`);
    fs.writeFileSync(file, report);
    console.log(`[learning-pass] report written → ${path.relative(ROOT, file)}`);
  }
}

main().catch(e => {
  // The pass itself must be boring: log and exit 0 so a cron wrapper never pages.
  console.error('[learning-pass] degraded (non-fatal):', e?.message || e);
});
