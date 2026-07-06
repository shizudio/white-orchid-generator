# Resident Tester — automated self-testing loop (stage 1)

The resident tester opens the White Orchid Content Studio the way a member of your
staff would, performs the everyday journeys, and throws dozens of realistic, messy
requests at the design helper — then checks every result against a battery of
quality rules and writes a plain-language report with screenshots of anything that
looked wrong.

It is **standalone and read-only**: it lives entirely in `scripts/resident-tester/`
and `docs/resident-tester/` and only *reads* the running app. It never edits app
code, never spends photo-generation credits, and never saves anything to your real
account.

## How to run

```bash
# One command — builds a production copy of the studio, then tests it:
npm run test:resident
```

Or, if you already have a fresh production build (`next build` has been run):

```bash
node scripts/resident-tester/run.js
```

Prerequisites (installed once):

```bash
npm i -D playwright        # already in devDependencies
npx playwright install chromium
```

### What a run produces

- **`docs/resident-tester/smoke-report-<date>.md`** — the client-facing report
  (this is the durable, committed output).
- **`scripts/resident-tester/runs/<timestamp>/`** — a self-contained artifact folder
  (git-ignored): `events.jsonl` (every quality flag, machine-readable),
  `screenshots/` (one per flagged step), `server.log`, and a copy of the report.

## How it stays safe (zero credits, zero pollution)

1. **Photo generation is fully mocked.** The production server is launched with the
   Higgsfield API keys *unset*, so `higgsfieldConfigured()` is false and
   `/api/design-generate` returns `{ unconfigured }` — the studio falls back to its
   built-in Library/sample photos. **Zero Higgsfield credits by construction.**
2. **A network belt-and-suspenders.** The browser also hard-blocks any request to
   `platform.higgsfield.ai`; if one ever fired, it's counted and the run flags it.
3. **No cloud writes.** Every `POST /api/sessions` and `POST /api/feedback` is
   intercepted and discarded (the app's fire-and-forget logic is undisturbed). The
   run counts cloud sessions **before and after** and asserts the count is unchanged.
4. **Synthetic tagging.** Every page sets a `wo-synthetic` marker and runs in a
   dedicated Chromium context, so the app's harness mode can distinguish test traffic
   if it chooses to.

## Budget & time caps

The run stops automatically at **30 minutes wall-clock** or **~$3 of estimated AI
usage** (counted as helper requests × a conservative per-call rate), whichever comes
first. Fuzzing trims its sample to fit the remaining budget.

## What it checks (the oracles)

After every action:

- **Honesty** — the helper never walks back a claim (no "Honestly —" / "Actually —
  checking the canvas" self-corrections).
- **Truthful confirmations** — a narrated change is backed by real changed keys.
- **No dead offers** — an offer to act always carries a one-tap execution chip.
- **Clean layout** — `scrollWidth <= innerWidth`; the format bar's Y stays stable
  across size switches.
- **Correct sizes** — the `<canvas>` backing store matches the logical design dims.
- **Born clean** — a freshly produced design carries no deterministic advisor dots.
- **No hidden errors** — the browser console stays clean.

Oracles read the app's own dev hooks (`__woReadyCheck`, `__woTruth`, `__woRoleBounds`)
and DOM contracts — they are not guesses.

## Files

| File | Role |
|---|---|
| `config.js` | Target URL, budget caps, blocked hosts/endpoints. |
| `personas.js` | ~30 realistic preschool-staff utterances (the fuzz pool). |
| `oracles.js` | The quality-rule battery (pure judgments over a browser probe). |
| `harness.js` | Defect recorder, budget clock, hardened browser context. |
| `journeys.js` | The deterministic golden journeys. |
| `fuzz.js` | Persona fuzzing loop (budget-capped). |
| `report.js` | Client-facing markdown report generator. |
| `run.js` | The main runner (launches the server, orchestrates, verifies, reports). |

## Not built yet (future stages — gated on this first report)

- **Deploy hook** — run automatically after each staging deploy.
- **Nightly cron** — a scheduled unattended run with trend tracking across runs.

These are deliberately out of scope for stage 1: the client reviews this first
report before we wire automation.
