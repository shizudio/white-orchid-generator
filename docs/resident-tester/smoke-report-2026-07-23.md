# White Orchid Content Studio — Automated Test Report

**Date:** 2026-07-23  ·  **Type:** deploy smoke run

This report is produced by the studio's automated "resident tester" — a program that opens the studio like a member of your staff would, tries the everyday things (start a post, change a colour, switch sizes, download), and also throws dozens of realistic, messy requests at the design helper to see how it copes. It checks the result of each action against a set of quality rules and writes down anything that looked wrong, with a screenshot.

Nothing in this run cost you any photo-generation credits, and nothing it did was saved to your real account — it runs in a sealed sandbox.

## The short version

- **Everyday journeys:** 5 of 10 steps passed.
- **Realistic requests tried:** 31. Of those, 23 triggered at least one quality flag.
- **Total quality flags raised:** 29 (across 5 distinct issue types).
- **Time taken:** 3.4 minutes.  **Estimated AI cost:** $0.68 (34 helper requests).
- **Photo credits spent:** 0 (confirmed — photo generation was fully mocked).
- **Data saved to your account:** none (42 save attempts were intercepted and discarded).

## What needs attention (most important first)

### 1. A finished design showed a "needs attention" mark

- **Priority:** Worth fixing  ·  **Seen:** 23 times this run.
- During: landing-generate
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 6 ready finding(s): media-subject-overlap@ig_portrait, media-subject-overlap@ig_square, media-subject-overlap@story, media-subject-overlap@twitter, media-subject-overlap@facebook, media-subject-overlap@banner
  - Screenshot: `screenshots/001-j1-born-clean-born-clean.png`
- Someone typed: "put our phone number at the bottom 9123 4567"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 6 ready finding(s): media-subject-overlap@ig_portrait, media-subject-overlap@ig_square, media-subject-overlap@story, media-subject-overlap@twitter, media-subject-overlap@facebook, media-subject-overlap@banner
  - Screenshot: `screenshots/007-fuzz-add-text-put-our-phone-number-at-the-bottom-9.png`
- Someone typed: "add small text saying spaces are limited"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 6 ready finding(s): media-subject-overlap@ig_portrait, media-subject-overlap@ig_square, media-subject-overlap@story, media-subject-overlap@twitter, media-subject-overlap@facebook, media-subject-overlap@banner
  - Screenshot: `screenshots/008-fuzz-add-text-add-small-text-saying-spaces-are-lim.png`

### 2. The format bar jumped when switching sizes

- **Priority:** Worth fixing  ·  **Seen:** 3 times this run.
- During: format-switch
  - What we expected: strip Y within 4px of baseline across format switches
  - What happened: [Twitter / X
·] strip top 678 vs baseline 737 (drift 59px)
  - Screenshot: `screenshots/003-j4-format-twitter-x-.png`
- During: format-switch
  - What we expected: strip Y within 4px of baseline across format switches
  - What happened: [Facebook
·] strip top 648 vs baseline 737 (drift 89px)
  - Screenshot: `screenshots/004-j4-format-facebook-.png`
- During: format-switch
  - What we expected: strip Y within 4px of baseline across format switches
  - What happened: [Banner
·] strip top 490 vs baseline 737 (drift 247px)
  - Screenshot: `screenshots/005-j4-format-banner-.png`

### 3. canvas-hit-targets

- **Priority:** Important  ·  **Seen:** 1 time this run.
- During: canvas-hit-targets
  - What we expected: every rendered element (logo + each text role + photo) is directly clickable; no invisible overlay swallows the click
  - What happened: dead/blocked clicks: eyebrow(reachesCanvas=false,top=DIV,insp=none); hero(reachesCanvas=false,top=DIV,insp=none); support(reachesCanvas=false,top=DIV,insp=none); date(reachesCanvas=false,top=DIV,insp=none)
  - Screenshot: `screenshots/002-j3b-hit-targets-canvas-hit-targets.png`

### 4. The helper had to walk back something it said it did

