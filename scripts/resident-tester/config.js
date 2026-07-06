// ── Resident Tester — configuration ──────────────────────────────────────────
// Central knobs for the self-testing loop. Everything the runner needs to know
// about WHERE the app is, HOW LONG it may run, and HOW MUCH it may spend lives
// here so the nightly cron and the deploy hook only have to import this file.

const PORT = Number(process.env.WO_TEST_PORT || 3200);

// ── Cadence mode ─────────────────────────────────────────────────────────────
// Two shapes, one runner. SMOKE (default) runs on every staging deploy: the FULL
// persona pool once, all golden journeys, photos fully mocked (zero credits),
// capped at 30 min / $3. NIGHTLY runs unattended at 02:30 via a scheduled agent:
// the full pool ×2 passes (to catch flakiness), all journeys, PLUS a real-photo
// probe that pays for a hard-capped handful of genuine Higgsfield generations so
// the client can see real images in the report. Capped at 60 min / ~$2 LLM.
const NIGHTLY = process.env.WO_NIGHTLY === '1' || process.argv.includes('--nightly');

// How many REAL Higgsfield generations the run may spend, total, across the whole
// probe phase. Smoke defaults to 0 (fully mocked). Nightly defaults to 2. HARD
// CAPPED at 3 no matter what the env says — the probe must never surprise the
// client with a credit bill.
const REAL_PHOTOS = Math.max(0, Math.min(3, Number(
  process.env.WO_REAL_PHOTOS != null ? process.env.WO_REAL_PHOTOS : (NIGHTLY ? 2 : 0)
)));

module.exports = {
  // Which cadence we're running (drives caps, passes, and the probe phase).
  nightly: NIGHTLY,
  // Hard ceiling on real photo generations for this run (0 = fully mocked).
  realPhotos: REAL_PHOTOS,
  realPhotosHardCap: 3,
  // The runner launches a LOCAL PRODUCTION build (next build + next start) on this
  // port — identical code to staging, but staging itself is behind Vercel SSO, so
  // we run the same bytes locally instead.
  port: PORT,
  baseUrl: `http://localhost:${PORT}`,

  // Hard caps — whichever trips FIRST stops the run. Nightly gets a longer clock
  // (two persona passes + the real-photo probe) but a TIGHTER LLM ceiling, because
  // the probe's real generations are billed by Higgsfield, not counted here — the
  // realPhotos cap above is the guardrail for that spend.
  budget: NIGHTLY
    ? { wallClockMs: 60 * 60 * 1000, estCostUsd: 2.0, usdPerLlmCall: 0.02 }
    : { wallClockMs: 30 * 60 * 1000, estCostUsd: 3.0, usdPerLlmCall: 0.02 },
    // Rough per-call cost estimate for gpt-4o-mini chat turns. The studio's editor
    // chat + landing plan both run on the small model within budget. We count CALLS
    // (a turn is one call) and multiply by this to gate spend. gpt-4o-mini ≈
    // $0.15/1M in, $0.60/1M out; a design turn is ~1.5k in / ~0.4k out ≈ $0.0004.
    // We round UP hard to $0.02/call so the cap is conservative.

  // Fuzzing sample size. SMOKE now runs the FULL persona pool every deploy (smoke
  // is cheap — ~2 min / ~$0.32 — so we buy the extra coverage). NIGHTLY runs the
  // full pool TWICE (a second pass surfaces flaky, non-deterministic behaviour the
  // first pass misses). `targetSamples: Infinity` means "the whole pool"; the
  // runner still trims to fit the remaining clock if a run runs long.
  fuzz: {
    targetSamples: Infinity, // full pool every run (both smoke and nightly)
    minSamples: 6,           // don't bother reporting fewer than this
    nightlyPasses: 2,        // nightly runs the full pool this many times
  },

  // Every synthetic browser marks itself so the app's harness mode (if it honors a
  // marker) and our own oracles can tell test traffic from a real client. We also
  // use a dedicated on-disk profile and BLOCK cloud writes at the network layer.
  syntheticMarker: 'wo-resident-tester',

  // Hosts we hard-block so ZERO credits/cloud rows are ever touched by a test run.
  blockedHosts: [
    'platform.higgsfield.ai',   // photo generation — must never fire (0 credits)
  ],

  // Cloud-write endpoints we intercept so synthetic junk never reaches the client's
  // Supabase brand (verified by a before/after session count).
  blockedApiWrites: [
    { path: '/api/sessions', methods: ['POST'] },
    { path: '/api/feedback', methods: ['POST'] },
  ],
};
