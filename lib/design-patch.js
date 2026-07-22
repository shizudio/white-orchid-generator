/* ─────────────────────────────────────────────────────────────────────────
   DESIGN PATCH — the single shared contract between the conversational
   assistant (app/api/assistant/route.js), the editor apply path
   (components/Generator.jsx → applyDesignPatch), and the landing page.

   A "patch" is a sparse, all-optional description of design fields to change.
   Only fields the model actually intends to change should be present. The
   editor validates every field again before applying (defence in depth).

   IMPORTANT: the enum values below MIRROR the module-scope constants in
   components/Generator.jsx. Those constants live in a client component and
   are not exported (the file is large and carries inline asset blobs), so we
   duplicate the id lists here and keep them in sync by hand. If you add a
   background colour / logo / dimension / overlay in Generator.jsx, add its id
   here too. Generator.applyDesignPatch re-validates against the live
   constants, so a drift here degrades gracefully (an unknown value is simply
   ignored) rather than corrupting state.
   ───────────────────────────────────────────────────────────────────────── */

// ── Mirror of Generator.jsx constants (kept in sync by hand — see note above) ──
export const PATCH_OPTIONS = {
  // POST_TYPES[].id
  postType: ['photo_logo', 'quote', 'event', 'text_post', 'texture_text'],
  // ARCHETYPES[].id (+ the "none" sentinel = return to the legacy free path).
  // Mirrors ARCHETYPE_IDS in components/Generator.jsx (kept in sync by hand —
  // run .claude/skills/auto_mirror-touchlist/scripts/mirror-check.sh after edits).
  archetypeId: ['none', 'serif_word', 'editorial_split', 'big_number', 'full_bleed_duotone', 'floated_card', 'quote_margin', 'manifesto', 'documentary', 'label_headline', 'portrait_credential', 'motif_field', 'petal_window', 'shape_cutout', 'message_pill', 'brand_card', 'stat_tile', 'cta_card', 'closing_card', 'schedule_tile'],
  // DIMENSIONS[].id
  dimensionId: ['ig_square', 'ig_portrait', 'story', 'twitter', 'facebook', 'banner'],
  // BG_OPTIONS[].id — the 5 core tokens PLUS the curated pastel fields. Generator's
  // applyDesignPatch validates bgColor against the FULL BG_ID_SET (all of these), so
  // exposing the pastels here lets a plain colour ask ("more of a terracotta vibe",
  // "make it dusty pink") resolve to a real, rendering token instead of dead-ending
  // in an honesty apology. Kept in sync by hand with BG_OPTIONS in Generator.jsx.
  bgColor: ['burnham', 'whiteSmoke', 'wisteria', 'celadon', 'jet', 'dustyPink', 'butter', 'sky', 'sage', 'terracotta', 'lilac'],
  // TEXT_COLOR_OPTIONS[].id
  textColorId: ['auto', 'whiteSmoke', 'burnham', 'jet', 'tangerine', 'wisteria'],
  // LOGO_VARIANTS[].id
  logoId: ['p1-green', 'p1-ivory', 'p2-green', 'p2-ivory', 'p3-green', 'p3-ivory', 'p3f-green', 'p4', 'p-central', 'p-circle', 'p-bg', 's1-green', 's1-ivory', 's2-green'],
  // LOGO_POSITIONS keys (9-grid)
  logoPosition: ['top-left', 'top-center', 'top-right', 'mid-left', 'mid-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'],
  // LOGO_SIZES[].id
  logoSize: ['s', 'm', 'l', 'xl'],
  // backdropMode states (the "gradient" treatment was removed 2026-07-02)
  backdropMode: ['auto', 'band', 'none'],
  // FONT_ROLES[].id — keys allowed in the fontSizes object
  fontRole: ['heading', 'subheading', 'content', 'highlight'],
  // FONT_SIZE_STEPS[].id — values allowed in the fontSizes object
  fontStep: ['xs', 's', 'm', 'l', 'xl'],
  // DEFAULT_OVERLAYS[].id (built-in shapes + accessories, incl. orchid-petal)
  overlayAssetId: ['orchid-petal', 'shape-1', 'shape-2', 'shape-3', 'acc-arrow', 'acc-curve', 'acc-spark', 'acc-plus', 'acc-ring', 'acc-wave'],
  // overlay layer modes
  overlayMode: ['frame', 'outline', 'lineart', 'overlay'],
  // PHOTO_TREATMENTS ids (Commit 1 materialized visual) — how the photo is toned.
  photoTreatment: ['none', 'warmGrade', 'duotone', 'duotoneLift', 'filmGrain', 'duotoneStrong', 'cleanGrain'],
  // photoFrame type (Commit 1 materialized visual) — the photo's shape/window.
  // (§2.9.2 · 2026-07-15) petalMask RETIRED from the grammar: the layout shape is a
  // genuine shape layer now — "photo in the orchid window" rides addOverlay
  // { assetId:'orchid-petal', mode:'frame' } like any shape. A legacy model output
  // of 'petalMask' is silently ignored (nullableEnum), never a new special field.
  photoFrameType: ['none', 'card'],
  // (Text Elements slice 4 — spec §5) The CLOSED, brand-governed set of five
  // user-addable text-element classes. MIRRORS lib/text-elements.mjs ELEMENT_CLASSES,
  // the Generator ELEMENT_CLASS_IDS const, and the assistant route's ELEMENT_CLASSES
  // (the 10th mirrored surface — run mirror-check.sh after any edit). No freeform
  // font/size picker: unlimited elements, only brand-sanctioned ways for text to look.
  elementClass: ['heading', 'subheading', 'body', 'caption', 'cta'],
  // (Text Elements slice 4) The S/M/L sanctioned size steps — the ONLY size freedom.
  elementSizeStep: ['S', 'M', 'L'],
};