- **Priority:** Important  ·  **Seen:** 1 time this run.
- Someone typed: "make the title bigger"
  - What we expected: an actionable request produces a real change, not a "that changed nothing" reply
  - What happened: helper walked back an actionable request: "Actually — checking the canvas, the title is already as large as this layout can fit, so it didn't visibly grow. Try the “Try another layout” chip for one with "
  - Screenshot: `screenshots/014-fuzz-typography-make-the-title-bigger.png`

### 5. Adding an element did not appear on the design

- **Priority:** Worth fixing  ·  **Seen:** 1 time this run.
- During: add-caption
  - What we expected: adding a caption changes the rendered design
  - What happened: render truth unchanged after add [branch=chip, addChipPresent=true]
  - Screenshot: `screenshots/006-j5-add-caption.png`

## Human feedback

No one filed a `/feedback` note since the last run. (Staff can type `/feedback` followed by what isn't working, in the chat — it captures a snapshot of their current design and sends it here.)

## Everyday journeys — step by step

These are the core things a staff member does. Each was performed automatically and checked.

| Step | Result | Notes |
|---|---|---|
| landing→generate | ✅ passed | reached studio with a composed design |
| born-clean after generate | ⚠️ flagged | born-clean FIRED [media-subject-overlap@ig_portrait, media-subject-overlap@ig_square, media-subject-overlap@story, media-subject-overlap@twitter, media-subject- |
| chat edit (wisteria) | ✅ passed | honesty-apology:ok; claim-vs-changed:ok; offer-without-execution:ok; no-horizontal-overflow:ok; no-console-errors:ok |
| canvas click → inspector | ✅ passed | inspector opened |
| every element clickable (no dead clicks) | ⚠️ flagged | dead/blocked clicks: eyebrow(reachesCanvas=false,top=DIV,insp=none); hero(reachesCanvas=false,top=DIV,insp=none); support(reachesCanvas=false,top=DIV,insp=none) |
| format switch ×N | ⚠️ flagged | broke on Banner
· |
| + Add caption renders | ⚠️ flagged | no role-bound delta and no add confirmation [branch=chip, addChipPresent=true] |
| Posts/History present | ✅ passed | 122 post tile(s) present |
| Export → Ready checklist | ⚠️ flagged | export menu did not open |
| undo reverts | ✅ passed | design truth changed after undo |

## Realistic requests — what the helper did

Each row is a real-world phrasing (typos and all) sent to the design helper, and how it responded.

| What was typed | Kind | Helper replied? | Changed something? | Flags | The helper's reply (short) |
|---|---|---|---|---|---|
| put our phone number at the bottom 9123 4567 | add-text | yes | yes (subtext, elements) | 1 | Added “Call us: 9123 4567” as the small line at the bottom. Tap it on the canvas to edit. |
| add small text saying spaces are limited | add-text | yes | yes (elements) | 1 | Added a caption saying “spaces are limited”. It'll appear on the canvas; tap it to move or edit. If a format has no room |
| wat can i change here | question | yes | no | 1 | Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit i |
| change the date to friday the 18th | edit-text | yes | yes (date) | 1 | Updated the date to “Friday the 18th”. Tap it on the canvas anytime to edit. |
| more of a terracotta vibe | colour | yes | yes (background, fieldColor) | 1 | Changed the background to terracotta. Tap the Background swatch to try another. |
| try another layout | layout | yes | yes (archetype, archVariant, background, fiel) | 0 | Switched to a portrait layout with your words beside the photo — your words are unchanged. Ask again and I'll show you t |
| the title text is hard to read make it darker | colour | yes | yes (headline, elements, text colour, text si) | 0 | Updated the headline to “make it darker”. Tap it on the canvas anytime to edit. |
| can you make it pop more | vague-aesthetic | yes | yes (elements, background, text colour, field) | 1 | Gave it more pop — a bolder field and a punchier photo tone. Tap Undo if it's not the feel you wanted. |
| make it more fun for the kids | vague-aesthetic | yes | yes (background, fieldColor) | 0 | Made it more playful — a brighter field and a livelier photo tone. Tap Undo if it's not the feel you wanted. |
| move the logo to the middle | layout | yes | yes (logo position) | 1 | Moved the logo to the center of the design. |
| the picture doesnt really fit our vibe | photo | yes | yes (elements, background, text backdrop, pho) | 0 | Swapping in a different photo now — it'll refresh on the canvas in a moment. Tap Undo if you preferred the last one. |
| does this look ok to you | question | yes | no | 0 | I can't evaluate designs visually, but if there's anything you'd like to adjust or any feedback you have, I can help wit |
| make the title bigger | typography | yes | no | 1 | Actually — checking the canvas, the title is already as large as this layout can fit, so it didn't visibly grow. Try the |
| it looks a bit boring tbh | vague-aesthetic | yes | yes (elements, background, fieldColor, photo ) | 1 | Gave it more pop — a bolder field and a punchier photo tone. Tap Undo if it's not the feel you wanted. |
| add my name miss tan at the bottom | add-text | yes | yes (attribution, elements) | 1 | Added “Miss Tan” as the sign-off line. Tap it on the canvas to edit. |
| make it warmer | vague-aesthetic | yes | yes (background, fieldColor, photo treatment) | 0 | Warmed it up — a soft butter field and a warm photo grade. Tap Undo if it's not the feel you wanted. |
| i want the photo to fill the whole thing | layout | yes | yes (archetype, background, fieldColor, text ) | 1 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| make it cuter | vague-aesthetic | yes | yes (elements, background, text backdrop, fie) | 1 | Made it sweeter — a soft blush field and a friendlier photo tone. Tap Undo if it's not the feel you wanted. |
| make the background wisteria | colour | yes | yes (background, fieldColor) | 1 | Changed the background to wisteria. Tap the Background swatch to try another. |
| is this the right size for instagram | question | yes | yes (elements, text backdrop, format) | 1 | This design is set for Facebook right now. If you'd like it resized for Instagram, let me know which format you prefer:  |
| pickup changed to 2:30 pls | edit-text | yes | yes (subtext) | 1 | Updated the subtext to 'pickup at 2:30'. |
| can we use a different picture | photo | yes | yes (elements, photo treatment) | 0 | Swapping in a different photo now — it'll refresh on the canvas in a moment. Tap Undo if you preferred the last one. |
| change the photo to children painting | photo | yes | no | 0 | Generating a new photo of children painting now. It'll refresh on the canvas shortly. |
| why is the photo so dark | question | yes | yes (elements) | 1 | The photo currently has a darker treatment to enhance mood. If you'd like it to be brighter, I can adjust the treatment  |
| remove the green solid block | layout | yes | yes (archetype, background, fieldColor, text ) | 1 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| can u change the colour to that mauve one | colour | yes | yes (background, fieldColor) | 1 | Changed the background to lilac. Tap the Background swatch to try another. |
| the headline shud say Open House not open day | edit-text | yes | yes (headline) | 1 | Updated the headline to “Open House”. Tap it on the canvas anytime to edit. |
| softer pls | vague-aesthetic | yes | yes (background, fieldColor, photo treatment) | 1 | Softened it — a gentle blush field and a calmer, cleaner photo tone. Tap Undo if it's not the feel you wanted. |
| can it be a full image post | layout | yes | yes (archetype, background, fieldColor, text ) | 1 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| too much green | colour | yes | yes (elements) | 1 | Changed the background to a soft lilac for a gentler feel. |
| how do i download this | question | yes | no | 1 | Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit i |

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
- **Raw log:** every flag is also recorded in machine-readable form at `scripts/resident-tester/runs/2026-07-23T11-28-26/events.jsonl`, with screenshots in the same folder.

### Notes from this run
- Run mode: deploy smoke. Real-photo generations budgeted this run: 0 (hard cap 3).
- Cloud sessions before run: 10 active + 50 archived.
- Fuzzing pass 1/1: up to 79 utterances (full pool = 31).
- Cloud sessions after run: 10 active + 50 archived → ZERO new session ids (verified clean — the tester wrote nothing to your account).
- Higgsfield calls intercepted during the MOCKED phase: 0 (must be 0).
- Cloud write attempts intercepted + discarded: 42.

---
*Generated by the White Orchid resident tester (deploy smoke run). A deeper nightly sweep — including a small, capped test of real photo generation — runs automatically each night.*
