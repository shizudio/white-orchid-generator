# White Orchid Content Studio — Automated Test Report

**Date:** 2026-07-09  ·  **Type:** deploy smoke run

This report is produced by the studio's automated "resident tester" — a program that opens the studio like a member of your staff would, tries the everyday things (start a post, change a colour, switch sizes, download), and also throws dozens of realistic, messy requests at the design helper to see how it copes. It checks the result of each action against a set of quality rules and writes down anything that looked wrong, with a screenshot.

Nothing in this run cost you any photo-generation credits, and nothing it did was saved to your real account — it runs in a sealed sandbox.

## The short version

- **Everyday journeys:** 6 of 10 steps passed.
- **Realistic requests tried:** 31. Of those, 18 triggered at least one quality flag.
- **Total quality flags raised:** 21 (across 4 distinct issue types).
- **Time taken:** 4.1 minutes.  **Estimated AI cost:** $0.68 (34 helper requests).
- **Photo credits spent:** 0 (confirmed — photo generation was fully mocked).
- **Data saved to your account:** none (49 save attempts were intercepted and discarded).

## What needs attention (most important first)

### 1. A finished design showed a "needs attention" mark

- **Priority:** Worth fixing  ·  **Seen:** 18 times this run.
- Someone typed: "wat can i change here"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 8 ready finding(s): logo-legibility@ig_square, logo-legibility@ig_portrait, copy-dropped@story, thumb-legibility@twitter, logo-legibility@twitter, thumb-legibility@facebook, logo-legibility@facebook, thumb-legibility@banner
  - Screenshot: `screenshots/003-fuzz-question-wat-can-i-change-here.png`
- Someone typed: "does this look ok to you"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 8 ready finding(s): logo-legibility@ig_square, logo-legibility@ig_portrait, copy-dropped@story, thumb-legibility@twitter, logo-legibility@twitter, thumb-legibility@facebook, logo-legibility@facebook, thumb-legibility@banner
  - Screenshot: `screenshots/004-fuzz-question-does-this-look-ok-to-you.png`
- Someone typed: "can we use a different picture"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 8 ready finding(s): logo-legibility@ig_square, logo-legibility@ig_portrait, copy-dropped@story, thumb-legibility@twitter, logo-legibility@twitter, thumb-legibility@facebook, logo-legibility@facebook, thumb-legibility@banner
  - Screenshot: `screenshots/005-fuzz-photo-can-we-use-a-different-picture.png`

### 2. canvas-hit-targets

- **Priority:** Important  ·  **Seen:** 1 time this run.
- During: canvas-hit-targets
  - What we expected: every rendered element (logo + each text role + photo) is directly clickable; no invisible overlay swallows the click
  - What happened: dead/blocked clicks: hero(reachesCanvas=false,top=DIV,insp=none); date(reachesCanvas=false,top=DIV,insp=none); furn_rule_0(reachesCanvas=false,top=DIV,insp=none)
  - Screenshot: `screenshots/001-j3b-hit-targets-canvas-hit-targets.png`

### 3. The helper had to walk back something it said it did

- **Priority:** Important  ·  **Seen:** 1 time this run.
- Someone typed: "add small text saying spaces are limited"
  - What we expected: an actionable request produces a real change, not a "that changed nothing" reply
  - What happened: helper walked back an actionable request: "Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit it directly?"
  - Screenshot: `screenshots/006-fuzz-add-text-add-small-text-saying-spaces-are-lim.png`

### 4. Adding an element did not appear on the design

- **Priority:** Worth fixing  ·  **Seen:** 1 time this run.
- During: add-caption
  - What we expected: adding a caption changes the rendered design
  - What happened: render truth unchanged after add [branch=chip, addChipPresent=true]
  - Screenshot: `screenshots/002-j5-add-caption.png`

## Human feedback

These are real notes a person typed with the `/feedback` command while using the studio — a human telling us, mid-task, that something wasn't working. Each note captured a snapshot of the design at that moment. This is the highest-value signal in the report.

### “the caption is not too small, very readable, why is the purple beam suggesting otherwise?”

- **When:** 2026-07-07 07:07
- **Format:** banner
- **Design snapshot:** captured inline with this note (a small image of what they were looking at).

### “cant fix some of the purple beams”

