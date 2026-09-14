# White Orchid Content Studio — Automated Test Report

**Date:** 2026-07-13  ·  **Type:** deploy smoke run

This report is produced by the studio's automated "resident tester" — a program that opens the studio like a member of your staff would, tries the everyday things (start a post, change a colour, switch sizes, download), and also throws dozens of realistic, messy requests at the design helper to see how it copes. It checks the result of each action against a set of quality rules and writes down anything that looked wrong, with a screenshot.

Nothing in this run cost you any photo-generation credits, and nothing it did was saved to your real account — it runs in a sealed sandbox.

## The short version

- **Everyday journeys:** 6 of 10 steps passed.
- **Realistic requests tried:** 31. Of those, 13 triggered at least one quality flag.
- **Total quality flags raised:** 17 (across 3 distinct issue types).
- **Time taken:** 4.4 minutes.  **Estimated AI cost:** $0.68 (34 helper requests).
- **Photo credits spent:** 0 (confirmed — photo generation was fully mocked).
- **Data saved to your account:** none (51 save attempts were intercepted and discarded).

## What needs attention (most important first)

### 1. A finished design showed a "needs attention" mark

- **Priority:** Worth fixing  ·  **Seen:** 14 times this run.
- During: landing-generate
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 5 ready finding(s): copy-dropped@ig_portrait, copy-dropped@story, thumb-legibility@twitter, thumb-legibility@facebook, thumb-legibility@banner
  - Screenshot: `screenshots/001-j1-born-clean-born-clean.png`
- Someone typed: "add small text saying spaces are limited"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 5 ready finding(s): copy-dropped@ig_portrait, copy-dropped@story, thumb-legibility@twitter, thumb-legibility@facebook, thumb-legibility@banner
  - Screenshot: `screenshots/003-fuzz-add-text-add-small-text-saying-spaces-are-lim.png`
- Someone typed: "too much green"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 5 ready finding(s): copy-dropped@ig_portrait, copy-dropped@story, thumb-legibility@twitter, thumb-legibility@facebook, thumb-legibility@banner
  - Screenshot: `screenshots/004-fuzz-colour-too-much-green.png`

### 2. The helper had to walk back something it said it did

- **Priority:** Important  ·  **Seen:** 2 times this run.
- Someone typed: "add small text saying spaces are limited"
  - What we expected: an actionable request produces a real change, not a "that changed nothing" reply
  - What happened: helper walked back an actionable request: "Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit it directly?"
  - Screenshot: `screenshots/003-fuzz-add-text-add-small-text-saying-spaces-are-lim.png`
- Someone typed: "make the title bigger"
  - What we expected: an actionable request produces a real change, not a "that changed nothing" reply
  - What happened: helper walked back an actionable request: "Actually — checking the canvas, the title is already as large as this layout can fit, so it didn't visibly grow. Try the “Try another layout” chip for one with "
  - Screenshot: `screenshots/005-fuzz-typography-make-the-title-bigger.png`

### 3. Adding an element did not appear on the design

- **Priority:** Worth fixing  ·  **Seen:** 1 time this run.
- During: add-caption
  - What we expected: adding a caption changes the rendered design
  - What happened: render truth unchanged after add [branch=chip, addChipPresent=true]
  - Screenshot: `screenshots/002-j5-add-caption.png`

## Human feedback

These are real notes a person typed with the `/feedback` command while using the studio — a human telling us, mid-task, that something wasn't working. Each note captured a snapshot of the design at that moment. This is the highest-value signal in the report.

### “logo overlapping with "important"”

- **When:** 2026-07-10 07:14
- **Format:** ig_portrait
- **Design snapshot:** captured inline with this note (a small image of what they were looking at).

### “the caption is not too small, very readable, why is the purple beam suggesting otherwise?”

- **When:** 2026-07-07 07:07
- **Format:** banner
- **Design snapshot:** captured inline with this note (a small image of what they were looking at).

## Everyday journeys — step by step

These are the core things a staff member does. Each was performed automatically and checked.

| Step | Result | Notes |
|---|---|---|
| landing→generate | ✅ passed | reached studio with a composed design |
| born-clean after generate | ⚠️ flagged | born-clean FIRED [copy-dropped@ig_portrait, copy-dropped@story, thumb-legibility@twitter, thumb-legibility@facebook, thumb-legibility@banner]; no-horizontal-ove |
| chat edit (wisteria) | ✅ passed | honesty-apology:ok; claim-vs-changed:ok; offer-without-execution:ok; no-horizontal-overflow:ok; no-console-errors:ok |
| canvas click → inspector | ✅ passed | inspector opened |
| every element clickable (no dead clicks) | ✅ passed | 2 rendered element(s) all clickable (logo + roles reach the canvas + open an inspector) |
| format switch ×N | ⚠️ flagged | 0 formats, no dead space / strip jump |
| + Add caption renders | ⚠️ flagged | no role-bound delta and no add confirmation [branch=chip, addChipPresent=true] |
| Posts/History present | ✅ passed | no posts yet (fresh device) |
| Export → Ready checklist | ⚠️ flagged | export menu did not open |
| undo reverts | ✅ passed | design truth changed after undo |

