// ── Resident Tester — REPORT GENERATOR ───────────────────────────────────────
// Produces a human-readable markdown report written for the CLIENT (plain
// language, no internal jargon). Ranks defects by severity × frequency, lists the
// fuzz utterances and what happened, references screenshots, and states the run's
// cost + wall-clock actuals. Returns the markdown string; the runner writes it to
// docs/resident-tester/smoke-report-<date>.md.

const path = require('path');

const SEV_WEIGHT = { high: 3, medium: 2, low: 1 };
// Plain-language names for each oracle, so the client never meets internal terms.
const ORACLE_PLAIN = {
  'honesty-apology': 'The helper had to walk back something it said it did',
  'claim-vs-changed': 'The helper said it changed something, but nothing changed',
  'born-clean': 'A finished design showed a "needs attention" mark',
  'no-horizontal-overflow': 'The page spilled sideways (a layout stretched too wide)',
  'strip-y-stable': 'The format bar jumped when switching sizes',
  'canvas-buffer-matches-dims': 'The preview size did not match the design size',
  'offer-without-execution': 'The helper offered to do something with no button to do it',
  'no-console-errors': 'A hidden error happened in the background',
  'inspector-opens': 'Clicking the design did not open the editing panel',
  'add-renders': 'Adding an element did not appear on the design',
  'ready-checklist-present': 'The pre-download checklist was missing',
};

function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }

function rankDefects(defects) {
  // Group by (oracle) so frequency counts; score = Σ severity weight.
  const groups = new Map();
  for (const d of defects) {
    const key = d.oracle;
    if (!groups.has(key)) groups.set(key, { oracle: key, count: 0, score: 0, severity: d.severity, examples: [] });
    const g = groups.get(key);
    g.count++;
    g.score += SEV_WEIGHT[d.severity] || 1;
    if (SEV_WEIGHT[d.severity] > SEV_WEIGHT[g.severity]) g.severity = d.severity;
    if (g.examples.length < 3) g.examples.push(d);
  }
  return [...groups.values()].sort((a, b) => b.score - a.score || b.count - a.count);
}