// Human-readable notes fed to the model so it knows what each field does.
export const PATCH_FIELD_GUIDE = {
  postType: 'Layout family: photo_logo (visual-first), quote (headline is the quote, attribution is source), event (headline is title, dateText is a date only if given, subtext is a detail/CTA), text_post (subtext intro, headline main line, attribution supporting), texture_text (short headline over a photo).',
  archetypeId: 'Editorial composition archetype (starting point): serif_word (oversized serif hero), editorial_split (photo/text split — the solid text panel is PART of this layout), big_number (a date/number is the hero), full_bleed_duotone (photo fills the WHOLE frame under a green tint + whisper caption — the TINTED full-image layout), floated_card (photo card floated on a solid field), quote_margin (quote with generous margin), manifesto (text-only), documentary (one clean photo fills the WHOLE frame, near-full colour — the un-tinted FULL-IMAGE / full-bleed layout), label_headline (eyebrow + headline), portrait_credential (portrait + credential), motif_field (solid field warmed by a few flat motifs), petal_window (photo revealed through an orchid mask), shape_cutout (bold colour-block canvas, photo revealed through a large organic brand-shape cutout + one serif line), message_pill (full-bleed warm photo with the message on a rounded brand-colour pill card overlapping the lower third), stat_tile (a giant serif number/ratio with eyebrow + caption on a celadon field), cta_card (enrolment CTA: serif hero + details + tangerine pill), schedule_tile (a daily schedule of serif time rows), brand_card / closing_card (campaign opener/closer lockup cards — rare, pick ONLY when the user asks for a brand/opening or closing card). Use "none" to return to the free (non-archetype) layout. Setting an archetype also seeds its palette/treatment. IMPORTANT: the solid side panel on split layouts is the LAYOUT itself — "remove the panel" / "photo fills the frame" is ONLY expressible as an archetypeId change (documentary or full_bleed_duotone), never via backdropMode or overlays.',
  dimensionId: 'Canvas format: ig_square (1:1), ig_portrait (4:5), story (9:16), twitter (16:9), facebook (1.91:1), banner (3:1).',
  headline: 'Main line of copy. Keep concise. Never invent quotations, sources, dates, statistics, offers, or factual claims.',
  subtext: 'Secondary line / intro / detail depending on postType.',
  attribution: 'Source or supporting line. Never invent a source.',
  dateText: 'A date ONLY if the user explicitly supplied one. Otherwise leave empty.',
  bgColor: 'Background colour token: burnham (deep green), whiteSmoke (ivory), wisteria (mauve/lilac purple), celadon (soft green), jet (near-black), dustyPink (soft blush pink), butter (warm pale yellow), sky (soft blue), sage (muted green), terracotta (warm clay/rust), lilac (pale purple). COLOUR VOCABULARY — map a colour word the user says to its NEAREST token: mauve/lilac/plum/purple → wisteria (or lilac); blush/rose/pink → dustyPink; cream/butter/pale yellow → butter; blue/sky/powder → sky; sage/soft green/mint → sage or celadon; terracotta/rust/clay/warm orange → terracotta; ivory/white/cream → whiteSmoke; deep green/forest → burnham; black/charcoal → jet. Never refuse a colour ask — always pick the closest token.',
  textColorId: 'Text colour token, or "auto" to let the editor pick an accessible colour.',
  logoId: 'Logo variant id. Use an ivory logo (…-ivory) on dark/photo backgrounds and a green logo (…-green) on light backgrounds.',
  logoPosition: '9-grid anchor for the logo (top-left … bottom-right).',
  logoSize: 'Logo size: s, m, l, or xl.',
  backdropMode: 'Legibility treatment behind text on a photo: auto (flip text colour, add a solid brand band only where needed), band (always a solid brand strip), none (drop shadow only).',
  photoTreatment: 'How the photo is toned: warmGrade (the DEFAULT — warm, near-raw, bright/airy), none, duotone (deep-green luminance-preserving wash), duotoneLift (duotone + ivory paper glow), filmGrain (near-full-colour candid), duotoneStrong (heavy green, for masks/heroes), cleanGrain (near-full-colour, faint grain for cards). Usually set by choosing an archetype; tweak directly only on explicit request.',
  photoFrameType: 'Photo shape: none (fills its region) or card (a floated rounded photo card on a solid field). Usually set by the archetype. For a photo revealed through a brand shape (the orchid window etc.) use addOverlay with mode "frame" — shape cutouts are ordinary shape layers.',
  fontSizes: 'Object mapping a text role (heading, subheading, content, highlight) to a size step (xs, s, m, l, xl). Only include roles you want to resize.',
  addOverlay: 'Place a built-in brand shape. { assetId: one of orchid-petal/shape-1..3/acc-*, mode: frame|outline|lineart|overlay }. orchid-petal in "frame" mode makes the signature orchid photo frame. To SWAP a placed shape for a different one ("change the shape", "a different petal"), set removeOverlays true AND addOverlay with the new assetId in the same patch — removal happens before the add.',
  removeOverlays: 'Set true to clear all placed overlay shapes.',
  addTextElement: 'Add ONE new brand-governed text element (spec §5). { class: one of heading/subheading/body/caption/cta, text: the words to show }. Use this when the user asks to ADD a NEW piece of text that is NOT one of the existing roles — "add a caption saying X", "add a heading/subheading/body line saying X", "add a button/CTA saying X". Map the phrasing to the closest class: a headline-style line → heading; a supporting line → subheading; a paragraph/details → body; a small edge/eyebrow/date-like line → caption; a button/tag/CTA/pill → cta. An unrecognized ask ("add a quote") maps to the CLOSEST sanctioned class (body) — never refuse. The layout solver places it; a class the solver cannot place cleanly in a format is kept in storage and named in readiness (never squeezed, never lost). Leave null when the user is editing existing copy (use headline/subtext/etc.) rather than adding a new element.',
  editElements: 'Edit EXISTING added text elements by their uid (spec §1). A list of { uid, class?, text?, sizeStep? } — set only the fields to change per element. class must be a sanctioned transition; sizeStep is S/M/L only. Leave null unless the user names an added element to change.',
  microLabel: 'The EYEBROW — the small tracked all-caps label above/near the headline (max ~28 chars). When the user asks for "a small label", "small text at the top", or "a little caps line", it maps HERE. Set to "" (empty string) to REMOVE the eyebrow explicitly; null = leave unchanged.',
  pillText: 'The accent PILL / button label (e.g. "LIMITED PLACES", max ~30 chars). When the user asks for "a button", "a tag", or "a badge", it maps HERE. Set to "" to REMOVE the pill; null = leave unchanged.',
  imagePrompt: 'Set ONLY when the user asks to generate/create an image or photo (e.g. "generate a photo of children painting outdoors"). A concise visual description of the scene to generate — no brand name, no text-in-image, no logos. Leave null for every other request.',
  scenePrompt: 'LANDING ONLY — a PHOTOGRAPHER\'S brief for the post\'s background photo, for photo-led designs. One scene, one subject with a concrete action, setting + lighting. NEVER include the brand name, any copy/tagline, or design/layout words (no "poster", "text", "logo", "caption"). Leave null for text-only designs.',
};

