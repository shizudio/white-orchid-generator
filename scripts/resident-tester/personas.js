// ── Resident Tester — persona utterance pool ─────────────────────────────────
// ~30 realistic preschool-staff utterances: vague, typo-laden, colloquial. These
// are what actual non-technical staff type — the studio's target users, who are
// fluent at PROMPTING, not design tools (docs/ux-architecture.md §0). The fuzzer
// samples ~10–15 per smoke run and runs the oracle battery after every turn.
//
// Each entry carries a light EXPECTATION hint the oracles use to sharpen the
// claim-vs-render check (e.g. a colour ask should touch a colour field). `kind`
// buckets them for the report; `expectChange` is whether a well-behaved studio
// SHOULD alter the design (a pure question shouldn't).

module.exports = [
  // ── Vague aesthetic nudges ──────────────────────────────────────────────
  { text: 'make it cuter', kind: 'vague-aesthetic', expectChange: true },
  { text: 'too much green', kind: 'colour', expectChange: true, expectFields: ['bgColorId', 'archetypeId', 'textColorId'] },
  { text: 'make it warmer', kind: 'vague-aesthetic', expectChange: true },
  { text: 'can you make it pop more', kind: 'vague-aesthetic', expectChange: true },
  { text: 'it looks a bit boring tbh', kind: 'vague-aesthetic', expectChange: true },
  { text: 'make it more fun for the kids', kind: 'vague-aesthetic', expectChange: true },
  { text: 'softer pls', kind: 'vague-aesthetic', expectChange: true },

  // ── Colour asks (typos + colloquial colour names) ───────────────────────
  { text: 'make the background wisteria', kind: 'colour', expectChange: true, expectFields: ['bgColorId'] },
  { text: 'can u change the colour to that mauve one', kind: 'colour', expectChange: true, expectFields: ['bgColorId', 'textColorId'] },
  { text: 'the title text is hard to read make it darker', kind: 'colour', expectChange: true, expectFields: ['textColorId'] },
  { text: 'more of a terracotta vibe', kind: 'colour', expectChange: true },

  // ── Text / copy edits ───────────────────────────────────────────────────
  { text: 'add my name miss tan at the bottom', kind: 'add-text', expectChange: true, expectFields: ['attribution'] },
  { text: 'pickup changed to 2:30 pls', kind: 'edit-text', expectChange: true, expectFields: ['subtext', 'dateText'] },
  { text: 'change the date to friday the 18th', kind: 'edit-text', expectChange: true, expectFields: ['dateText'] },
  { text: 'add small text saying spaces are limited', kind: 'add-text', expectChange: true, expectFields: ['subtext'] },
  { text: 'the headline shud say Open House not open day', kind: 'edit-text', expectChange: true, expectFields: ['headline'] },
  { text: 'make the title bigger', kind: 'typography', expectChange: true },
  { text: 'put our phone number at the bottom 9123 4567', kind: 'add-text', expectChange: true, expectFields: ['subtext', 'attribution'] },

  // ── Layout / structure ──────────────────────────────────────────────────
  { text: 'try another layout', kind: 'layout', expectChange: true, expectFields: ['archetypeId'] },
  { text: 'i want the photo to fill the whole thing', kind: 'layout', expectChange: true, expectFields: ['archetypeId'] },
  { text: 'remove the green solid block', kind: 'layout', expectChange: true, expectFields: ['archetypeId'] },
  { text: 'can it be a full image post', kind: 'layout', expectChange: true, expectFields: ['archetypeId'] },
  { text: 'move the logo to the middle', kind: 'layout', expectChange: true },

  // ── Photo asks ──────────────────────────────────────────────────────────
  { text: 'change the photo to children painting', kind: 'photo', expectChange: true },
  { text: 'why is the photo so dark', kind: 'question', expectChange: false },
  { text: 'can we use a different picture', kind: 'photo', expectChange: true },
  { text: 'the picture doesnt really fit our vibe', kind: 'photo', expectChange: true },

  // ── Questions / non-actions (a good studio should NOT silently mutate) ───
  { text: 'is this the right size for instagram', kind: 'question', expectChange: false },
  { text: 'how do i download this', kind: 'question', expectChange: false },
  { text: 'does this look ok to you', kind: 'question', expectChange: false },
  { text: 'wat can i change here', kind: 'question', expectChange: false },
];
