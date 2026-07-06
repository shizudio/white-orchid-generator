// ── Resident Tester — configuration ──────────────────────────────────────────
// Central knobs for the self-testing loop. Everything the runner needs to know
// about WHERE the app is, HOW LONG it may run, and HOW MUCH it may spend lives
// here so a future nightly cron only has to import this file.

const PORT = Number(process.env.WO_TEST_PORT || 3200);

module.exports = {
  // The runner launches a LOCAL PRODUCTION build (next build + next start) on this
  // port — identical code to staging, but staging itself is behind Vercel SSO, so
  // we run the same bytes locally instead.
  port: PORT,
  baseUrl: `http://localhost:${PORT}`,

  // Hard caps — whichever trips FIRST stops the run.
  budget: {
    wallClockMs: 30 * 60 * 1000,   // 30 minutes
    estCostUsd: 3.0,               // ~$3 of LLM spend
    // Rough per-call cost estimate for gpt-4o-mini chat turns. The studio's
    // editor chat + landing plan both run on the small model within budget. We
    // count CALLS (a turn is one call) and multiply by this to gate spend.
    // gpt-4o-mini ≈ $0.15/1M in, $0.60/1M out; a design turn is ~1.5k in / ~0.4k
    // out ≈ $0.0004. We round UP hard to $0.02/call so the cap is conservative.
    usdPerLlmCall: 0.02,
  },

  // Fuzzing sample size per smoke run (trimmed further if the clock runs low).
  fuzz: {
    targetSamples: 13,   // ~10–15 utterances per run
    minSamples: 6,       // don't bother reporting fewer than this
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