// Strict OpenAI json_schema for { reply, patch }.
//
// OpenAI's strict mode requires EVERY property key to appear in `required` at
// every object level (optional-by-omission is not allowed). We express
// "optional" the sanctioned way instead: every field is nullable, and the
// model sets fields it does NOT want to change to null. Generator's
// applyDesignPatch ignores null / non-matching values, so a null field is a
// no-op — the effect is the same as omitting it, but the schema stays strict.
const nullableEnum = (values) => ({ type: ['string', 'null'], enum: [...values, null] });
const nullableString = (maxLength) => ({ type: ['string', 'null'], maxLength });

export const PATCH_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'patch'],
  properties: {
    reply: { type: 'string', maxLength: 300 },
    patch: {
      type: 'object',
      additionalProperties: false,
      required: [
        'postType', 'archetypeId', 'dimensionId', 'headline', 'subtext', 'attribution', 'dateText',
        'microLabel', 'pillText',
        'addTextElement', 'editElements',
        'bgColor', 'textColorId', 'logoId', 'logoPosition', 'logoSize', 'backdropMode',
        'photoTreatment', 'photoFrameType',
        'fontSizes', 'addOverlay', 'removeOverlays', 'imagePrompt', 'scenePrompt',
        'hideLogo',
      ],
      properties: {
        postType: nullableEnum(PATCH_OPTIONS.postType),
        archetypeId: nullableEnum(PATCH_OPTIONS.archetypeId),
        dimensionId: nullableEnum(PATCH_OPTIONS.dimensionId),
        headline: nullableString(100),
        subtext: nullableString(140),
        attribution: nullableString(100),
        dateText: nullableString(60),
        // (WP-V) Vocabulary-free adding: the eyebrow + pill become first-class
        // patch fields so "add small text at the top" maps to a real role.
        // EXPLICIT-EMPTY SENTINEL: "" removes the element; null = unchanged.
        microLabel: nullableString(28),
        pillText: nullableString(30),
        // (Text Elements slice 4 — spec §5) Add ONE brand-governed text element.
        // class is closed (ELEMENT_CLASSES); text is length-bounded. null = no add.
        // The apply path compiles this into the SAME content/add-element command the
        // UI's "+ Add text" picker dispatches; the solver places it (complete-or-absent).
        addTextElement: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['class', 'text'],
          properties: {
            class: nullableEnum(PATCH_OPTIONS.elementClass),
            text: nullableString(240),
          },
        },
        // (Text Elements slice 4 — spec §1) Per-uid edits to EXISTING added elements.
        // Each entry compiles into content/set-element-{text,class,size}. class is a
        // sanctioned transition; sizeStep is S/M/L only. null = no element edits.
        editElements: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['uid', 'class', 'text', 'sizeStep'],
            properties: {
              uid: nullableString(64),
              class: nullableEnum(PATCH_OPTIONS.elementClass),
              text: nullableString(240),
              sizeStep: nullableEnum(PATCH_OPTIONS.elementSizeStep),
            },
          },
        },
        bgColor: nullableEnum(PATCH_OPTIONS.bgColor),
        textColorId: nullableEnum(PATCH_OPTIONS.textColorId),
        // Materialized visuals (Commit 1). Normally the model sets archetypeId and lets
        // materialization pick these; exposed so a targeted "make the photo a soft duotone"
        // or "frame it in a card" request can tweak them directly on an existing design.
        photoTreatment: nullableEnum(PATCH_OPTIONS.photoTreatment),
        photoFrameType: nullableEnum(PATCH_OPTIONS.photoFrameType),
        logoId: nullableEnum(PATCH_OPTIONS.logoId),
        logoPosition: nullableEnum(PATCH_OPTIONS.logoPosition),
        logoSize: nullableEnum(PATCH_OPTIONS.logoSize),
        // (Scope addendum) remove the logo (true) or add it back (false); null = unchanged.
        hideLogo: { type: ['boolean', 'null'] },
        backdropMode: nullableEnum(PATCH_OPTIONS.backdropMode),
        fontSizes: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['heading', 'subheading', 'content', 'highlight'],
          properties: {
            heading: nullableEnum(PATCH_OPTIONS.fontStep),
            subheading: nullableEnum(PATCH_OPTIONS.fontStep),
            content: nullableEnum(PATCH_OPTIONS.fontStep),
            highlight: nullableEnum(PATCH_OPTIONS.fontStep),
          },
        },
        addOverlay: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['assetId', 'mode'],
          properties: {
            assetId: nullableEnum(PATCH_OPTIONS.overlayAssetId),
            mode: nullableEnum(PATCH_OPTIONS.overlayMode),
          },
        },
        removeOverlays: { type: ['boolean', 'null'] },
        imagePrompt: nullableString(500),
        // (Photo-first) A PHOTOGRAPHER'S brief for the post's background photo, set on
        // the LANDING flow for photo-led designs. Pure scene/subject/lighting — the
        // route enforces "no brand name / copy / design words" downstream. Null in the
        // editor and for text-only landing designs. A side-effect trigger (the route
        // starts a Higgsfield photo job), not an applied design field.
        scenePrompt: nullableString(600),
      },
    },
  },
};