- **When:** 2026-07-06 14:06
- **Format:** twitter
- **Design snapshot:** captured inline with this note (a small image of what they were looking at).
- **Advisor flags active at the time:** 4 format(s) showed "needs attention".

### “the purple dot ask me to edit the size of the date myself but theres no manual function to do so”

- **When:** 2026-07-06 10:39
- **Format:** ig_square
- **Design snapshot:** captured inline with this note (a small image of what they were looking at).
- **Advisor flags active at the time:** 6 format(s) showed "needs attention".

### “the 18 july is overlapping with the header, not being detected as bad design”

- **When:** 2026-07-06 10:37
- **Format:** ig_square
- **Design snapshot:** captured inline with this note (a small image of what they were looking at).
- **Advisor flags active at the time:** 6 format(s) showed "needs attention".
- **They added:** “it should not be happening as the default suggestion”

### “wrong url and i cannot manually add url : url should be https://www.thewhiteorchid.sg/”

- **When:** 2026-07-06 10:33
- **Format:** ig_square
- **Design snapshot:** captured inline with this note (a small image of what they were looking at).
- **Advisor flags active at the time:** 3 format(s) showed "needs attention".

### “i cannot click anything else thats text other than the header”

- **When:** 2026-07-06 10:30
- **Format:** ig_square
- **Design snapshot:** captured inline with this note (a small image of what they were looking at).
- **Advisor flags active at the time:** 3 format(s) showed "needs attention".

### “the wisteria pill does nothing”

- **When:** 2026-07-06 10:20
- **Format:** ig_square
- **Design snapshot:** captured inline with this note (a small image of what they were looking at).
- **Advisor flags active at the time:** 4 format(s) showed "needs attention".
- **They added:** “I expected it to open the color picker”

## Everyday journeys — step by step

These are the core things a staff member does. Each was performed automatically and checked.

