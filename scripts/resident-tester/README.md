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
# SMOKE — full persona pool, photos mocked (~2 min). Runs on every staging deploy:
npm run test:resident

# NIGHTLY — full pool ×2, all journeys, + a capped REAL-photo probe (see below):
npm run test:resident:nightly
```

Or, if you already have a fresh isolated production build:

```bash
node scripts/resident-tester/run.js            # smoke
node scripts/resident-tester/run.js --nightly  # nightly (or WO_NIGHTLY=1)
```

Both cadences and how they're scheduled are documented in
[`docs/resident-tester/cadence.md`](../../docs/resident-tester/cadence.md).

Prerequisites (installed once):

```bash
npm i -D playwright        # already in devDependencies
npx playwright install chromium
```

### What a run produces

- **`docs/resident-tester/smoke-report-<date>.md`** (smoke) or
  **`docs/resident-tester/nightly-report-<date>.md`** (nightly) — the client-facing
  report (this is the durable, committed output).
- **`scripts/resident-tester/runs/<timestamp>/`** — a self-contained artifact folder
  (git-ignored): `events.jsonl` (every quality flag, machine-readable),
  `screenshots/` (flagged steps **plus** any real generated designs from the nightly
  probe), `server.log` / `server-probe.log`, and a copy of the report.

## How it stays safe (zero credits, zero pollution)

1. **Photo generation is fully mocked** — except the nightly real-photo probe. In
   the mocked phases the production server is launched with the Higgsfield API keys
   *unset*, so `higgsfieldConfigured()` is false and `/api/design-generate` returns
   `{ unconfigured }` — the studio falls back to its built-in Library/sample photos.
   **Zero Higgsfield credits by construction.** The nightly probe is the ONE
   exception: it restarts the server *with* the keys and spends at most
   `WO_REAL_PHOTOS` (default 2, hard cap 3) real generations — see the cadence doc.
2. **A network belt-and-suspenders.** The browser also hard-blocks any request to
   `platform.higgsfield.ai`; if one ever fired, it's counted and the run flags it.
3. **No cloud writes.** Every `POST /api/sessions` and `POST /api/feedback` is
   intercepted and discarded (the app's fire-and-forget logic is undisturbed). The
   run counts cloud sessions **before and after** and asserts the count is unchanged.
4. **Synthetic tagging.** Every page sets a `wo-synthetic` marker and runs in a
   dedicated Chromium context, so the app's harness mode can distinguish test traffic
   if it chooses to.

## Budget & time caps

- **Smoke:** stops at **30 minutes** wall-clock or **~$3** of estimated AI usage.
- **Nightly:** stops at **60 minutes** or **~$2** of estimated AI usage, plus a hard
  cap of **≤3 real photo generations** in the probe (default 2).

AI usage is counted as helper requests × a conservative per-call rate; fuzzing trims
its sample to fit the remaining clock. The real-photo cap is enforced independently
of the AI cap.

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
| `real-photo-probe.js` | The nightly REAL-photo probe (capped genuine generations). |
| `report.js` | Client-facing markdown report generator. |
| `run.js` | The main runner (two-phase: mocked sweep, then optional real-photo probe). |
| `deploy-smoke.sh` | Builds if stale, runs the smoke, prints the report path + verdict. |
| `install-hooks.sh` | Installs the staging-only `pre-push` deploy-smoke hook. |

## Cadence (what runs when)

- **Smoke** runs on **every staging deploy** via a `pre-push` git hook (installed by
  `install-hooks.sh`). Full persona pool, photos mocked, non-blocking on findings.
- **Nightly** runs **unattended at 02:30** via a scheduled agent on this machine that
  launches `npm run test:resident:nightly`. Full pool ×2, all journeys, plus the
  capped real-photo probe.

Full details — costs, how to skip, the probe, scheduling — live in
[`docs/resident-tester/cadence.md`](../../docs/resident-tester/cadence.md).