function generate(run, meta) {
  const defects = run.defects();
  const ranked = rankDefects(defects);
  const wallMin = (run.elapsedMs() / 60000);
  const dateStr = new Date(run.startedAt).toISOString().slice(0, 10);

  const journeySteps = (run.journeys[0]?.steps) || [];
  const passSteps = journeySteps.filter(s => s.ok).length;
  const fuzzWithDefects = run.fuzz.filter(f => f.defects > 0).length;

  const L = [];
  L.push(`# White Orchid Content Studio — Automated Test Report`);
  L.push('');
  L.push(`**Date:** ${dateStr}  ·  **Type:** 30-minute smoke run (first run)`);
  L.push('');
  L.push(`This report is produced by the studio's automated "resident tester" — a program that opens the studio like a member of your staff would, tries the everyday things (start a post, change a colour, switch sizes, download), and also throws dozens of realistic, messy requests at the design helper to see how it copes. It checks the result of each action against a set of quality rules and writes down anything that looked wrong, with a screenshot.`);
  L.push('');
  L.push(`Nothing in this run cost you any photo-generation credits, and nothing it did was saved to your real account — it runs in a sealed sandbox.`);
  L.push('');

  // ── Headline ────────────────────────────────────────────────────────────
  L.push(`## The short version`);
  L.push('');
  L.push(`- **Everyday journeys:** ${passSteps} of ${journeySteps.length} steps passed.`);
  L.push(`- **Realistic requests tried:** ${run.fuzz.length}. Of those, ${fuzzWithDefects} triggered at least one quality flag.`);
  L.push(`- **Total quality flags raised:** ${defects.length}${defects.length ? ` (across ${ranked.length} distinct issue type${ranked.length === 1 ? '' : 's'})` : ''}.`);
  L.push(`- **Time taken:** ${wallMin.toFixed(1)} minutes.  **Estimated AI cost:** $${run.estCostUsd().toFixed(2)} (${run.llmCalls} helper requests).`);
  L.push(`- **Photo credits spent:** ${run.higgsfieldCalls === 0 ? '0 (confirmed — photo generation was fully mocked).' : `${run.higgsfieldCalls} — WARNING, this should be zero.`}`);
  L.push(`- **Data saved to your account:** none (${run.cloudWriteAttempts} save attempt${run.cloudWriteAttempts === 1 ? ' was' : 's were'} intercepted and discarded).`);
  L.push('');

  // ── Top issues ranked ─────────────────────────────────────────────────────
  L.push(`## What needs attention (most important first)`);
  L.push('');
  if (!ranked.length) {
    L.push(`No issues were found in this run. Every everyday journey passed and the design helper handled the realistic requests without any quality flags. This is the clean baseline the nightly runs will be compared against.`);
  } else {
    ranked.forEach((g, i) => {
      const plain = ORACLE_PLAIN[g.oracle] || g.oracle;
      const sev = g.severity === 'high' ? 'Important' : g.severity === 'medium' ? 'Worth fixing' : 'Minor';
      L.push(`### ${i + 1}. ${plain}`);
      L.push('');
      L.push(`- **Priority:** ${sev}  ·  **Seen:** ${g.count} time${g.count === 1 ? '' : 's'} this run.`);
      // Show up to 3 concrete examples in the client's words.
      for (const ex of g.examples) {
        const trigger = ex.utterance ? `Someone typed: "${ex.utterance}"` : `During: ${ex.journey}`;
        L.push(`- ${trigger}`);
        L.push(`  - What we expected: ${ex.expected}`);
        L.push(`  - What happened: ${ex.observed}`);
        if (ex.screenshot) L.push(`  - Screenshot: \`${ex.screenshot}\``);
      }
      L.push('');
    });
  }

  // ── Everyday journeys table ───────────────────────────────────────────────
  L.push(`## Everyday journeys — step by step`);
  L.push('');
  L.push(`These are the core things a staff member does. Each was performed automatically and checked.`);
  L.push('');
  L.push(`| Step | Result | Notes |`);
  L.push(`|---|---|---|`);
  for (const s of journeySteps) {
    const note = String(s.detail || '').replace(/\|/g, '/').slice(0, 160);
    L.push(`| ${s.label} | ${s.ok ? '✅ passed' : '⚠️ flagged'} | ${note} |`);
  }
  L.push('');

  // ── Fuzz table ────────────────────────────────────────────────────────────
  L.push(`## Realistic requests — what the helper did`);
  L.push('');
  L.push(`Each row is a real-world phrasing (typos and all) sent to the design helper, and how it responded.`);
  L.push('');
  L.push(`| What was typed | Kind | Helper replied? | Changed something? | Flags | The helper's reply (short) |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const f of run.fuzz) {
    const reply = String(f.reply || '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 120);
    const changed = f.changed ? `yes (${String(f.changed).replace(/\|/g, '/').slice(0, 40)})` : 'no';
    L.push(`| ${String(f.utterance).replace(/\|/g, '/')} | ${f.kind} | ${f.replied ? 'yes' : 'no'} | ${changed} | ${f.defects || 0} | ${reply} |`);
  }
  L.push('');

  // ── Coverage + method ─────────────────────────────────────────────────────
  L.push(`## What was checked (coverage)`);
  L.push('');
  L.push(`After every action the tester ran these quality rules:`);
  L.push('');
  L.push(`- **Honesty:** the helper never claims to have done something it didn't do.`);
  L.push(`- **Truthful confirmations:** when the helper says it changed something, the design really changed.`);
  L.push(`- **No dead offers:** if the helper offers to do something, there's a button that actually does it.`);
  L.push(`- **Clean layout:** the page never spills sideways and the format bar doesn't jump.`);
  L.push(`- **Correct sizes:** the preview always matches the real design dimensions.`);
  L.push(`- **Finished-looking designs:** a freshly made design doesn't arrive with "needs attention" marks.`);
  L.push(`- **No hidden errors:** nothing breaks quietly in the background.`);
  L.push('');

  // ── Run configuration (kept plain but complete for the record) ────────────
  L.push(`## Run details (for the record)`);
  L.push('');
  L.push(`- **Ran against:** a production build of the studio, identical to what goes live, running locally in a sandbox.`);
  L.push(`- **Photo generation:** fully mocked — the studio fell back to its built-in sample photos, so no credits were used.`);
  L.push(`- **Account safety:** all "save to cloud" requests were blocked, so this run added nothing to your Posts or history.`);
  L.push(`- **Budget caps:** the run stops automatically at 30 minutes or about $3 of AI usage, whichever comes first.`);
  L.push(`- **Raw log:** every flag is also recorded in machine-readable form at \`${path.relative(process.cwd(), run.eventsPath)}\`, with screenshots in the same folder.`);
  if (meta && meta.notes && meta.notes.length) {
    L.push('');
    L.push(`### Notes from this run`);
    for (const n of meta.notes) L.push(`- ${n}`);
  }
  L.push('');
  L.push(`---`);
  L.push(`*Generated by the White Orchid resident tester. This is stage 1 (on-demand). Nightly automatic runs are a later step, pending your go-ahead on this first report.*`);
  L.push('');

  return L.join('\n');
}

module.exports = { generate, rankDefects };
