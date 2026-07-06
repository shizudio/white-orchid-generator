# White Orchid Content Studio — Automated Test Report

**Date:** 2026-07-06  ·  **Type:** 30-minute smoke run (first run)

This report is produced by the studio's automated "resident tester" — a program that opens the studio like a member of your staff would, tries the everyday things (start a post, change a colour, switch sizes, download), and also throws dozens of realistic, messy requests at the design helper to see how it copes. It checks the result of each action against a set of quality rules and writes down anything that looked wrong, with a screenshot.

Nothing in this run cost you any photo-generation credits, and nothing it did was saved to your real account — it runs in a sealed sandbox.

## The short version

- **Everyday journeys:** 9 of 9 steps passed.
- **Realistic requests tried:** 13. Of those, 12 triggered at least one quality flag.
- **Total quality flags raised:** 15 (across 2 distinct issue types).
- **Time taken:** 2.2 minutes.  **Estimated AI cost:** $0.32 (16 helper requests).
- **Photo credits spent:** 0 (confirmed — photo generation was fully mocked).
- **Data saved to your account:** none (23 save attempts were intercepted and discarded).

## What needs attention (most important first)

### 1. A finished design showed a "needs attention" mark

- **Priority:** Worth fixing  ·  **Seen:** 12 times — but these look like the *same* underlying issue re-appearing (one thing to fix, not 12).
- Someone typed: "make the background wisteria"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s)
  - Screenshot: `screenshots/001-fuzz-colour-make-the-background-wisteria.png`
- Someone typed: "can u change the colour to that mauve one"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s)
  - Screenshot: `screenshots/002-fuzz-colour-can-u-change-the-colour-to-that-mauve-.png`
- Someone typed: "make the title bigger"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s)
  - Screenshot: `screenshots/003-fuzz-typography-make-the-title-bigger.png`

### 2. The helper had to walk back something it said it did

- **Priority:** Important  ·  **Seen:** 3 times — but these look like the *same* underlying issue re-appearing (one thing to fix, not 3).
- Someone typed: "can u change the colour to that mauve one"
  - What we expected: an actionable request produces a real change, not a "that changed nothing" reply
  - What happened: helper walked back an actionable request: "Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit it directly?"
  - Screenshot: `screenshots/002-fuzz-colour-can-u-change-the-colour-to-that-mauve-.png`
- Someone typed: "the headline shud say Open House not open day"
  - What we expected: an actionable request produces a real change, not a "that changed nothing" reply
  - What happened: helper walked back an actionable request: "Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit it directly?"
  - Screenshot: `screenshots/007-fuzz-edit-text-the-headline-shud-say-open-house-no.png`
- Someone typed: "make it warmer"
  - What we expected: an actionable request produces a real change, not a "that changed nothing" reply
  - What happened: helper walked back an actionable request: "Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit it directly?"
  - Screenshot: `screenshots/009-fuzz-vague-aesthetic-make-it-warmer.png`

## Everyday journeys — step by step

These are the core things a staff member does. Each was performed automatically and checked.

| Step | Result | Notes |
|---|---|---|
| landing→generate | ✅ passed | reached studio with a composed design |
| born-clean after generate | ✅ passed | born-clean:ok; no-horizontal-overflow:ok; canvas-buffer-matches-dims:ok; no-console-errors:ok |
| chat edit (wisteria) | ✅ passed | honesty-apology:ok; claim-vs-changed:ok; offer-without-execution:ok; no-horizontal-overflow:ok; no-console-errors:ok |
| canvas click → inspector | ✅ passed | inspector opened |
| format switch ×N | ✅ passed | 6 formats, no dead space / strip jump |
| + Add caption renders | ✅ passed | caption landed (new role key) |
| Posts/History present | ✅ passed | 13 post tile(s) present |
| Export → Ready checklist | ✅ passed | checklist present |
| undo reverts | ✅ passed | design truth changed after undo |

## Realistic requests — what the helper did

Each row is a real-world phrasing (typos and all) sent to the design helper, and how it responded.

| What was typed | Kind | Helper replied? | Changed something? | Flags | The helper's reply (short) |
|---|---|---|---|---|---|
| make the background wisteria | colour | yes | no | 1 | The background is already set to wisteria. If you need further adjustments, please let me know. |
| can u change the colour to that mauve one | colour | yes | no | 2 | Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit i |
| make the title bigger | typography | yes | yes (text size) | 1 | I made the title larger for greater emphasis. It should stand out more now. |
| can we use a different picture | photo | yes | no | 1 | I can't do that yet. Please provide a description for the new photo you'd like to use, and I can help create it. |
| make it more fun for the kids | vague-aesthetic | yes | no | 1 | I can't do that yet. Please provide a brief visual description of the photo you'd like to see, and I can generate a new  |
| how do i download this | question | yes | no | 1 | I can't help you download directly, but you can tap the export icon in the studio to save your design to your device. |
| the headline shud say Open House not open day | edit-text | yes | no | 2 | Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit i |
| i want the photo to fill the whole thing | layout | yes | yes (archetype, text backdrop) | 1 | I've changed the layout so the photo now fills the whole post. |
| make it warmer | vague-aesthetic | yes | no | 2 | Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit i |
| more of a terracotta vibe | colour | yes | no | 1 | I can't do that yet, but I suggest adjusting the photo treatment to warmGrade for a more inviting feel. |
| put our phone number at the bottom 9123 4567 | add-text | yes | yes (post type, headline, subtext, date, eyeb) | 0 | I've added that as a note at the bottom — your phone number. You can tap it anytime to edit. |
| is this the right size for instagram | question | yes | yes (format) | 1 | This banner size isn't optimal for Instagram; it needs to be square (1:1) or portrait (4:5). |
| the title text is hard to read make it darker | colour | yes | yes (text colour) | 1 | I've changed the text color for the title to a darker shade, improving readability. |

## What was checked (coverage)

After every action the tester ran these quality rules:

- **Honesty:** the helper never claims to have done something it didn't do.
- **Truthful confirmations:** when the helper says it changed something, the design really changed.
- **No dead offers:** if the helper offers to do something, there's a button that actually does it.
- **Clean layout:** the page never spills sideways and the format bar doesn't jump.
- **Correct sizes:** the preview always matches the real design dimensions.
- **Finished-looking designs:** a freshly made design doesn't arrive with "needs attention" marks.
- **No hidden errors:** nothing breaks quietly in the background.

## Run details (for the record)

- **Ran against:** a production build of the studio, identical to what goes live, running locally in a sandbox.
- **Photo generation:** fully mocked — the studio fell back to its built-in sample photos, so no credits were used.
- **Account safety:** all "save to cloud" requests were blocked, so this run added nothing to your Posts or history.
- **Budget caps:** the run stops automatically at 30 minutes or about $3 of AI usage, whichever comes first.
- **Raw log:** every flag is also recorded in machine-readable form at `scripts/resident-tester/runs/2026-07-06T09-32-56/events.jsonl`, with screenshots in the same folder.

### Notes from this run
- Cloud sessions before run: 10 active + 18 archived.
- Fuzzing target this run: 13 utterances (from a pool of realistic staff phrasings).
- Cloud sessions after run: 10 active + 18 archived → ZERO new session ids (verified clean — the tester wrote nothing to your account).
- Higgsfield (photo-credit) calls intercepted: 0 (must be 0).
- Cloud write attempts intercepted + discarded: 23.

---
*Generated by the White Orchid resident tester. This is stage 1 (on-demand). Nightly automatic runs are a later step, pending your go-ahead on this first report.*