| Step | Result | Notes |
|---|---|---|
| landing→generate | ✅ passed | reached studio with a composed design |
| born-clean after generate | ✅ passed | born-clean; no-horizontal-overflow:ok; canvas-buffer-matches-dims:ok; no-console-errors:ok |
| chat edit (wisteria) | ✅ passed | honesty-apology:ok; claim-vs-changed:ok; offer-without-execution:ok; no-horizontal-overflow:ok; no-console-errors:ok |
| canvas click → inspector | ✅ passed | inspector opened |
| every element clickable (no dead clicks) | ⚠️ flagged | dead/blocked clicks: hero(reachesCanvas=false,top=DIV,insp=none); date(reachesCanvas=false,top=DIV,insp=none); furn_rule_0(reachesCanvas=false,top=DIV,insp=none |
| format switch ×N | ⚠️ flagged | 0 formats, no dead space / strip jump |
| + Add caption renders | ⚠️ flagged | no role-bound delta and no add confirmation [branch=chip, addChipPresent=true] |
| Posts/History present | ✅ passed | no posts yet (fresh device) |
| Export → Ready checklist | ⚠️ flagged | export menu did not open |
| undo reverts | ✅ passed | design truth changed after undo |

## Realistic requests — what the helper did

Each row is a real-world phrasing (typos and all) sent to the design helper, and how it responded.

| What was typed | Kind | Helper replied? | Changed something? | Flags | The helper's reply (short) |
|---|---|---|---|---|---|
| wat can i change here | question | yes | no | 1 | Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit i |
| does this look ok to you | question | yes | no | 1 | I can't assess the visual appearance, but I can help with any specific elements you're unsure about or want to change. L |
| can we use a different picture | photo | yes | no | 1 | Generating a new photo now. What scene or subject would you like the new image to depict? |
| add small text saying spaces are limited | add-text | yes | no | 2 | Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit i |
| the picture doesnt really fit our vibe | photo | yes | no | 1 | Generating a new photo now. Please specify what you'd like it to show, and I'll replace the current image. |
| can it be a full image post | layout | yes | yes (archetype) | 1 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| can u change the colour to that mauve one | colour | yes | yes (background, fieldColor) | 1 | Changed the background to wisteria. Tap the Background swatch to try another. |
| the title text is hard to read make it darker | colour | yes | yes (headline, text colour) | 1 | Updated the headline to “make it darker”. Tap it on the canvas anytime to edit. |
| make the title bigger | typography | yes | yes (text size) | 1 | Made the title bigger. Tap it on the canvas to fine-tune the size. |
| softer pls | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 1 | Softened it — a gentle blush field and a calmer, cleaner photo tone. Tap Undo if it's not the feel you wanted. |
| can you make it pop more | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 1 | Gave it more pop — a bolder field and a punchier photo tone. Tap Undo if it's not the feel you wanted. |
| i want the photo to fill the whole thing | layout | yes | no | 0 | One honest note — this layout doesn't actually show the date, so it isn't visible on the canvas. Want me to switch to a  |
| put our phone number at the bottom 9123 4567 | add-text | yes | yes (subtext, date) | 0 | Added “Call us: 9123 4567” as the small line at the bottom. Tap it on the canvas to edit. |
| change the date to friday the 18th | edit-text | yes | no | 0 | One honest note — this layout doesn't actually show the date, so it isn't visible on the canvas. Want me to switch to a  |
| add my name miss tan at the bottom | add-text | yes | yes (attribution) | 0 | Added “Miss Tan” as the sign-off line. Tap it on the canvas to edit. |
| more of a terracotta vibe | colour | yes | yes (background, fieldColor) | 1 | Changed the background to terracotta. Tap the Background swatch to try another. |
| it looks a bit boring tbh | vague-aesthetic | yes | no | 1 | One honest note — this layout doesn't actually show the date, so it isn't visible on the canvas. Want me to switch to a  |
| why is the photo so dark | question | yes | no | 1 | Correction — that actually worked: I changed the date, background, photo treatment. Tap Undo if that isn't what you want |
| the headline shud say Open House not open day | edit-text | yes | yes (headline) | 1 | Updated the headline to “Open House”. Tap it on the canvas anytime to edit. |
| how do i download this | question | yes | no | 1 | I can't assist with downloading directly, but you can usually find a download option in the top right corner of your des |
| move the logo to the middle | layout | yes | yes (logo position) | 1 | Moved the logo to the center of the canvas. |
| make it cuter | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 1 | Made it sweeter — a soft blush field and a friendlier photo tone. Tap Undo if it's not the feel you wanted. |
| is this the right size for instagram | question | yes | yes (format) | 0 | The current size is set for an Instagram portrait post, which is suitable. If you prefer a square format, let me know to |
| pickup changed to 2:30 pls | edit-text | yes | yes (subtext) | 0 | Updated the subtext to read 'pickup is at 2:30'. |
| make it warmer | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 0 | Warmed it up — a soft butter field and a warm photo grade. Tap Undo if it's not the feel you wanted. |
| change the photo to children painting | photo | yes | no | 0 | Generating a new photo of children painting now. This will replace the current image. |
| too much green | colour | yes | no | 0 | I can't do that yet. You can tap the photo on the canvas to reframe it, or let me know what you would like to see instea |
| remove the green solid block | layout | yes | yes (archetype) | 0 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| make the background wisteria | colour | yes | yes (background, fieldColor) | 0 | Changed the background to wisteria. Tap the Background swatch to try another. |
| make it more fun for the kids | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 0 | Made it more playful — a brighter field and a livelier photo tone. Tap Undo if it's not the feel you wanted. |
| try another layout | layout | yes | yes (post type, archetype, background) | 0 | Switched to a quote layout for more emphasis on your message. |

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
- **Raw log:** every flag is also recorded in machine-readable form at `scripts/resident-tester/runs/2026-07-09T12-15-20/events.jsonl`, with screenshots in the same folder.

### Notes from this run
- Run mode: deploy smoke. Real-photo generations budgeted this run: 0 (hard cap 3).
- Cloud sessions before run: 10 active + 50 archived.
- Fuzzing pass 1/1: up to 79 utterances (full pool = 31).
- Cloud sessions after run: 10 active + 50 archived → ZERO new session ids (verified clean — the tester wrote nothing to your account).
- Higgsfield calls intercepted during the MOCKED phase: 0 (must be 0).
- Cloud write attempts intercepted + discarded: 49.

---
*Generated by the White Orchid resident tester (deploy smoke run). A deeper nightly sweep — including a small, capped test of real photo generation — runs automatically each night.*