## Realistic requests — what the helper did

Each row is a real-world phrasing (typos and all) sent to the design helper, and how it responded.

| What was typed | Kind | Helper replied? | Changed something? | Flags | The helper's reply (short) |
|---|---|---|---|---|---|
| add small text saying spaces are limited | add-text | yes | no | 2 | Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit i |
| too much green | colour | yes | yes (background) | 1 | Changed the background to wisteria for a softer feel. |
| make the title bigger | typography | yes | no | 2 | Actually — checking the canvas, the title is already as large as this layout can fit, so it didn't visibly grow. Try the |
| wat can i change here | question | yes | no | 1 |  |
| the headline shud say Open House not open day | edit-text | yes | yes (headline) | 1 | Updated the headline to “Open House”. Tap it on the canvas anytime to edit. |
| try another layout | layout | yes | yes (archetype) | 0 | Switched to a floated card over the photo — your words are unchanged. Ask again and I'll show you the next one. |
| move the logo to the middle | layout | yes | no | 0 |  |
| why is the photo so dark | question | yes | no | 0 | Correction — that actually worked: I changed the photo treatment, photo frame. Tap Undo if that isn't what you wanted. |
| it looks a bit boring tbh | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 1 | Gave it more pop — a bolder field and a punchier photo tone. Tap Undo if it's not the feel you wanted. |
| change the photo to children painting | photo | yes | no | 1 | Generating a new photo of children painting now. |
| make it more fun for the kids | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 0 | Made it more playful — a brighter field and a livelier photo tone. Tap Undo if it's not the feel you wanted. |
| remove the green solid block | layout | yes | yes (archetype, subtext, text backdrop, overl) | 0 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| put our phone number at the bottom 9123 4567 | add-text | yes | yes (post type, headline, subtext, attributio) | 0 | Added “Call us: 9123 4567” as the small line at the bottom. Tap it on the canvas to edit. |
| pickup changed to 2:30 pls | edit-text | yes | yes (subtext) | 0 | Updated the caption to say pickup is at 2:30. |
| is this the right size for instagram | question | yes | no | 0 | Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit i |
| add my name miss tan at the bottom | add-text | yes | yes (subtext, attribution) | 0 | Added “Miss Tan” as the sign-off line. Tap it on the canvas to edit. |
| softer pls | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 0 | Softened it — a gentle blush field and a calmer, cleaner photo tone. Tap Undo if it's not the feel you wanted. |
| make the background wisteria | colour | yes | yes (background, fieldColor) | 0 | Changed the background to wisteria. Tap the Background swatch to try another. |
| make it warmer | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 0 | Warmed it up — a soft butter field and a warm photo grade. Tap Undo if it's not the feel you wanted. |
| can you make it pop more | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 0 | Gave it more pop — a bolder field and a punchier photo tone. Tap Undo if it's not the feel you wanted. |
| can u change the colour to that mauve one | colour | yes | yes (background, fieldColor) | 0 | Changed the background to wisteria. Tap the Background swatch to try another. |
| the picture doesnt really fit our vibe | photo | yes | no | 0 | Generating a new photo of children engaging in creative activities now. |
| can we use a different picture | photo | yes | no | 1 | Generating a new photo of children engaged in learning now. This will replace the current image. |
| does this look ok to you | question | yes | no | 1 | I can't assess visuals directly, but I can help you refine details or make changes based on your feedback. Let me know w |
| more of a terracotta vibe | colour | yes | yes (background, fieldColor) | 1 | Changed the background to terracotta. Tap the Background swatch to try another. |
| how do i download this | question | yes | no | 1 | I can't assist with downloading directly, but you can export or save your design through the platform's options. Look fo |
| i want the photo to fill the whole thing | layout | yes | yes (archetype, text backdrop) | 0 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| the title text is hard to read make it darker | colour | yes | yes (headline, background, text colour) | 0 | Updated the headline to “make it darker”. Tap it on the canvas anytime to edit. |
| can it be a full image post | layout | yes | yes (archetype, text backdrop, photo treatmen) | 0 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| change the date to friday the 18th | edit-text | yes | yes (date) | 1 | Updated the date to “Friday the 18th”. Tap it on the canvas anytime to edit. |
| make it cuter | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 1 | Made it sweeter — a soft blush field and a friendlier photo tone. Tap Undo if it's not the feel you wanted. |

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
- **Raw log:** every flag is also recorded in machine-readable form at `scripts/resident-tester/runs/2026-07-13T14-39-35/events.jsonl`, with screenshots in the same folder.

### Notes from this run
- Run mode: deploy smoke. Real-photo generations budgeted this run: 0 (hard cap 3).
- Cloud sessions before run: 10 active + 50 archived.
- Fuzzing pass 1/1: up to 79 utterances (full pool = 31).
- Cloud sessions after run: 10 active + 50 archived → ZERO new session ids (verified clean — the tester wrote nothing to your account).
- Higgsfield calls intercepted during the MOCKED phase: 0 (must be 0).
- Cloud write attempts intercepted + discarded: 51.

---
*Generated by the White Orchid resident tester (deploy smoke run). A deeper nightly sweep — including a small, capped test of real photo generation — runs automatically each night.*
