# White Orchid Content Studio — Automated Test Report

**Date:** 2026-09-14  ·  **Type:** deploy smoke run

This report is produced by the studio's automated "resident tester" — a program that opens the studio like a member of your staff would, tries the everyday things (start a post, change a colour, switch sizes, download), and also throws dozens of realistic, messy requests at the design helper to see how it copes. It checks the result of each action against a set of quality rules and writes down anything that looked wrong, with a screenshot.

Nothing in this run cost you any photo-generation credits, and nothing it did was saved to your real account — it runs in a sealed sandbox.

## The short version

- **Everyday journeys:** 6 of 10 steps passed.
- **Realistic requests tried:** 31. Of those, 0 triggered at least one quality flag.
- **Total quality flags raised:** 4 (across 2 distinct issue types).
- **Time taken:** 18.2 minutes.  **Estimated AI cost:** $0.66 (33 helper requests).
- **Photo credits spent:** 0 (confirmed — photo generation was fully mocked).
- **Data saved to your account:** none (68 save attempts were intercepted and discarded).

## What needs attention (most important first)

### 1. The format bar jumped when switching sizes

- **Priority:** Worth fixing  ·  **Seen:** 3 times this run.
- During: format-switch
  - What we expected: strip Y within 4px of baseline across format switches
  - What happened: [✓
Twitter / X
·] strip top 678 vs baseline 737 (drift 59px)
  - Screenshot: `screenshots/001-j4-format-twitter-x-.png`
- During: format-switch
  - What we expected: strip Y within 4px of baseline across format switches
  - What happened: [✓
Facebook
·] strip top 648 vs baseline 737 (drift 89px)
  - Screenshot: `screenshots/002-j4-format-facebook-.png`
- During: format-switch
  - What we expected: strip Y within 4px of baseline across format switches
  - What happened: [✓
Banner
·] strip top 490 vs baseline 737 (drift 247px)
  - Screenshot: `screenshots/003-j4-format-banner-.png`

### 2. Adding an element did not appear on the design

- **Priority:** Worth fixing  ·  **Seen:** 1 time this run.
- During: add-caption
  - What we expected: adding a caption changes the rendered design
  - What happened: render truth unchanged after add [branch=chip, addChipPresent=true]
  - Screenshot: `screenshots/004-j5-add-caption.png`

## Everyday journeys — step by step

These are the core things a staff member does. Each was performed automatically and checked.

| Step | Result | Notes |
|---|---|---|
| landing→generate | ⚠️ flagged | did not reach the studio: Cannot read properties of null (reading 'fill') |
| born-clean after generate | ✅ passed | born-clean; no-horizontal-overflow:ok; canvas-buffer-matches-dims:ok; no-console-errors:ok |
| chat edit (wisteria) | ✅ passed | honesty-apology:ok; claim-vs-changed:ok; offer-without-execution:ok; no-horizontal-overflow:ok; no-console-errors:ok |
| canvas click → inspector | ✅ passed | inspector opened |
| every element clickable (no dead clicks) | ✅ passed | 1 rendered element(s) all clickable (logo + roles reach the canvas + open an inspector) |
| format switch ×N | ⚠️ flagged | broke on ✓
Banner
· |
| + Add caption renders | ⚠️ flagged | no role-bound delta and no add confirmation [branch=chip, addChipPresent=true] |
| Posts/History present | ✅ passed | no posts yet (fresh device) |
| Export → Ready checklist | ⚠️ flagged | export menu did not open |
| undo reverts | ✅ passed | design truth changed after undo |

## Realistic requests — what the helper did

Each row is a real-world phrasing (typos and all) sent to the design helper, and how it responded.

| What was typed | Kind | Helper replied? | Changed something? | Flags | The helper's reply (short) |
|---|---|---|---|---|---|
| softer pls | vague-aesthetic | no | no | 0 |  |
| it looks a bit boring tbh | vague-aesthetic | yes | no | 0 |  |
| try another layout | layout | no | no | 0 |  |
| make it warmer | vague-aesthetic | yes | no | 0 |  |
| pickup changed to 2:30 pls | edit-text | no | no | 0 |  |
| change the date to friday the 18th | edit-text | yes | no | 0 |  |
| can you make it pop more | vague-aesthetic | no | no | 0 |  |
| put our phone number at the bottom 9123 4567 | add-text | yes | no | 0 |  |
| does this look ok to you | question | no | no | 0 |  |
| wat can i change here | question | yes | no | 0 |  |
| the picture doesnt really fit our vibe | photo | no | no | 0 |  |
| the title text is hard to read make it darker | colour | yes | no | 0 |  |
| make it more fun for the kids | vague-aesthetic | no | no | 0 |  |
| move the logo to the middle | layout | yes | no | 0 |  |
| add small text saying spaces are limited | add-text | no | no | 0 |  |
| make the title bigger | typography | yes | no | 0 |  |
| make it cuter | vague-aesthetic | no | no | 0 |  |
| can we use a different picture | photo | yes | no | 0 |  |
| can u change the colour to that mauve one | colour | no | no | 0 |  |
| why is the photo so dark | question | yes | no | 0 |  |
| remove the green solid block | layout | no | no | 0 |  |
| the headline shud say Open House not open day | edit-text | yes | no | 0 |  |
| i want the photo to fill the whole thing | layout | no | no | 0 |  |
| is this the right size for instagram | question | yes | no | 0 |  |
| change the photo to children painting | photo | no | no | 0 |  |
| too much green | colour | yes | no | 0 |  |
| add my name miss tan at the bottom | add-text | no | no | 0 |  |
| can it be a full image post | layout | yes | no | 0 |  |
| more of a terracotta vibe | colour | no | no | 0 |  |
| make the background wisteria | colour | yes | no | 0 |  |
| how do i download this | question | no | no | 0 |  |

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
- **Raw log:** every flag is also recorded in machine-readable form at `scripts/resident-tester/runs/2026-09-14T02-19-30/events.jsonl`, with screenshots in the same folder.

### Notes from this run
- Run mode: deploy smoke. Real-photo generations budgeted this run: 0 (hard cap 3).
- Cloud sessions before run: cloud unconfigured (nothing to pollute).
- Fuzzing pass 1/1: up to 77 utterances (full pool = 31).
- Cloud sessions after run: cloud unconfigured → ZERO new session ids (verified clean — the tester wrote nothing to your account).
- Higgsfield calls intercepted during the MOCKED phase: 0 (must be 0).
- Cloud write attempts intercepted + discarded: 68.

---
*Generated by the White Orchid resident tester (deploy smoke run). A deeper nightly sweep — including a small, capped test of real photo generation — runs automatically each night.*
