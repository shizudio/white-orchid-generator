# White Orchid Content Studio — Automated Test Report

**Date:** 2026-07-15  ·  **Type:** deploy smoke run

This report is produced by the studio's automated "resident tester" — a program that opens the studio like a member of your staff would, tries the everyday things (start a post, change a colour, switch sizes, download), and also throws dozens of realistic, messy requests at the design helper to see how it copes. It checks the result of each action against a set of quality rules and writes down anything that looked wrong, with a screenshot.

Nothing in this run cost you any photo-generation credits, and nothing it did was saved to your real account — it runs in a sealed sandbox.

## The short version

- **Everyday journeys:** 8 of 10 steps passed.
- **Realistic requests tried:** 31. Of those, 8 triggered at least one quality flag.
- **Total quality flags raised:** 11 (across 2 distinct issue types).
- **Time taken:** 3.9 minutes.  **Estimated AI cost:** $0.68 (34 helper requests).
- **Photo credits spent:** 0 (confirmed — photo generation was fully mocked).
- **Data saved to your account:** none (41 save attempts were intercepted and discarded).

## What needs attention (most important first)

### 1. A finished design showed a "needs attention" mark

- **Priority:** Worth fixing  ·  **Seen:** 8 times this run.
- Someone typed: "the title text is hard to read make it darker"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 3 ready finding(s): thumb-legibility@twitter, thumb-legibility@facebook, thumb-legibility@banner
  - Screenshot: `screenshots/004-fuzz-colour-the-title-text-is-hard-to-read-make-it.png`
- Someone typed: "add my name miss tan at the bottom"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 3 ready finding(s): thumb-legibility@twitter, thumb-legibility@facebook, thumb-legibility@banner
  - Screenshot: `screenshots/005-fuzz-add-text-add-my-name-miss-tan-at-the-bottom.png`
- Someone typed: "more of a terracotta vibe"
  - What we expected: zero deterministic findings on a system-produced design
  - What happened: 1 advisor dot(s), 9 ready finding(s): contrast-fail@ig_portrait, contrast-fail@ig_square, contrast-fail@story, contrast-fail@twitter, thumb-legibility@twitter, contrast-fail@facebook, thumb-legibility@facebook, contrast-fail@banner, thumb-legibility@banner
  - Screenshot: `screenshots/006-fuzz-colour-more-of-a-terracotta-vibe.png`

### 2. The format bar jumped when switching sizes

- **Priority:** Worth fixing  ·  **Seen:** 3 times this run.
- During: format-switch
  - What we expected: strip Y within 4px of baseline across format switches
  - What happened: [Twitter / X
·] strip top 678 vs baseline 737 (drift 59px)
  - Screenshot: `screenshots/001-j4-format-twitter-x-.png`
- During: format-switch
  - What we expected: strip Y within 4px of baseline across format switches
  - What happened: [Facebook
·] strip top 648 vs baseline 737 (drift 89px)
  - Screenshot: `screenshots/002-j4-format-facebook-.png`
- During: format-switch
  - What we expected: strip Y within 4px of baseline across format switches
  - What happened: [Banner
·] strip top 490 vs baseline 737 (drift 247px)
  - Screenshot: `screenshots/003-j4-format-banner-.png`

## Human feedback

