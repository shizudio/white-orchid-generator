/* ─────────────────────────────────────────────────────────────────────────
   BRAND DEFAULTS — the single source of truth for every White-Orchid-specific
   constant (multi-tenancy P1, docs/multi-tenancy-spec.md §P1).

   THE RULE: code contains zero brand facts — every value here is what the DB
   (brand_kit + assets) is expected to hold for the default brand row
   (00000000-0000-0000-0000-000000000001). When the DB is unreachable or a
   field is unset, the app reads THESE constants instead, so a missing row
   degrades to exactly today's White Orchid look — never a blank/broken UI.

   Do NOT add new brand facts as inline literals elsewhere; add them here and
   import. Consumers: components/Generator.jsx (client canvas + chrome),
   app/api/assistant/route.js (voice/tone + landing pools), lib/higgsfield.js
   (photographer brief). Server routes additionally prefer a live brand_kit
   row (see app/api/brand/route.js); these are the fallback, not the primary.
   ───────────────────────────────────────────────────────────────────────── */

// ── PALETTE (was Generator.jsx `B`) ─────────────────────────────────────────
// brand_kit.colors rows map onto these keys via the label→key table in
// applyBrandKit (components/Generator.jsx). Keep hexes IDENTICAL to today's
// values — this is the pixel-identity fallback.
export const DEFAULT_PALETTE = {
  burnham:"#254E48", whiteSmoke:"#F5F6E7", wisteria:"#DEC5D8",
  tangerine:"#F6644E", yellowGreen:"#A5CF61", celadon:"#B4D6C0",
  ash:"#D1C8C8", jet:"#282B28",
  burnhamDk:"#1B3B36", celadonDeep:"#7FA88C",
  // Curated pastel field family (spec §3 colour discipline, rev: childcare set).
  dustyPink:"#E7C9CC", butter:"#F2E2A8", sky:"#C4D8E2",
  sage:"#C3D2BC", terracotta:"#D08C6E", lilac:"#D6C8E0",
};

// ── TYPOGRAPHY ROLE MAP (was Generator.jsx `F`) ─────────────────────────────
// brand_kit.font_heading / font_body / font_ui hydrate title/quote, body, and
// subtitle respectively (applyBrandKit). logo stays a fixed wordmark face
// (Aboreto) — not brand_kit-hydrated in P1 (the logo is a rendered asset, not
// a settable font role) — kept here anyway as the single source of truth.
export const DEFAULT_FONTS = {
  title:"'Romie','Cormorant Garamond',Georgia,serif",
  quote:"'Romie','Cormorant Garamond',Georgia,serif",
  subtitle:"'Syne','Helvetica Neue',sans-serif",
  body:"'Fira Sans','Helvetica Neue',sans-serif",
  logo:"'Aboreto',sans-serif",
};

// ── TYPOGRAPHY CONFIG — brand-configurable registers (Font Ruling B, 2026-07-23) ──
// The ruling: fonts become flexible THROUGH the register system, not around it. A
// register is a named typographic voice (serif / heavySans / body / eyebrow / badge);
// the brand profile decides which FONT ROLE each register uses and which registers each
// element CLASS is allowed to choose. `role` names a brand font role (heading/body/ui →
// font_heading/font_body/font_ui, hydrated into the canvas F map as title/body/subtitle),
// so this config carries zero literal family names — the families still live in
// font_heading/font_body/font_ui. `weightRange` bounds the sanctioned weights a register's
// escalation ladder may walk.
//
// THIS IS THE IDENTITY FALLBACK: the values below reproduce today's hardcoded solver
// registers EXACTLY (element-placement-solver make*Class ladders reference F.title for the
// serif/date register, F.subtitle for the heavySans/eyebrow/badge register, F.body for the
// support register). brand_kit.typography_config overrides it per brand; a missing column/
// row/field degrades to this — never a 500, never a changed default look. Mirrors the
// schema.sql brand_kit.typography_config seed 1:1 (kept in sync by hand).
export const DEFAULT_TYPOGRAPHY_CONFIG = {
  registers: {
    // the elegant light serif hero/date voice (F.title) — 300..700 sanctioned weights
    serif:     { role:"heading", weightRange:[300, 700] },
    // the heavy-sans hero alternate (F.subtitle) — the heroRegister:"heavySans" path
    heavySans: { role:"ui",      weightRange:[700, 800] },
    // the reading support voice (F.body) — subheading + body classes
    body:      { role:"body",    weightRange:[400, 700] },
    // the tracked all-caps micro-label voice (F.subtitle, drawn caps+tracked)
    eyebrow:   { role:"ui",      weightRange:[400, 700] },
    // the opaque accent-pill voice (F.subtitle) — self-legible, single weight
    badge:     { role:"ui",      weightRange:[600, 600] },
  },
  // which registers each sanctioned element class may choose (the per-element switch's
  // allowlist). Matches the classes' current 1:1 register bindings in the solver:
  // heading → serif|heavySans (makeHeadingClass), sub/body → body (makeSupportClass),
  // caption → serif(date)|eyebrow (makeDateClass/makeEyebrowClass), cta → badge (makeBadgeClass).
  classRegisters: {
    heading:    ["serif", "heavySans"],
    subheading: ["body"],
    body:       ["body"],
    caption:    ["serif", "eyebrow"],
    cta:        ["badge"],
  },
};

