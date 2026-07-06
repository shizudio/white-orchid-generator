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
  'real-photo-present': 'A real-photo test fell back to a stock photo instead of generating one',
};

function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }

function rankDefects(defects) {
  // Group by (oracle) so frequency counts; score = Σ severity weight. We ALSO
  // detect a PERSISTENT finding — the same observed symptom seen across many
  // states (e.g. one advisor dot that never clears, re-flagged on every probe).
  // That is ONE thing to fix, not N; the report says so rather than inflating it.
  const groups = new Map();
  for (const d of defects) {
    const key = d.oracle;
    if (!groups.has(key)) groups.set(key, { oracle: key, count: 0, score: 0, severity: d.severity, examples: [], observedSet: new Set() });
    const g = groups.get(key);
    g.count++;
    g.score += SEV_WEIGHT[d.severity] || 1;
    if (SEV_WEIGHT[d.severity] > SEV_WEIGHT[g.severity]) g.severity = d.severity;
    // Normalise the observed string (strip the utterance-specific bits) so a
    // recurring identical symptom collapses to one distinct value.
    g.observedSet.add(String(d.observed || '').replace(/\d+/g, '#'));
    if (g.examples.length < 3) g.examples.push(d);
  }
  for (const g of groups.values()) {
    g.distinctSymptoms = g.observedSet.size;
    // Persistent when many hits share ≤2 distinct symptoms → likely one anchor.
    g.persistent = g.count >= 3 && g.distinctSymptoms <= 2;
  }
  return [...groups.values()].sort((a, b) => b.score - a.score || b.count - a.count);
}