No one filed a `/feedback` note since the last run. (Staff can type `/feedback` followed by what isn't working, in the chat — it captures a snapshot of their current design and sends it here.)

## Everyday journeys — step by step

These are the core things a staff member does. Each was performed automatically and checked.

| Step | Result | Notes |
|---|---|---|
| landing→generate | ✅ passed | reached studio with a composed design |
| born-clean after generate | ✅ passed | born-clean; no-horizontal-overflow:ok; canvas-buffer-matches-dims:ok; no-console-errors:ok |
| chat edit (wisteria) | ✅ passed | honesty-apology:ok; claim-vs-changed:ok; offer-without-execution:ok; no-horizontal-overflow:ok; no-console-errors:ok |
| canvas click → inspector | ✅ passed | inspector opened |
| every element clickable (no dead clicks) | ✅ passed | 2 rendered element(s) all clickable (logo + roles reach the canvas + open an inspector) |
| format switch ×N | ⚠️ flagged | broke on Banner
· |
| + Add caption renders | ✅ passed | caption landed via chip (confirmed by reply) |
| Posts/History present | ✅ passed | 122 post tile(s) present |
| Export → Ready checklist | ⚠️ flagged | export menu did not open |
| undo reverts | ✅ passed | design truth changed after undo |

## Realistic requests — what the helper did

Each row is a real-world phrasing (typos and all) sent to the design helper, and how it responded.

| What was typed | Kind | Helper replied? | Changed something? | Flags | The helper's reply (short) |
|---|---|---|---|---|---|
| the title text is hard to read make it darker | colour | yes | yes (headline, text colour) | 1 | Updated the headline to “make it darker”. Tap it on the canvas anytime to edit. |
| wat can i change here | question | yes | yes (headline, attribution) | 0 | You can change the headline, subtext, attribution, or add caption text. You can also adjust the logo position, size, or  |
| remove the green solid block | layout | yes | yes (archetype, archVariant, background, fiel) | 0 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| make the title bigger | typography | yes | yes (text size) | 0 | Made the title bigger. Tap it on the canvas to fine-tune the size. |
| change the photo to children painting | photo | yes | no | 0 | Generating a new photo of children painting now. |
| add my name miss tan at the bottom | add-text | yes | yes (attribution, eyebrow, pill) | 1 | Added “Miss Tan” as the sign-off line. Tap it on the canvas to edit. |
| is this the right size for instagram | question | yes | yes (format) | 0 | The current size is set to banner, which is wider than the Instagram dimensions. For Instagram, I recommend switching to |
| can we use a different picture | photo | yes | no | 0 | Sure, please describe the new picture you’d like, and I'll generate it for you. |
| change the date to friday the 18th | edit-text | yes | no | 0 | One honest note — this layout doesn't actually show the date, so it isn't visible on the canvas. Want me to switch to a  |
| make it warmer | vague-aesthetic | yes | yes (date, background, photo treatment, field) | 0 | Warmed it up — a soft butter field and a warm photo grade. Tap Undo if it's not the feel you wanted. |
| why is the photo so dark | question | yes | yes (photo treatment) | 0 | The photo treatment is set to a warm grade, which can sometimes result in darker tones depending on the image used. If y |
| move the logo to the middle | layout | yes | yes (logo position) | 0 | Moved the logo to the center of the canvas. |
| make it cuter | vague-aesthetic | yes | yes (background, fieldColor) | 0 | Made it sweeter — a soft blush field and a friendlier photo tone. Tap Undo if it's not the feel you wanted. |
| make it more fun for the kids | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 0 | Made it more playful — a brighter field and a livelier photo tone. Tap Undo if it's not the feel you wanted. |
| the picture doesnt really fit our vibe | photo | yes | no | 0 | Generating a new photo of children engaging in a creative activity now. It will replace the current image soon. |
| how do i download this | question | yes | no | 0 | I can't help with downloads directly. You can typically download the design by tapping a download button in your editor  |
| the headline shud say Open House not open day | edit-text | yes | yes (headline) | 0 | Updated the headline to “Open House”. Tap it on the canvas anytime to edit. |
| can it be a full image post | layout | yes | yes (archetype, background, fieldColor, eyebr) | 0 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| it looks a bit boring tbh | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 0 | Gave it more pop — a bolder field and a punchier photo tone. Tap Undo if it's not the feel you wanted. |
| make the background wisteria | colour | yes | yes (background, fieldColor) | 0 | Changed the background to wisteria. Tap the Background swatch to try another. |
| put our phone number at the bottom 9123 4567 | add-text | yes | yes (post type, headline, subtext, attributio) | 0 | Added “Call us: 9123 4567” as the small line at the bottom. Tap it on the canvas to edit. |
| pickup changed to 2:30 pls | edit-text | yes | yes (subtext) | 0 | Updated the caption to "pickup at 2:30". Tap it on the canvas to edit further. |
| try another layout | layout | yes | yes (archetype, background, fieldColor, eyebr) | 0 | Switched to a photo-and-text split — your words are unchanged. Ask again and I'll show you the next one. |
| add small text saying spaces are limited | add-text | yes | yes (eyebrow, background) | 0 | Added that as a small label at the top: 'Spaces are limited'. Tap it to edit anytime. |
| more of a terracotta vibe | colour | yes | yes (background, fieldColor) | 1 | Changed the background to terracotta. Tap the Background swatch to try another. |
| does this look ok to you | question | yes | no | 1 | I can't evaluate designs, but I'm here to help make any adjustments you want. Let me know if you'd like to tweak somethi |
| softer pls | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 0 | Softened it — a gentle blush field and a calmer, cleaner photo tone. Tap Undo if it's not the feel you wanted. |
| i want the photo to fill the whole thing | layout | yes | yes (post type, archetype, background, fieldC) | 1 | The photo is already filling the whole frame on this layout. To make it larger or reposition it, tap the photo on the ca |
| can you make it pop more | vague-aesthetic | yes | yes (background, photo treatment, fieldColor) | 1 | Gave it more pop — a bolder field and a punchier photo tone. Tap Undo if it's not the feel you wanted. |
| can u change the colour to that mauve one | colour | yes | yes (background, fieldColor) | 1 | Changed the background to wisteria. Tap the Background swatch to try another. |
| too much green | colour | yes | yes (background) | 1 | Adjusted the background to a softer and warmer hue for a more balanced look. The tone should feel less green now. |

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
- **Raw log:** every flag is also recorded in machine-readable form at `scripts/resident-tester/runs/2026-07-15T03-00-09/events.jsonl`, with screenshots in the same folder.

### Notes from this run
- Run mode: deploy smoke. Real-photo generations budgeted this run: 0 (hard cap 3).
- Cloud sessions before run: 10 active + 50 archived.
- Fuzzing pass 1/1: up to 79 utterances (full pool = 31).
- Cloud sessions after run: 10 active + 50 archived → ZERO new session ids (verified clean — the tester wrote nothing to your account).
- Higgsfield calls intercepted during the MOCKED phase: 0 (must be 0).
- Cloud write attempts intercepted + discarded: 41.

---
*Generated by the White Orchid resident tester (deploy smoke run). A deeper nightly sweep — including a small, capped test of real photo generation — runs automatically each night.*