// ── LOGO VARIANTS (was Generator.jsx `LOGO_VARIANTS`) ───────────────────────
// Mirrors lib/schema.sql `logo_variants` rows 1:1 (id/label/group/color_tone/
// storage_path/sort_order → id/label/group/color/src). This fallback renders
// verbatim when the table is empty/unreachable, so a fresh brand or a DB
// outage still shows the White Orchid lockups exactly as today.
export const DEFAULT_LOGO_VARIANTS = [
  // Primary
  { id:"p1-green",  label:"Primary 1",  group:"primary",  color:"green", shape:"horizontal", src:"/assets/logos/primary/primary-1-green.svg" },
  { id:"p1-ivory",  label:"Primary 1",  group:"primary",  color:"ivory", shape:"horizontal", src:"/assets/logos/primary/primary-1-ivory.svg" },
  { id:"p2-green",  label:"Primary 2",  group:"primary",  color:"green", shape:"horizontal", wide:true, src:"/assets/logos/primary/primary-2-green.svg" },
  { id:"p2-ivory",  label:"Primary 2",  group:"primary",  color:"ivory", shape:"horizontal", wide:true, src:"/assets/logos/primary/primary-2-ivory.svg" },
  { id:"p3-green",  label:"Primary 3",  group:"primary",  color:"green", shape:"stacked", src:"/assets/logos/primary/primary-3-green.svg" },
  { id:"p3-ivory",  label:"Primary 3",  group:"primary",  color:"ivory", shape:"stacked", src:"/assets/logos/primary/primary-3-flat-ivory.svg" },
  { id:"p3f-green", label:"Primary 3 Flat", group:"primary", color:"green", shape:"stacked", src:"/assets/logos/primary/primary-3-flat-green.svg" },
  { id:"p4",        label:"Primary 4",  group:"primary",  color:"green", shape:"square", src:"/assets/logos/primary/primary-4.svg" },
  { id:"p-central", label:"Central",    group:"primary",  color:"green", shape:"horizontal", src:"/assets/logos/primary/primary-central-green.svg" },
  { id:"p-circle",  label:"Circle",     group:"primary",  color:"green", shape:"mark", src:"/assets/logos/primary/primary-circle.svg" },
  { id:"p-bg",      label:"With BG",    group:"primary",  color:"green", shape:"mark", src:"/assets/logos/primary/primary-bg-green.svg" },
  // Secondary
  { id:"s1-green",  label:"Secondary 1", group:"secondary", color:"green", shape:"square", src:"/assets/logos/secondary/secondary-1-green.svg" },
  { id:"s1-ivory",  label:"Secondary 1", group:"secondary", color:"ivory", shape:"square", src:"/assets/logos/secondary/secondary-1-ivory.svg" },
  { id:"s2-green",  label:"Secondary 2", group:"secondary", color:"green", shape:"horizontal", src:"/assets/logos/secondary/secondary-2-green.svg" },
];

