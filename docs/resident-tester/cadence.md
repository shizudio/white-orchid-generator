# Resident Tester — testing cadence

This is the plain-language guide to *when* the White Orchid resident tester runs,
*what* each run does, *what it costs*, and *how to turn it off* when you need to.

There are two shapes of run: a quick **smoke** on every deploy, and a deeper
**nightly** sweep. They share one program (`scripts/resident-tester/run.js`); a flag
switches between them.

---

## 1. Smoke — on every staging deploy

**When:** automatically, every time someone pushes the `staging` branch (the push
that updates the staging site). It's wired through a git `pre-push` hook.

**What it does:**
- Opens the studio and runs the everyday **golden journeys** (start a post, edit a
  colour, switch sizes, add a caption, undo, export…).
- Throws the **full pool of realistic staff requests** at the design helper — every
  phrasing we have (~30), typos and all — and checks each result against the quality
  rules. (Smoke used to sample ~13; it now runs the whole pool because a smoke is
  cheap and the extra coverage is basically free.)
- Photos are **fully mocked** — the studio falls back to its built-in sample photos,
  so **zero photo-generation credits** are used.

**Cost & time:** about **2 minutes** and **~$0.32** of AI usage in practice. Hard
ceilings: it stops automatically at **30 minutes** or **~$3**, whichever comes first.

**Blocking?** **No.** Quality flags are advisory — they never block your push. The
push is blocked in exactly one case: if the app **fails to build or boot** (a broken
push you'd want stopped anyway).

**Output:** `docs/resident-tester/smoke-report-<date>.md` (plus a machine-readable
artifact folder under `scripts/resident-tester/runs/`).

**Run it by hand:** `npm run test:resident`

---

## 2. Nightly — the deep sweep

**When:** unattended, at **02:30 every night**, launched by a scheduled agent on this
machine that runs `npm run test:resident:nightly`. (The schedule lives with that
agent, not in this repo. To change the time or turn it off, edit that scheduled task.)

**What it does — everything the smoke does, plus:**
- The realistic-request sweep runs **twice** (two full passes). A second pass catches
  behaviour that only misfires *sometimes* — flakiness a single pass would miss.
- All the golden journeys, same as smoke.
- The **real-photo probe** (below) — the one part that generates genuine photos.

**Cost & time:** capped at **60 minutes** and **~$2** of AI usage, plus the real-photo
probe's small, hard-capped credit spend.

**Output:** `docs/resident-tester/nightly-report-<date>.md`.

**Run it by hand:** `npm run test:resident:nightly`

---

## 3. The real-photo probe (nightly only)

The client asked to see **real generated images** in the loop, not just sample
photos. So once a night — and *only* in the probe — the tester generates a tiny,
capped number of genuine photos through the live image pipeline.

**How it stays safe:** the probe runs as a **separate phase on a freshly restarted
server** that has the real Higgsfield keys (exactly as the live site does). It
performs at most:
- **one landing generation** from a photo-led brief (the studio calls Higgsfield,
  quality-checks the result, warm-grades it, and composes the post), and
- **one "Refresh photo"** in the editor (a second generation on the same scene).

**The hard cap:** at most **`WO_REAL_PHOTOS` generations — default 2, and never more
than 3**, no matter what. The moment the cap is reached, the probe stops. Every other
part of the nightly still runs on mocked photos, so the probe is the *only* thing that
ever touches credits.

**What we check on each real photo:** that a genuine photo actually landed (not a
silent fall-back to a stock photo), that the finished design is "born clean" (no
"needs attention" marks), that nothing errored in the browser or on the server, and
that the helper stayed honest. **The generated design is screenshotted and saved into
the run folder**, and the report links to it — so you can *see* the real output.

**If the image service is down / out of quota:** the probe **degrades gracefully** —
it spends nothing it can't, records exactly what happened, and the report says so
plainly. It never hangs the run.

---

## 4. How to skip a run

| Situation | How |
|---|---|
| Skip the deploy smoke for one push | `WO_SKIP_SMOKE=1 git push origin staging` |
| Push a non-staging branch | Nothing to do — the smoke only runs on `staging`. |
| Stop the nightly | Disable/edit the scheduled agent that runs `test:resident:nightly`. |
| Force a run to use **zero** real photos | `WO_REAL_PHOTOS=0` (this is the smoke default). |
| Cap real photos lower than default | `WO_REAL_PHOTOS=1` (max accepted is 3). |

The `pre-push` hook itself is installed once with
`bash scripts/resident-tester/install-hooks.sh`. It only ever triggers on pushes to
`staging`; every other push (feature branches, `main`, tags, branch deletions) passes
through untouched.

---

## 5. Quick reference

| | Smoke | Nightly |
|---|---|---|
| **Trigger** | every `staging` push (pre-push hook) | scheduled agent, 02:30 |
| **Command** | `npm run test:resident` | `npm run test:resident:nightly` |
| **Persona pool** | full pool, 1 pass | full pool, 2 passes |
| **Golden journeys** | yes | yes |
| **Real photos** | 0 (fully mocked) | ≤3 (default 2), probe only |
| **Time ceiling** | 30 min | 60 min |
| **AI-cost ceiling** | ~$3 | ~$2 |
| **Blocks the push?** | only if the app won't build/boot | n/a (not tied to a push) |
| **Report** | `smoke-report-<date>.md` | `nightly-report-<date>.md` |