// ── Audit fix sub-schema (Commit 2) ──────────────────────────────────────────
// The AI audit may propose only NON-COPY design tweaks — it must never rewrite
// user copy. This is the patch object with the four copy fields (headline,
// subtext, attribution, dateText) stripped from both `properties` and `required`
// so the strict json_schema physically cannot emit them. Reuses the same
// nullable-field convention as PATCH_JSON_SCHEMA so fixes stay mechanically
// applicable via Generator.applyDesignPatch (which ignores nulls / unknowns).
const AUDIT_COPY_FIELDS = ['headline', 'subtext', 'attribution', 'dateText', 'microLabel', 'pillText', 'addTextElement', 'editElements', 'imagePrompt', 'scenePrompt'];
export function buildAuditFixSchema() {
  const full = PATCH_JSON_SCHEMA.properties.patch;
  const properties = {};
  for (const [key, val] of Object.entries(full.properties)) {
    if (AUDIT_COPY_FIELDS.includes(key)) continue;
    properties[key] = val;
  }
  const required = full.required.filter(k => !AUDIT_COPY_FIELDS.includes(k));
  return { type: 'object', additionalProperties: false, required, properties };
}

// Strip any copy fields a fix might carry before it reaches applyDesignPatch —
// belt-and-braces even though the schema already forbids them.
export function stripCopyFromPatch(patch) {
  if (!patch || typeof patch !== 'object') return patch;
  const clean = { ...patch };
  for (const key of AUDIT_COPY_FIELDS) delete clean[key];
  return clean;
}