// ── BUILT-IN OVERLAY SHAPES (was Generator.jsx `DEFAULT_OVERLAYS`) ──────────
// The signature petal/shape + accessory set. brand-assets (app/api/brand-assets)
// layers OFFICIAL uploads on top of these; these built-ins remain the fallback
// so + Add → Shapes is never empty for a brand that hasn't uploaded its own.
export const DEFAULT_OVERLAY_ASSETS = [
  // (client ruling 2026-07-27) The BRAND PETAL — derived (never invented, law 3)
  // from the ratified orchid mark: the lower-left sweeping petal path of
  // /assets/logos/primary/primary-bg-green.svg, translated into its own viewBox
  // (see the provenance comment inside petal-brand.svg). Ships FULL opacity —
  // it is the Petal Window's mask silhouette (PETAL_WINDOW_MASK_ASSET below).
  { id:"petal-brand", name:"Petal", src:"/assets/shapes/petal-brand.svg", kind:"center", ratio:5758/5729, category:"overlays", builtin:true },
  { id:"shape-1", name:"Shape 1", src:"/assets/shapes/shape-1.svg", kind:"center", ratio:169/207, category:"overlays", builtin:true },
  { id:"shape-2", name:"Shape 2", src:"/assets/shapes/shape-2.svg", kind:"center", ratio:217/196, category:"overlays", builtin:true },
  { id:"shape-3", name:"Shape 3", src:"/assets/shapes/shape-3.svg", kind:"center", ratio:173/207, category:"overlays", builtin:true },
  { id:"acc-arrow", name:"Arrow", src:"/assets/accessories/arrow.svg", kind:"accessory", ratio:3, category:"accessories", builtin:true },
  { id:"acc-curve", name:"Curved Arrow", src:"/assets/accessories/curved-arrow.svg", kind:"accessory", ratio:1, category:"accessories", builtin:true },
  { id:"acc-spark", name:"Spark", src:"/assets/accessories/spark.svg", kind:"accessory", ratio:1, category:"accessories", builtin:true },
  { id:"acc-plus", name:"Plus", src:"/assets/accessories/plus.svg", kind:"accessory", ratio:1, category:"accessories", builtin:true },
  { id:"acc-ring", name:"Ring", src:"/assets/accessories/ring.svg", kind:"accessory", ratio:1, category:"accessories", builtin:true },
  { id:"acc-wave", name:"Wave", src:"/assets/accessories/wave.svg", kind:"accessory", ratio:3, category:"accessories", builtin:true },
];

// ── RETIRED OVERLAY ART (client ruling 2026-07-23) ───────────────────────────
// "this orchid in particular is not our branded orchid, so i want to remove the
// component from our design entirely." The 5-petal line "orchid-petal" artwork is
// OFF-BRAND and must stop being paintable ANYWHERE: it is no longer in
// DEFAULT_OVERLAY_ASSETS above, no longer seeded in schema.sql, and is filtered
// out of the + Add shape tray even if a stale cloud brand_overlays row still
// serves it (the tray reads whichever list wins — so the guard is on the tray).
// Placed instances (stored shapes) and the Petal Window archetype's photo mask
// migrate to the sanctioned organic silhouette below, which keeps petal_window's
// character (the egg/blob "Shape 1" family). The real brand LOGO orchid (logo
// variants) is a DIFFERENT asset and is untouched by this retirement.
export const RETIRED_OVERLAY_ASSETS = ["orchid-petal"];
export const RETIRED_OVERLAY_REPLACEMENT = "shape-1";

// ── PETAL WINDOW MASK (client ruling 2026-07-27) ─────────────────────────────
// The Petal Window archetype's photo mask is the BRAND petal derived from the
// ratified orchid mark ("petal-brand" above) — option 1 of the three offered.
// This replaces the interim shape-1 egg the 2026-07-23 purge fell back to (that
// purge removed the WRONG art, the off-brand orchid-petal; this constant now
// points the window at the RIGHT art). Every petalMask fallback/migration and
// the Petal Frame starter card mask read THIS constant — placed-instance
// migration of retired decor stays RETIRED_OVERLAY_REPLACEMENT and is separate.
export const PETAL_WINDOW_MASK_ASSET = "petal-brand";