function generate(run, meta) {
  const nightly = !!(meta && meta.nightly);
  const defects = run.defects();
  const ranked = rankDefects(defects);
  const wallMin = (run.elapsedMs() / 60000);
  const dateStr = new Date(run.startedAt).toISOString().slice(0, 10);

  const journeySteps = (run.journeys[0]?.steps) || [];
  const passSteps = journeySteps.filter(s => s.ok).length;
  const fuzzWithDefects = run.fuzz.filter(f => f.defects > 0).length;
  const probe = run.realPhotoProbeSummary || null;

  const L = [];
  L.push(`# White Orchid Content Studio — Automated Test Report`);
  L.push('');
  L.push(`**Date:** ${dateStr}  ·  **Type:** ${nightly ? 'nightly deep sweep (unattended)' : 'deploy smoke run'}`);
  L.push('');
  L.push(`This report is produced by the studio's automated "resident tester" — a program that opens the studio like a member of your staff would, tries the everyday things (start a post, change a colour, switch sizes, download), and also throws dozens of realistic, messy requests at the design helper to see how it copes. It checks the result of each action against a set of quality rules and writes down anything that looked wrong, with a screenshot.`);
  L.push('');
  if (nightly && run.realGenerations > 0) {
    L.push(`This is a **nightly** run, so it did two things a deploy smoke run doesn't: it repeated the realistic-request sweep **twice** (to catch anything that only misbehaves sometimes), and it generated **${run.realGenerations} real photo${run.realGenerations === 1 ? '' : 's'}** through the live image pipeline so you can see genuine generated results below. Everything else still ran in a sealed sandbox on built-in sample photos.`);
  } else {
    L.push(`Nothing in this run cost you any photo-generation credits, and nothing it did was saved to your real account — it runs in a sealed sandbox.`);
  }
  L.push('');

  // ── Headline ────────────────────────────────────────────────────────────
  L.push(`## The short version`);
  L.push('');
  L.push(`- **Everyday journeys:** ${passSteps} of ${journeySteps.length} steps passed.`);
  L.push(`- **Realistic requests tried:** ${run.fuzz.length}. Of those, ${fuzzWithDefects} triggered at least one quality flag.`);
  L.push(`- **Total quality flags raised:** ${defects.length}${defects.length ? ` (across ${ranked.length} distinct issue type${ranked.length === 1 ? '' : 's'})` : ''}.`);
  L.push(`- **Time taken:** ${wallMin.toFixed(1)} minutes.  **Estimated AI cost:** $${run.estCostUsd().toFixed(2)} (${run.llmCalls} helper requests).`);
  if (run.realGenerations > 0) {
    L.push(`- **Real photos generated:** ${run.realGenerations} (a deliberate, capped test of the live image pipeline — see "Real generated photos" below). During the rest of the run, photo generation was fully mocked.`);
  } else {
    L.push(`- **Photo credits spent:** ${run.higgsfieldCalls === 0 ? '0 (confirmed — photo generation was fully mocked).' : `${run.higgsfieldCalls} — WARNING, this should be zero.`}`);
  }
  L.push(`- **Data saved to your account:** none (${run.cloudWriteAttempts} save attempt${run.cloudWriteAttempts === 1 ? ' was' : 's were'} intercepted and discarded).`);
  L.push('');

  // ── Real generated photos (nightly probe) ─────────────────────────────────
  if (probe) {
    L.push(`## Real generated photos`);
    L.push('');
    L.push(`Once a night, the tester deliberately generates a small, capped number of **real** photos through the live image pipeline (at most ${probe.cap}) so you can see genuine results — not sample images. This is the only part of the run that uses photo-generation credits.`);
    L.push('');
    if (probe.degraded) {
      L.push(`> **Heads up:** ${probe.degraded}`);
      L.push('');
    }
    if (probe.generations.length === 0) {
      L.push(`No real photo was produced this run. ${probe.degraded ? '' : 'The image service may have been unavailable or out of quota.'} Total credits spent: ${run.realGenerations}.`);
    } else {
      for (const g of probe.generations) {
        L.push(`### ${g.label}`);
        L.push('');
        L.push(`- **Brief used:** "${String(g.brief || '').replace(/\|/g, '/')}"`);
        L.push(`- **Real photo produced?** ${g.real ? 'Yes — ' : 'No — '}${g.realHow}`);
        L.push(`- **Generations submitted:** ${g.generationsSubmitted}  ·  **completed:** ${g.completed}  ·  **failures:** ${g.failures}${g.lastError ? ` (last: ${g.lastError})` : ''}`);
        L.push(`- **Quality flags on the result:** ${g.defects}`);
        if (g.screenshot) L.push(`- **Screenshot of the generated design:** \`${path.relative(process.cwd(), g.screenshot)}\``);
        L.push('');
      }
    }
    L.push(`**Total real photos generated this run: ${run.realGenerations}** (hard cap ${probe.cap}).`);
    if (probe.serverErrors && probe.serverErrors.length) {
      L.push('');
      L.push(`Server-side notes during generation:`);
      for (const e of probe.serverErrors) L.push(`- \`${String(e).replace(/\|/g, '/').slice(0, 200)}\``);
    }
    L.push('');
  }

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
      const seenLine = g.persistent
        ? `**Seen:** ${g.count} times — but these look like the *same* underlying issue re-appearing (one thing to fix, not ${g.count}).`
        : `**Seen:** ${g.count} time${g.count === 1 ? '' : 's'} this run.`;
      L.push(`- **Priority:** ${sev}  ·  ${seenLine}`);
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
  if (run.realGenerations > 0) {
    L.push(`- **Photo generation:** mocked for the whole run EXCEPT a deliberate, capped probe of ${run.realGenerations} real photo(s) through the live pipeline (see "Real generated photos").`);
  } else {
    L.push(`- **Photo generation:** fully mocked — the studio fell back to its built-in sample photos, so no credits were used.`);
  }
  L.push(`- **Account safety:** all "save to cloud" requests were blocked, so this run added nothing to your Posts or history.`);
  L.push(`- **Budget caps:** the run stops automatically at ${nightly ? '60 minutes or about $2 of AI usage' : '30 minutes or about $3 of AI usage'}, whichever comes first.`);
  L.push(`- **Raw log:** every flag is also recorded in machine-readable form at \`${path.relative(process.cwd(), run.eventsPath)}\`, with screenshots in the same folder.`);
  if (meta && meta.notes && meta.notes.length) {
    L.push('');
    L.push(`### Notes from this run`);
    for (const n of meta.notes) L.push(`- ${n}`);
  }
  L.push('');
  L.push(`---`);
  L.push(nightly
    ? `*Generated by the White Orchid resident tester (nightly deep sweep). Deploy smoke runs — a lighter version of this — also run automatically on every staging deploy.*`
    : `*Generated by the White Orchid resident tester (deploy smoke run). A deeper nightly sweep — including a small, capped test of real photo generation — runs automatically each night.*`);
  L.push('');

  return L.join('\n');
}

module.exports = { generate, rankDefects };