// ── Audit fix coherence map (Commit 2, P2) ───────────────────────────────────
// Category → the ONLY fix fields that make sense for that finding kind. Enforced
// server-side in app/api/design-audit/route.js (after parsing) AND reflected in
// the audit rubric so the model aims correctly. A fix carrying fields outside its
// category's allowed set has those fields stripped; if nothing survives the fix
// becomes null (advice-only). Composition findings are ALWAYS advice-only (the
// patch schema has no spacing/layout vocabulary, so any "fix" would be a no-op or
// an incoherent guess) per the locked decision.
export const AUDIT_CATEGORY_FIELDS = {
  hierarchy: ['fontSizes', 'logoSize', 'logoPosition'],
  brand: ['bgColor', 'textColorId', 'logoId'],
  composition: [], // advice-only — no mechanical fix
  polish: ['backdropMode', 'bgAlpha', 'logoSize'], // bgAlpha not in schema today; harmless if absent
};

// Filter a fix to the fields allowed for its category. Returns a new patch object
// (or null if nothing survives). Also enforces the HIERARCHY coherence rule:
// a fontSizes fix that moves ALL present roles in the SAME direction uniformly is
// incoherent (it just shrinks/grows everything — the reported "hierarchy" problem
// is about RELATIVE size, not absolute), so we strip fontSizes in that case.
//   - `state.fontSizes` (current role→step map) is needed to judge direction.
export function coerceFixToCategory(category, fix, state = {}) {
  if (!fix || typeof fix !== 'object') return null;
  const allowed = AUDIT_CATEGORY_FIELDS[category];
  if (!Array.isArray(allowed) || allowed.length === 0) return null; // composition / unknown → advice-only
  const out = {};
  for (const key of allowed) {
    if (fix[key] === undefined || fix[key] === null) continue;
    out[key] = fix[key];
  }
  // Hierarchy incoherence guard: reject a uniform all-same-direction resize.
  if (category === 'hierarchy' && out.fontSizes && typeof out.fontSizes === 'object') {
    const cur = state.fontSizes || {};
    const changed = Object.entries(out.fontSizes)
      .filter(([role, step]) => step && FONT_STEP_ORDER.includes(step) && step !== cur[role]);
    if (changed.length >= 2) {
      const dirs = new Set(changed.map(([role, step]) => {
        const from = FONT_STEP_ORDER.indexOf(cur[role]);
        const to = FONT_STEP_ORDER.indexOf(step);
        if (from < 0) return 'set'; // no baseline → can't judge; treat as neutral
        return to > from ? 'up' : to < from ? 'down' : 'same';
      }));
      // All roles moving the same non-neutral direction (all "up" or all "down")
      // = uniform resize = incoherent hierarchy "fix" → strip it.
      if (dirs.size === 1 && (dirs.has('up') || dirs.has('down'))) {
        delete out.fontSizes;
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

// Ordered font-size steps (small→large) for direction comparison above.
export const FONT_STEP_ORDER = ['xs', 's', 'm', 'l', 'xl'];

// ── No-op detection (Commit 2, P2) ───────────────────────────────────────────
// Diff a fix/patch against the CURRENT design state: return only the fields that
// would actually change something. An empty result means the fix is a no-op (the
// model echoed the current state) → the UI renders it as advice with no Apply chip.
// `state` is a compact design snapshot (postType, bgColor, logoSize, fontSizes …).
export function diffPatchAgainstState(patch, state = {}) {
  const clean = stripCopyFromPatch(patch);
  if (!clean || typeof clean !== 'object') return {};
  const diff = {};
  for (const key of PATCH_CHANGE_KEYS) {
    const value = clean[key];
    if (value === undefined || value === null) continue;
    if (key === 'removeOverlays') {
      if (value === true) diff[key] = value; // only meaningful when true
      continue;
    }
    if (key === 'addOverlay') {
      if (value && typeof value === 'object' && value.assetId) diff[key] = value;
      continue;
    }
    if (key === 'fontSizes') {
      if (!value || typeof value !== 'object') continue;
      const cur = state.fontSizes || {};
      const sub = {};
      for (const [role, step] of Object.entries(value)) {
        if (step && step !== cur[role]) sub[role] = step;
      }
      if (Object.keys(sub).length) diff[key] = sub;
      continue;
    }
    // Scalar field: only a diff when it differs from the current state.
    if (value !== state[key]) diff[key] = value;
  }
  return diff;
}

// True if a fix would change anything vs the current state (no-op detection).
export function fixHasEffect(patch, state = {}) {
  return Object.keys(diffPatchAgainstState(patch, state)).length > 0;
}

// Which patch keys count as "real" changes (used to summarise + gate apply).
export const PATCH_CHANGE_KEYS = [
  'postType', 'archetypeId', 'dimensionId', 'headline', 'subtext', 'attribution', 'dateText',
  'microLabel', 'pillText',
  // (Text Elements slice 4) adding / editing brand-governed text elements.
  'addTextElement', 'editElements',
  'bgColor', 'textColorId', 'logoId', 'logoPosition', 'logoSize', 'backdropMode',
  'photoTreatment', 'photoFrameType',
  'fontSizes', 'addOverlay', 'removeOverlays',
  // (Scope addendum) remove / re-add the logo.
  'hideLogo',
];

/* ── CLIENT-ONLY PATCH EXTENSION (WP-V Stage 1) ──────────────────────────────
   PARITY BY ARCHITECTURE (docs/ux-architecture.md §4): every UI interaction —
   inspector fields, canvas drags/resizes, colour/logo/photo picks, the + Add
   gallery, ghost slots — emits a patch through the SAME client pipeline the AI
   uses (Generator.applyPatch → applyDesignPatch). The keys below cover
   interactions that have no AI-grammar field. They are NEVER produced by the
   model (PATCH_JSON_SCHEMA does not include them; strict mode forbids extras)
   and are validated + applied client-side only:

   bgAlpha        number 0..1 — background opacity (transparent-PNG export).
   textLayout     partial { x, y, width, align, lineHeight, scale } — the text
                  block's master geometry in canvas fractions; the pipeline
                  writes it to the current dimension's layout target (master
                  layout vs per-dimension override), same as a canvas drag.
   photoTransform partial { zoom, cx, cy, rotation } — photo reframe for the
                  current dimension (master imgT vs per-dim override).
   overlayUpdate  { uid, transform?, mode?, style? } — one placed overlay
                  layer: transform (x/y/scale/rotation/opacity/colorId),
                  render mode (frame|outline|lineart|overlay), or style
                  fields (outlineColor/outlineWidth/lineArtColor/…).
   removeOverlay  uid string — delete ONE placed overlay layer (removeOverlays
                  — plural, AI grammar — still clears them all).
   resetOverlay   { uid, masterTransform? } — reset one shape on the active
                  format; master reset supplies the suggested default transform.
   resetTextLayout true — return the active format's text box to its inherited
                  or post-type default layout.
   resetFormatToMaster dimension id — clear every owner-authored local override
                  for one non-master format and resume master inheritance.
   replaceShapeCollection array — migration/import boundary for replacing the
                  complete placed-shape collection through the canonical reducer.
   mediaKind      image|video — switch the media inspector's authored kind.
   furnitureUpdate (WP-W0) { key, hidden?, color?, widthScale? } — one archetype
                  FURNITURE piece (hairline rule / index token / url line),
                  keyed furn_<type>_<index> on the active archetype's furniture
                  list. hidden:true deletes it; color is a brand token;
                  widthScale scales a rule/underline's length.
   addOverlay     (shared with the AI grammar) the client additionally accepts
                  any UPLOADED asset id present in the user's overlay library,
                  not just the built-in enum.
   imageSrc       string (URL or dataURL) — set the background photo. Replaces
                  any active video.
   removeImage    true — clear the background media (photo or video).
   archVariant    integer — sanctioned palette-variant index applied together
                  with archetypeId (picker cycling / measured rotation).
   fieldColor     BG id (or ""/null to clear) — the editorial PANEL/FIELD colour
                  override. On a materialized archetype the visible solid field is
                  driven by the palette VARIANT, not bgColor; this override lets the
                  Background inspector drive WHAT THE USER SEES on every design class
                  (render-truth). "" / null returns to the archetype variant field. */
export const CLIENT_PATCH_KEYS = [
  'bgAlpha', 'fieldColor', 'textLayout', 'resetTextLayout', 'resetFormatToMaster', 'photoTransform', 'overlayUpdate', 'removeOverlay', 'resetOverlay', 'replaceShapeCollection',
  'mediaHostShapeId', 'mediaKind',
  'imageSrc', 'removeImage', 'archVariant', 'furnitureUpdate',
  // (Refinement 1/2) per-role free placement + continuous free-logo pin — canvas-drag only.
  'roleOffset', 'logoFree',
  // (Scope addendum) logo removal / re-add — inspector button + chat both emit hideLogo.
  'hideLogo',
];

// Friendly labels for the "changed: …" summary line in the editor chat.
export const PATCH_KEY_LABELS = {
  postType: 'post type',
  archetypeId: 'archetype',
  dimensionId: 'format',
  headline: 'headline',
  subtext: 'subtext',
  attribution: 'attribution',
  dateText: 'date',
  microLabel: 'eyebrow',
  pillText: 'pill',
  addTextElement: 'text element',
  editElements: 'text element',
  bgColor: 'background',
  textColorId: 'text colour',
  logoId: 'logo',
  logoPosition: 'logo position',
  logoSize: 'logo size',
  backdropMode: 'text backdrop',
  photoTreatment: 'photo treatment',
  photoFrameType: 'photo frame',
  fontSizes: 'text size',
  addOverlay: 'overlay',
  removeOverlays: 'overlay',
  resetOverlay: 'shape placement',
  resetTextLayout: 'text placement',
  resetFormatToMaster: 'format overrides',
  replaceShapeCollection: 'shape collection',
  mediaKind: 'media kind',
  hideLogo: 'logo visibility',
};

// True when an addTextElement field carries a real add (a sanctioned class).
export function addTextElementHasChange(value) {
  return !!(value && typeof value === 'object' && !Array.isArray(value)
    && PATCH_OPTIONS.elementClass.includes(value.class));
}
// True when editElements carries at least one edit targeting a uid.
export function editElementsHasChange(value) {
  return Array.isArray(value) && value.some(entry =>
    entry && typeof entry === 'object' && typeof entry.uid === 'string' && entry.uid
    && (typeof entry.text === 'string' || PATCH_OPTIONS.elementClass.includes(entry.class)
        || PATCH_OPTIONS.elementSizeStep.includes(entry.sizeStep)));
}

// True if the patch would change anything at all.
export function patchHasChanges(patch) {
  if (!patch || typeof patch !== 'object') return false;
  return PATCH_CHANGE_KEYS.some(key => {
    const value = patch[key];
    if (value === undefined || value === null) return false;
    if (key === 'removeOverlays') return value === true;
    if (key === 'fontSizes') return value && typeof value === 'object' && Object.keys(value).length > 0;
    if (key === 'addTextElement') return addTextElementHasChange(value);
    if (key === 'editElements') return editElementsHasChange(value);
    return true;
  });
}

// Human summary like "background, format" from the patch keys actually present.
export function summarizePatch(patch) {
  if (!patch || typeof patch !== 'object') return '';
  const labels = [];
  for (const key of PATCH_CHANGE_KEYS) {
    const value = patch[key];
    if (value === undefined || value === null) continue;
    if (key === 'removeOverlays' && value !== true) continue;
    if (key === 'fontSizes' && (!value || typeof value !== 'object' || Object.keys(value).length === 0)) continue;
    if (key === 'addTextElement' && !addTextElementHasChange(value)) continue;
    if (key === 'editElements' && !editElementsHasChange(value)) continue;
    const label = PATCH_KEY_LABELS[key] || key;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join(', ');
}