// ── IDENTITY STRINGS ─────────────────────────────────────────────────────────
// Brand name, wordmark, AI assistant name, default canvas furniture copy, and
// the studio's voice/tone description. brand_kit.name / .assistant_name /
// .tone hydrate these; identical fallback text below.
export const DEFAULT_BRAND_NAME = 'The White Orchid';
// Canonical site: https://www.thewhiteorchid.sg/ — canvas furniture shows the
// short display form (client correction 2026-07-10; was the wrong .co TLD).
export const DEFAULT_BRAND_URL = 'thewhiteorchid.sg';
export const DEFAULT_ASSISTANT_NAME = 'Orchid';
export const DEFAULT_TONE = 'warm, thoughtful, premium, clear and human';
// Canvas furniture default copy (drawFurniture fallbacks when a design's
// furniture item carries no explicit text — components/Generator.jsx).
export const DEFAULT_FURNITURE_TEXT = {
  counterweight: DEFAULT_BRAND_URL,
  badge: 'NOW ENROLLING',
};

// ── VOICE / TONE COPY RULES (assistant system prompt, app/api/assistant) ───
// The prose block describing house voice — moved verbatim from the hardcoded
// systemPrompt so a brand_kit.voice_rules override can replace it wholesale.
export const DEFAULT_VOICE_RULES = `Warm, plain-English, never salesy.
COPY TONE (applies to EVERY copy field you write — headline, subtext, attribution, reply):
- NEVER use an exclamation mark. Not one. Calm confidence, not excitement.
- Never salesy or promotional ("Join us for a day of discovery and learning!" is exactly wrong). No urgency phrases, no hype adjectives, no "don't miss".
- Sentence case, not Title Case ("Come and see for yourself", not "Join Us For Our Open House").
- Short, quiet, editorial. An invitation reads like a note from a calm teacher, not a flyer.
- Avoid brochure clichés: "Join us for…", "a day of discovery and learning", "fun-filled", "exciting". Prefer plain, concrete lines ("Come and see for yourself", "Doors open at nine").`;

// ── GUARDRAILS (shown to staff before export) ───────────────────────────────
export const DEFAULT_GUARDRAILS = 'No identifiable children\'s faces without explicit parental consent. No overclaiming language (e.g. "best", "only"). Keep copy warm and parent-facing, not child-facing.';

// ── PHOTOGRAPHER-BRIEF TEMPLATE (lib/higgsfield.js) ─────────────────────────
// The fixed warm-grade + closing-negatives sentences every generated photo
// carries, and the casting/setting description used when the assistant/route
// falls back to a generic scene. Slotted so a brand can swap the grade,
// casting language, and closing negatives independently while keeping the
// "photographer, never designer" contract (feed-grammar-notes.md §8) intact.
export const DEFAULT_PHOTO_BRIEF = {
  // The fixed grade + closing lines every White Orchid photo carries (client spec).
  grade: 'Gentle warm color grade, palette of forest green, ivory and warm terracotta, natural warm Asian skin tones.',
  closing: 'No text, no letters, no words, no logos, no UI, no poster, no frame, no layout, no captions, no border. A single full-frame edge-to-edge photograph.',
  // Casting/setting description used by the gpt-image-1 fallback brand-image prompt
  // (app/api/assistant/route.js) and the brand-library batch builder.
  castingBrief: 'Editorial photography for a calm, premium preschool / early-education brand. Warm natural light, soft focus, gentle earthy palette (deep forest green, ivory, soft mauve, muted celadon). Authentic, unposed, documentary feel; shallow depth of field; no harsh flash.',
  // Default photographer-brief scene per landing intent (app/api/assistant/route.js
  // DEFAULT_SCENES) — used when the model omits scenePrompt for a photo-led plan.
  defaultScenes: {
    event:       'an average ten-year-old Asian child arranging fresh flowers on a welcome table beside an open classroom door, bright soft morning daylight',
    text_post:   'an average ten-year-old Asian child reading at a pale oak table in a bright plant-filled classroom, absorbed and quietly happy, soft natural daylight',
    photo_logo:  'an average ten-year-old Asian child laughing mid-play in a sunlit garden, candid and unposed, bright airy daylight',
    texture_text:'a small still-life of eucalyptus stems in a ceramic jar on a pale linen cloth by a bright window, soft morning light',
    quote:       'an average ten-year-old Asian child watering a potted plant on a bright windowsill, gentle and calm, soft natural daylight',
  },
};
