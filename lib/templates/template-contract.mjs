/* ─────────────────────────────────────────────────────────────────────────
   THE TEMPLATE CONTRACT — docs/template-system-spec.md §6.

   A template is DATA. It declares constraints (numbers, enums, presence flags)
   and never behaviour. §6.2 is the hard rule this file enforces:

     "A template may declare *constraints* — numbers, enums, presence flags. It
      may NEVER declare *rules* — no conditionals, no computed behaviour, no
      'if body is long then shrink heading.' Constraints must be readable as a
      table. The moment a template needs a conditional, the solver has been
      rebuilt in data and this whole design has regressed."

   `validateTemplate` therefore FAILS CLOSED on any function, regexp, getter,
   class instance or rule-shaped key anywhere in the tree — a template that
   carries behaviour cannot be loaded at all.

   Owns: the closed slot vocabulary (§6.1), the four dimensions (§5), and the
   per-slot-per-dimension constraint shape (§6.2). Owns no geometry — that is
   authored per template.
   ───────────────────────────────────────────────────────────────────────── */

// ── §6.1 GLOBAL SLOT VOCABULARY — CLOSED SET ────────────────────────────────
// Every template implements the same slots; that is what makes template swap
// preserve her content (§8). Adding a slot is a rare, deliberate decision.
// NOTE: there is deliberately NO `date` slot — a date is served by `heading`
// (date-as-hero), `eyebrow`, or inline in `body` (§6.1).
export const TEXT_SLOTS = Object.freeze(['eyebrow', 'heading', 'body', 'pill', 'attribution']);
export const NON_TEXT_SLOTS = Object.freeze(['photo', 'logo', 'colourPair', 'motif']);
export const SLOTS = Object.freeze([...TEXT_SLOTS, ...NON_TEXT_SLOTS]);

const TEXT_SLOT_SET = new Set(TEXT_SLOTS);
const SLOT_SET = new Set(SLOTS);

// ── §5 THE FOUR DIMENSIONS — authored, never derived ────────────────────────
// `banner` is retired; `twitter`/`facebook` merge into one `landscape` render.
export const DIMENSIONS = Object.freeze({
  portrait:  Object.freeze({ id: 'portrait',  w: 1080, h: 1350, label: 'Portrait 4:5',  purpose: 'IG feed 4:5, also Reels' }),
  story:     Object.freeze({ id: 'story',     w: 1080, h: 1920, label: 'Story 9:16',    purpose: 'Stories / Reels' }),
  square:    Object.freeze({ id: 'square',    w: 1080, h: 1080, label: 'Square 1:1',    purpose: 'IG 1:1' }),
  landscape: Object.freeze({ id: 'landscape', w: 1600, h:  900, label: 'Landscape 16:9', purpose: 'Twitter and Facebook (shared)' }),
});
export const DIMENSION_IDS = Object.freeze(Object.keys(DIMENSIONS));

// The existing 5-position logo enum a template may draw its allowlist from.
// (The 9-grid in lib/logo-placement-policy.mjs is the admin superset; the user
// app only ever offers what the template allows — §3 "no layout editing".)
export const LOGO_POSITION_ENUM = Object.freeze([
  'top-left', 'top-right', 'bottom-left', 'bottom-right', 'bottom-center',
]);
export const LOGO_SIZE_ENUM = Object.freeze(['s', 'm', 'l', 'xl']);

// ── PHOTO (client AMENDMENT 2026-08-18) ─────────────────────────────────────
// A template may declare a `photo` slot. How the photo sits in its box is an
// ENUM, not a computation; the scrim over it is a COLOUR + an OPACITY. Both are
// table data — the render core reads them, the template never decides anything.
export const PHOTO_FIT_ENUM = Object.freeze(['cover', 'contain']);

/* ── MOTIF (§9 — slot, not layer; client ruling 2026-08-20) ──────────────────
   "The TEMPLATE declares where the motif sits, at what size, in which
    treatment — baked at authoring time. She only chooses WHICH motif from the
    brand set, or none."

   Template three goes one step further on an explicit ruling — the motif there
   is FIXED, declared by the template and not choosable at all — so its whole
   surface is: one real asset id, plus a box and an opacity per dimension. No
   treatment mode, no ink-sensitivity, no structure order, no drag: §9 retires
   every one of those, and none of them can be expressed here.

   The motif is painted in the COLOUR PAIR'S OWN INK by the render core. That
   is core behaviour driven by the pair, exactly as the required-photo
   placeholder already is — not a template decision — so a template cannot
   introduce an off-brand colour through this door (law 7). */
export const MOTIF_MAX_OPACITY = 0.25;

/* ── AN ADJUSTABLE PHOTO (client ruling 2026-08-18) ──────────────────────────
   "i want to still shift around the image and resize the image. this only
    applies to petal window template."

   A NARROW, DELIBERATE EXCEPTION TO §3's "no free drag / pan / zoom of
   anything", and the line it sits on is this: the MASK never moves and the
   TEMPLATE'S GEOMETRY never changes. What she is choosing is WHICH PART OF HER
   PICTURE SHOWS through a fixed window — content, the same class of decision as
   which photo — not where a design element sits. Nothing about the layout is
   negotiable, so nothing here re-opens the seam §1 diagnosed: there is still
   exactly one owner of every position on the canvas, and it is the template.

   WHICH templates allow it is DATA, per slot: Petal Window's photo IS the
   design and deserves a crop; Classic's is a scrimmed texture behind type,
   where a crop control would be a knob with nothing to say. Both declare it.

   THE TRANSFORM IS EXPRESSED IN UNITS OF THE AVAILABLE SLACK, which is what
   makes "the window can never show empty space" true BY CONSTRUCTION rather
   than by a clamp that could be got around: pan ±1 means "as far as this zoom
   allows and not one pixel further", and at zoom 1 a cover fit has zero slack
   on one axis, so that axis simply cannot move. */
export const PHOTO_ZOOM_MIN = 1;
export const PHOTO_ZOOM_MAX = 3;
export const PHOTO_PAN_RANGE = 1;
// The two colour classes a pair can belong to. `logoAssets` is keyed by this —
// a LOOKUP TABLE, not a rule: which default mark a field wants is read off the
// pair, never computed by the template.
//
// The photo SCRIM is deliberately NOT keyed this way (client ruling 2026-08-18).
// Class is too coarse for a wash: three `light` pairs keyed by class share one
// scrim colour, so over a full-bleed photo all three render the same tile and
// the pair she picked stops meaning anything. The scrim is keyed by PAIR ID —
// see the photo block in validateTemplate.
export const COLOUR_CLASSES = Object.freeze(['light', 'dark']);

/* ── §6.2 THE PANEL'S SECTION ORDER — DATA, NEVER A BRANCH ───────────────────
   (client ruling 2026-08-18) "label + headline template … combine photo
   selection as part of the edit section" / "Petal window: Make window shape and
   photo selection the same section, it should be the FIRST section."

   Section order is therefore TEMPLATE-SPECIFIC: Classic leads with the words,
   Petal Window leads with the window. The tempting implementation is one
   `if (template.id === 'petal_window')` in the composer — which is the solver
   returning as UI code. The contract's whole point is that a template DECLARES
   and the surface OBEYS, so the order is an ordered array of section ids on the
   template and the panel renders them in sequence.

   A section is a GROUP OF CONTROLS with one label. It is an ENUM VALUE — the
   template names it, it never describes it: no labels, no copy, no widths, no
   conditions. The surface owns what a section looks like; the template owns
   which sections it has and in what order.

   `background` and `window` are two different groupings of the SAME photo
   control, which is precisely the client's ruling: on Classic the photo is part
   of "what sits behind the words" (colour + photo); on Petal Window it is part
   of the window (shape + photo). A template picks one, never both.

   NOT A SECTION: the template selector itself. It chooses WHICH template, so a
   template cannot order it without ordering its own replacement. It stays the
   panel's own chrome, above everything. */
export const PANEL_SECTION_IDS = Object.freeze([
  'words', 'colour', 'background', 'window', 'mark', 'markPosition',
]);

/* WHICH CONTROL EACH SECTION CARRIES. A lookup table, so the validator can
   prove — mechanically, in both directions — that the declared order covers
   exactly the controls this template actually needs:
     · a need with no section  → an unreachable control (she cannot set it)
     · a section with no need  → a control for nothing (M4, a dead declaration)
     · a need served TWICE     → the same picker in two places                */
export const PANEL_SECTION_SERVES = Object.freeze({
  words: Object.freeze(['text']),
  colour: Object.freeze(['colourPair']),
  background: Object.freeze(['colourPair', 'photo']),
  window: Object.freeze(['photo', 'mask']),
  mark: Object.freeze(['logo']),
  markPosition: Object.freeze(['logoPosition']),
});

/* ── AUTHORED STATES (client ruling 2026-08-18) ──────────────────────────────
   "for the petal template, if user decides not to put any text, can u default
    it to larger petal centralized? (same as the reference i gave)"

   Two DISCRETE LAYOUTS A DESIGNER DREW, not a rule. The closed set is exactly
   two ids and the validator refuses a third — a third state, or any
   interpolation between these two, is the point at which this becomes a solver
   again and the client has to rule.

     · `withHeading` — the geometry baked in `slots.*.dimensions`. It overrides
       nothing, by definition: the base IS this state. Naming it here is what
       makes the pair legible as a pair.
     · `photoOnly`   — hand-authored geometry overrides, per slot, per
       dimension. Every number is drawn, none is derived from `withHeading`.

   The SWITCH lives in the render core and is generic (see
   lib/render-core/render-template.mjs `resolveTemplateState`): a template that
   declares `photoOnly` and whose text slots are ALL EMPTY renders that state;
   anything else renders `withHeading`. Binary, emptiness only — never length,
   never fit. A template that declares no states never branches at all.

   A state may override GEOMETRY ONLY. `required`, `maxLines`, `charBudget`,
   `fit` and the scrim are the same in both states by construction, so a state
   can never move a budget or change what is required — which is why §7.1's
   cross-dimension minimum needs no second copy. */
export const TEMPLATE_STATE_IDS = Object.freeze(['withHeading', 'photoOnly']);

/* Per-template FIELD COPY. User-facing edit names use one closed semantic
   vocabulary: Heading, Body, Caption. A template may map its stable storage
   slots to those roles (Caption Band maps `heading` to Caption and its dominant
   `pill` to Heading), but may not invent positional prose such as "the quiet
   line above". Placement belongs to the template, not the field name.

   STILL DATA, and deliberately narrow: strings only, for slots this template
   actually paints. It is the same kind of client-facing copy `purpose` already
   is. The surface owns the defaults; a template only overrides. */
const SLOT_LABEL_KEYS = Object.freeze(['label', 'hint']);
export const EDIT_FIELD_LABELS = Object.freeze(['Heading', 'Body', 'Caption']);
export const STATE_OVERRIDE_KEYS = Object.freeze(['present', 'box', 'widthFrac', 'pad']);

// Keys that smell like behaviour. A template carrying one of these has started
// re-growing the solver in data (§6.2) and is rejected by name, not by value.
const RULE_SHAPED_KEYS = Object.freeze([
  'if', 'when', 'unless', 'else', 'then', 'rule', 'rules', 'condition', 'conditions',
  'compute', 'computed', 'derive', 'derived', 'fn', 'func', 'handler', 'callback',
  'solve', 'solver', 'expr', 'expression', 'script', 'eval',
]);
const RULE_SHAPED_SET = new Set(RULE_SHAPED_KEYS);

/* Matching the WHOLE key was not enough. `maskRules`, `photoCondition` and
   `sizeHandler` are the same regression wearing a prefix, and they sailed
   through a set lookup — found by a test written for the template-two mask
   field, not by reading the list. So the key is split on camelCase and on
   separators and EVERY word is checked, which catches the compounds while
   leaving ordinary names alone (`lineRatio`, `charBudget`, `maxLines`,
   `allowedLogoPositions` contain no rule word at any position). */
function ruleShapedKey(key) {
  const words = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
  return words.some((w) => RULE_SHAPED_SET.has(w));
}

/** WCAG relative luminance from a #rrggbb string. */
export function relativeLuminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan((int >> 16) & 255) + 0.7152 * chan((int >> 8) & 255) + 0.0722 * chan(int & 255);
}

/** WCAG contrast ratio between two #rrggbb strings, or null if either is unparseable. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

// Colour pairs are PRE-VERIFIED at authoring time (§6.2 / §10B). This is the
// bar a pair must clear to be bakeable — large display + body text on a solid
// field, so WCAG AA large-text (3.0) is the floor and 4.5 the target we hold.
export const MIN_PAIR_CONTRAST = 4.5;

/* ── The behaviour scanner ──────────────────────────────────────────────────
   Walks the whole template and rejects anything that is not plain, inert data.
   Fails closed: an unknown exotic type is a rejection, not a pass.            */
function scanForBehaviour(node, path, errors, seen) {
  const t = typeof node;
  if (node === null || t === 'string' || t === 'number' || t === 'boolean') {
    if (t === 'number' && !Number.isFinite(node)) errors.push(`${path}: non-finite number (${node})`);
    return;
  }
  if (t === 'function') { errors.push(`${path}: is a FUNCTION — constraints are data, never behaviour (§6.2)`); return; }
  if (t === 'symbol' || t === 'bigint' || t === 'undefined') { errors.push(`${path}: is a ${t} — not inert table data (§6.2)`); return; }
  if (node instanceof RegExp) { errors.push(`${path}: is a RegExp — a matcher is behaviour (§6.2)`); return; }
  if (node instanceof Date || node instanceof Map || node instanceof Set || node instanceof Promise) {
    errors.push(`${path}: is a ${node.constructor?.name} — not inert table data (§6.2)`); return;
  }
  // `seen` is the ANCESTOR stack, not a global visited set — sharing one inert
  // `{present:false}` object across seven slots is fine; pointing at yourself is not.
  if (seen.has(node)) { errors.push(`${path}: circular reference — not readable as a table (§6.2)`); return; }
  seen.add(node);
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanForBehaviour(v, `${path}[${i}]`, errors, seen));
    seen.delete(node);
    return;
  }
  const proto = Object.getPrototypeOf(node);
  if (proto !== Object.prototype && proto !== null) {
    errors.push(`${path}: is a class instance (${node.constructor?.name || 'unknown'}) — not inert table data (§6.2)`);
    seen.delete(node);
    return;
  }
  for (const key of Object.keys(node)) {
    const desc = Object.getOwnPropertyDescriptor(node, key);
    if (desc && (desc.get || desc.set)) {
      errors.push(`${path}.${key}: is an accessor (get/set) — computed behaviour (§6.2)`);
      continue;
    }
    if (ruleShapedKey(key)) {
      errors.push(`${path}.${key}: rule-shaped key — a template declares constraints, never rules (§6.2)`);
    }
    scanForBehaviour(node[key], `${path}.${key}`, errors, seen);
  }
  seen.delete(node);
}

function isBox(box) {
  return !!box && typeof box === 'object'
    && ['x', 'y', 'w', 'h'].every((k) => typeof box[k] === 'number' && Number.isFinite(box[k]));
}

/* ONE per-dimension row, checked. Extracted so an AUTHORED STATE's effective
   row goes through the IDENTICAL gate the base row does — the state system adds
   geometry, it does not add a second, laxer contract. */
function checkPerDimRow(name, per, pat, errors) {
  if (typeof per.required !== 'boolean') errors.push(`${pat}.required: required boolean`);
  if (!isBox(per.box)) errors.push(`${pat}.box: required {x,y,w,h} in canvas fractions`);
  else {
    const { x, y, w, h } = per.box;
    if (w <= 0 || h <= 0) errors.push(`${pat}.box: w and h must be positive fractions`);
    /* ── WHO MAY BLEED (client ruling 2026-08-18) ─────────────────────────
       "the text off petal can be even bigger, overflowing the frame like
        referenced." A PHOTO WINDOW may therefore extend past the canvas —
       negative x/y, and w/h greater than 1 — and the frame CROPS it. That is
       a real composition (the client's own reference bleeds off three edges),
       not a bake mistake.

       TEXT AND MARK BOXES MAY NOT. Copy painted off-canvas is unreadable and
       always a mistake, so those are still held to 0..1 exactly as before.

       What is refused for a photo either way: a zero or negative size, a box
       so large it is meaningless (over 3× the canvas on an axis — nothing in
       a real composition needs that, and it is the shape of a units mistake),
       and a box that MISSES THE CANVAS ENTIRELY, which would paint nothing
       while claiming to be the design's window (M4).                      */
    const mayBleed = name === 'photo';
    if (!mayBleed) {
      if (x < 0 || y < 0 || x + w > 1.0001 || y + h > 1.0001) {
        errors.push(`${pat}.box: {x:${x}, y:${y}, w:${w}, h:${h}} falls outside the canvas (0..1) — only a photo window may bleed`);
      }
    } else {
      if (w > 3 || h > 3) errors.push(`${pat}.box: ${w}×${h} of the canvas — a window may bleed, but not by more than 3× (that is a units mistake, not a composition)`);
      if (x >= 1 || y >= 1 || x + w <= 0 || y + h <= 0) {
        errors.push(`${pat}.box: {x:${x}, y:${y}, w:${w}, h:${h}} does not overlap the canvas at all — it would paint nothing (M4)`);
      }
    }
  }
  if (TEXT_SLOT_SET.has(name)) {
    if (!Number.isInteger(per.maxLines) || per.maxLines < 1) errors.push(`${pat}.maxLines: required positive integer`);
    if (!Number.isInteger(per.charBudget) || per.charBudget < 1) errors.push(`${pat}.charBudget: required positive integer (MEASURED at the floor — §7.4)`);
  }
  // The photo's fit is an ENUM per dimension — the template says HOW the
  // photo sits in its box; it never computes it.
  if (name === 'photo' && !PHOTO_FIT_ENUM.includes(per.fit)) {
    errors.push(`${pat}.fit: required one of ${PHOTO_FIT_ENUM.join(' | ')}`);
  }
  /* ── THE MOTIF'S WEIGHT, PER DIMENSION (client ruling 2026-08-20) ──────────
     A watermark is only ever as good as how faint it is, and how faint it
     should be is a property of the DIMENSION it sits in — the same petal at
     the same alpha reads heavier in a 900px landscape band than in a 1350px
     portrait one. So the opacity is authored per dimension, exactly like the
     box, and it is a NUMBER: the render core reads it, the template decides
     nothing.

     THE BOUNDS ARE NOT DECORATION. 0 is refused for the same reason the photo
     scrim refuses it — a motif the core always paints cannot be a no-op (M4);
     if it should not be there, declare the slot absent. The upper bound is
     MOTIF_MAX_OPACITY rather than 1, because a motif is by definition GHOSTED
     into the field: above that it stops being a watermark and becomes a
     graphic element with copy sitting on top of it, which is a different
     design and a different contrast conversation. */
  if (name === 'motif') {
    if (typeof per.opacity !== 'number' || !(per.opacity > 0) || per.opacity > MOTIF_MAX_OPACITY) {
      errors.push(`${pat}.opacity: required number in (0, ${MOTIF_MAX_OPACITY}] — a motif the core always paints cannot be a no-op (M4), and above ${MOTIF_MAX_OPACITY} it is no longer ghosted into the field`);
    }
  }
}

/**
 * Validates a template against the §6 contract.
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateTemplate(template) {
  const errors = [];

  // (0) Nothing in the tree may be behaviour — checked FIRST so a rule-carrying
  //     template is rejected even if its table half is perfect.
  scanForBehaviour(template, 'template', errors, new Set());
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    return { valid: false, errors: errors.length ? errors : ['template: not an object'] };
  }

  // (1) Identity + client-facing purpose text (§6.2, §8).
  for (const k of ['id', 'name', 'purpose']) {
    if (typeof template[k] !== 'string' || !template[k].trim()) errors.push(`template.${k}: required non-empty string`);
  }
  if (template.galleryPreview !== undefined) {
    const preview = template.galleryPreview;
    if (!preview || typeof preview !== 'object' || Array.isArray(preview)) {
      errors.push('template.galleryPreview: when declared, required {src, alt} object');
    } else {
      if (typeof preview.src !== 'string' || !/^\/assets\/[a-z0-9/_-]+\.png$/i.test(preview.src) || preview.src.includes('..')) {
        errors.push('template.galleryPreview.src: required safe public /assets/*.png path');
      }
      if (typeof preview.alt !== 'string' || !preview.alt.trim()) {
        errors.push('template.galleryPreview.alt: required non-empty description');
      }
    }
  }
  if (typeof template.version !== 'number' || !Number.isInteger(template.version) || template.version < 1) {
    errors.push('template.version: required positive integer (open question 13.2 — a post records the version it used)');
  }

  // (2) Dimensions — a subset of the four, never derived (§5).
  const dims = template.dimensions;
  if (!dims || typeof dims !== 'object' || Array.isArray(dims)) {
    errors.push('template.dimensions: required object keyed by dimension id');
  } else {
    const ids = Object.keys(dims);
    if (!ids.length) errors.push('template.dimensions: must declare at least one dimension');
    for (const id of ids) if (!DIMENSIONS[id]) errors.push(`template.dimensions.${id}: not one of the four dimensions (${DIMENSION_IDS.join(', ')})`);
  }

  // (2b) A supporting register may declare a fixed upper scale relative to its
  // floor. This is a ceiling, not a runtime rule: it prevents a two-line caption
  // box from inflating one short word until it competes with the heading.
  if (template.registers && typeof template.registers === 'object') {
    for (const [name, reg] of Object.entries(template.registers)) {
      if (reg?.ceilingScale !== undefined && (typeof reg.ceilingScale !== 'number' || !Number.isFinite(reg.ceilingScale) || reg.ceilingScale < 1 || reg.ceilingScale > 3)) {
        errors.push(`template.registers.${name}.ceilingScale: when declared, a number from 1 to 3 relative to the legibility floor`);
      }
    }
  }

  // (3) Logo positions — subset of the enum, or none.
  const logoPositions = template.allowedLogoPositions;
  if (logoPositions !== 'none') {
    if (!Array.isArray(logoPositions) || !logoPositions.length) {
      errors.push("template.allowedLogoPositions: required non-empty array, or the string 'none'");
    } else {
      for (const p of logoPositions) if (!LOGO_POSITION_ENUM.includes(p)) errors.push(`template.allowedLogoPositions: '${p}' is not in the position enum`);
    }
  }

  // (3b) allowedLogoAssets — the sanctioned subset of the brand's REAL logo
  //      variant ids the user may swap between (law 3: only real assets). Shape
  //      is checked here; that every id names a real variant with a real file on
  //      disk is proven against the brand catalog in
  //      scripts/tests/template-one.test.mjs, so this file stays brand-agnostic.
  if (template.allowedLogoAssets !== undefined) {
    const ids = template.allowedLogoAssets;
    if (!Array.isArray(ids) || !ids.length) {
      errors.push('template.allowedLogoAssets: when declared, a non-empty array of brand logo variant ids');
    } else {
      ids.forEach((id, i) => {
        if (typeof id !== 'string' || !id.trim()) errors.push(`template.allowedLogoAssets[${i}]: required non-empty string id`);
      });
      if (new Set(ids).size !== ids.length) errors.push('template.allowedLogoAssets: duplicate id — the picker would show the same mark twice');
    }
  }

  // (3c) allowedMaskShapes — the sanctioned subset of PHOTO-WINDOW SILHOUETTES
  //      she may switch between (client ruling 2026-08-18: "i have a few petal
  //      shapes, can u make them as selections?"). Same shape of declaration as
  //      allowedLogoAssets: a plain array of ids, no duplicates. That every id
  //      names a real file on disk is proven in scripts/tests/template-two.test
  //      .mjs, so this file stays brand-agnostic.
  //
  //      SCOPE (client ruling, same day): these are TEMPLATE-ONLY. They are
  //      resolved by lib/templates/mask-assets.mjs, which reads no shared
  //      overlay catalog, so a shape added here cannot appear in the admin
  //      app's Shapes rail or the AI's placeable-shape vocabulary.
  if (template.allowedMaskShapes !== undefined) {
    const ids = template.allowedMaskShapes;
    if (!Array.isArray(ids) || !ids.length) {
      errors.push('template.allowedMaskShapes: when declared, a non-empty array of shape asset ids');
    } else {
      ids.forEach((id, i) => {
        if (typeof id !== 'string' || !id.trim()) errors.push(`template.allowedMaskShapes[${i}]: required non-empty string id`);
        // The id becomes a PATH. Anything that is not a plain slug could
        // traverse out of the shape directory, so it is refused by shape.
        else if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errors.push(`template.allowedMaskShapes[${i}]: '${id}' is not a plain slug — an id becomes a file path`);
      });
      if (new Set(ids).size !== ids.length) errors.push('template.allowedMaskShapes: duplicate id — the picker would show the same window twice');
      const declared = template.slots?.photo?.mask;
      if (declared !== undefined && !ids.includes(declared)) {
        errors.push(`template.slots.photo.mask: the default '${declared}' is not in allowedMaskShapes — the template would open on a shape she cannot get back to`);
      }
      if (!template.slots?.photo?.present || !declared) {
        errors.push('template.allowedMaskShapes: declared without a present photo slot that names a default mask — a picker for nothing');
      }
    }
  }

  // (4) Colour pairs — PRE-VERIFIED, with the measured ratio recorded in the data.
  const pairs = template.colourPairs;
  if (!Array.isArray(pairs) || pairs.length < 2) {
    errors.push('template.colourPairs: required array of at least 2 pre-verified pairs (§6.2)');
  } else {
    pairs.forEach((p, i) => {
      const at = `template.colourPairs[${i}]`;
      if (!p || typeof p !== 'object') { errors.push(`${at}: not an object`); return; }
      for (const k of ['id', 'label', 'bg', 'ink']) if (typeof p[k] !== 'string' || !p[k]) errors.push(`${at}.${k}: required string`);
      const measured = contrastRatio(p.bg, p.ink);
      if (measured == null) { errors.push(`${at}: bg/ink must be #rrggbb hex so contrast can be verified`); return; }
      if (typeof p.contrast !== 'number') {
        errors.push(`${at}.contrast: the measured ratio must be RECORDED in the data (bake-time verification, §10B)`);
      } else if (Math.abs(p.contrast - measured) > 0.02) {
        errors.push(`${at}.contrast: recorded ${p.contrast} but the colours measure ${measured} — stale bake`);
      }
      if (measured < MIN_PAIR_CONTRAST) errors.push(`${at}: contrast ${measured} is below the pre-verified floor ${MIN_PAIR_CONTRAST}`);
      // `klass` is what `logoAssets` is looked up by. Unstated, the default mark
      // silently resolves to nothing — so it is required, not optional.
      if (!COLOUR_CLASSES.includes(p.klass)) errors.push(`${at}.klass: required, one of ${COLOUR_CLASSES.join(' | ')} — logoAssets is keyed by it`);
      if (p.id !== undefined && typeof p.id === 'string' && p.id.includes('.')) errors.push(`${at}.id: must not contain a dot — it keys the scrim table`);
    });
  }

  if (Array.isArray(pairs)) {
    const ids = pairs.map((p) => p && p.id).filter((id) => typeof id === 'string');
    if (new Set(ids).size !== ids.length) errors.push('template.colourPairs: duplicate pair id — the scrim table could not be keyed unambiguously');
  }

  // (5) motif — 'none' or an allowed set (§6.2, §9).
  if (template.motif !== 'none' && !(Array.isArray(template.motif) && template.motif.every((m) => typeof m === 'string'))) {
    errors.push("template.motif: must be the string 'none' or an array of motif ids");
  }

  /* (5b) THE MOTIF SET AND THE MOTIF SLOT MUST AGREE — fail closed, both ways.
     Two silent failures are possible without this and neither throws:
       · a present motif slot with `motif: 'none'` — the template paints a
         watermark the brand set says it does not have
       · a motif SET with no slot to paint it — a declaration for nothing (M4)

     AND THE SET IS EXACTLY ONE ID, for now. The client ruled the motif FIXED
     ("fixed for now"), so the user app offers NO motif picker — which means a
     second id in the set is a choice she cannot make. §9's "pick one from the
     brand set, or none" is not being re-litigated: when a picker is ruled in,
     this bound is what has to be lifted deliberately, in one place, instead of
     a second id quietly doing nothing. */
  {
    const motifSlot = template?.slots?.motif;
    const set = Array.isArray(template.motif) ? template.motif : null;
    if (motifSlot && typeof motifSlot === 'object' && motifSlot.present === true) {
      if (!set) {
        errors.push("template.motif: a present motif slot needs the brand set that sanctions its asset — 'none' says this template has no motif while the slot paints one");
      } else {
        if (set.length !== 1) {
          errors.push(`template.motif: ${set.length} ids declared, but the motif is FIXED (client ruling 2026-08-20) and the user app offers no picker — every id past the first is a choice she cannot make (M4)`);
        }
        const asset = motifSlot.asset;
        if (typeof asset !== 'string' || !asset.trim()) {
          errors.push('template.slots.motif.asset: a present motif slot must name the ONE real brand asset it paints (a string id) — never inline geometry');
        } else if (!/^[a-z0-9][a-z0-9-]*$/.test(asset)) {
          errors.push(`template.slots.motif.asset: '${asset}' is not a plain slug — an id becomes a file path`);
        } else if (!set.includes(asset)) {
          errors.push(`template.slots.motif.asset: '${asset}' is not in template.motif (${set.join(', ')}) — the template would paint a motif the brand set does not sanction (law 3)`);
        }
      }
    } else if (set) {
      errors.push('template.motif: a motif set is declared but slots.motif.present is not true — a motif nothing paints is a dead declaration (M4)');
    }
  }

  // (6) Slots — the closed vocabulary, complete, per dimension.
  const slots = template.slots;
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) {
    errors.push('template.slots: required object keyed by slot name');
  } else {
    for (const name of Object.keys(slots)) {
      if (!SLOT_SET.has(name)) errors.push(`template.slots.${name}: not in the CLOSED slot vocabulary (${SLOTS.join(', ')})`);
    }
    for (const name of SLOTS) {
      const slot = slots[name];
      const at = `template.slots.${name}`;
      if (!slot || typeof slot !== 'object') { errors.push(`${at}: every slot in the closed set must be declared (present:false is how a template opts out — §6.3 deactivating never deletes)`); continue; }
      if (typeof slot.present !== 'boolean') { errors.push(`${at}.present: required boolean`); continue; }
      if (!slot.present) continue;

      const dimIds = dims && typeof dims === 'object' ? Object.keys(dims) : [];
      for (const dimId of dimIds) {
        const per = slot.dimensions?.[dimId];
        const pat = `${at}.dimensions.${dimId}`;
        if (!per || typeof per !== 'object') { errors.push(`${pat}: a present slot must declare constraints for every supported dimension (§6.2)`); continue; }
        if (typeof per.present !== 'boolean') errors.push(`${pat}.present: required boolean`);
        if (per.present === false) continue;
        checkPerDimRow(name, per, pat, errors);
      }

      // The photo TREATMENT as data (§6.2 / client amendment 2026-08-18, amended
      // again by the client ruling of 2026-08-18 — PER-PAIR SCRIMS): one fixed
      // scrim PER COLOUR PAIR, colour + opacity. The render core ALWAYS paints it
      // over a photo, so an absent or transparent scrim is rejected — a scrim
      // that does nothing would be a dead declaration (M4).
      //
      // WHY PER PAIR AND NOT PER CLASS. Keyed by class, every `light` pair shared
      // one wash: ivory, sage and blush all painted the ivory scrim over a
      // full-bleed photo, so all three tiles rendered IDENTICALLY and the pair
      // she picked stopped meaning anything. Two of four pairs were therefore
      // unusable with a photo. Per pair, the scrim carries that pair's OWN field
      // colour at that pair's OWN measured opacity. Still pure data (§6.2): a
      // hex and a number per pair, no conditionals.
      //
      // FAIL CLOSED, BOTH WAYS: every declared pair must have a row (a pair added
      // later without one would silently fall back to no scrim at all), and every
      // row must name a declared pair (an orphan row is a dead declaration, M4).
      // THE MASK (client ruling 2026-08-18 — template two). A template may
      // declare the id of a REAL brand shape its photo is revealed through. It
      // is a STRING, never geometry: no path data, no viewBox, nothing that
      // could drift from the asset on disk. lib/templates/mask-assets.mjs
      // resolves it against the brand catalog and returns null for an id that
      // names nothing (law 3) — the render core then refuses to paint rather
      // than showing an unmasked photo under a masked template's name.
      // (client ruling 2026-08-18) MAY SHE CROP INSIDE THE WINDOW? A flag, not
      // a rule — the template says whether its photo is a picture she frames or
      // a texture behind type, and the surface offers the control or does not.
      if (name === 'photo' && slot.adjustable !== undefined && typeof slot.adjustable !== 'boolean') {
        errors.push(`${at}.adjustable: when declared, a boolean — whether she may pan and zoom the photo inside the fixed window`);
      }
      if (name === 'photo' && slot.mask !== undefined) {
        if (typeof slot.mask !== 'string' || !slot.mask.trim()) {
          errors.push(`${at}.mask: when declared, the id of a real brand shape asset (a string) — never inline geometry`);
        }
      }

      if (name === 'photo') {
        const scrim = slot.scrim;
        const pairIds = Array.isArray(pairs) ? pairs.map((p) => p && p.id).filter((id) => typeof id === 'string' && id) : [];
        if (!scrim || typeof scrim !== 'object' || Array.isArray(scrim)) {
          errors.push(`${at}.scrim: a present photo slot must declare the fixed scrim, keyed by colour PAIR id (${pairIds.join(', ') || 'none declared'})`);
        } else {
          for (const pairId of pairIds) {
            const row = scrim[pairId];
            const sat = `${at}.scrim.${pairId}`;
            if (!row || typeof row !== 'object' || Array.isArray(row)) {
              errors.push(`${sat}: EVERY declared colour pair must declare its own scrim { colour, opacity } — a pair with no scrim would paint an unmeasured photo`);
              continue;
            }
            if (relativeLuminance(row.colour) == null) errors.push(`${sat}.colour: required #rrggbb hex`);
            if (typeof row.opacity !== 'number' || !(row.opacity > 0) || row.opacity > 1) {
              errors.push(`${sat}.opacity: required number in (0, 1] — a scrim the core always paints cannot be a no-op`);
            }
          }
          const known = new Set(pairIds);
          for (const key of Object.keys(scrim)) {
            if (!known.has(key)) errors.push(`${at}.scrim.${key}: names no declared colour pair — a scrim nothing can select is a dead declaration (M4)`);
          }
        }
      }

      /* ── THE MARK PLATE (client ruling 2026-08-20 — template three) ────────
         The first template to put the brand mark ON an unknown photograph, and
         the sweep that decision forced (scripts/tools/scan-mark-on-photo.mjs,
         131 library photos x 3 pairs x 4 dimensions x 2 sanctioned inks x 2
         corners) said plainly that it cannot be done bare: at scrim 0 the mark
         fails its 3.0 floor on 305 of 524 photo/dimension combinations, and the
         lowest wash that clears the WHOLE library is 0.66 / 0.74 / 0.64 — which
         costs the photograph 64-74% of itself for the sake of one corner.

         So a template may declare a PLATE: a fixed, always-painted panel behind
         the mark, in the pair's own field colour. It is DATA, and the line
         between it and the auto-backings law 3 retired (b30fc8e) is the line
         that law is actually about — those were RUNTIME REMEDIES a guard
         applied when a check failed, varying with the content. This never
         varies, never reacts, and is painted on every render whether it is
         needed or not; it is a drawn element of the template, exactly as the
         photo scrim already is under §10's amendment. The backdrop check is not
         skipped or softened: it still samples the real pixels, and it passes
         because the pixels really are the pre-verified field.

         SHAPE: `pad` is padding on every side as a fraction of the MARK's own
         width, so the plate scales with the mark rather than with the canvas.
         `radius` is the corner radius as a fraction of the plate's SHORT side —
         0.5 is a stadium, 0 a square corner. `fill` carries one colour and
         opacity PER PAIR, for the same reason the photo scrim does: keyed by
         colour class, three light pairs would share one plate and the pair she
         picked would stop meaning anything behind the mark. */
      if (name === 'logo' && slot.plate !== undefined) {
        const plate = slot.plate;
        const at2 = `${at}.plate`;
        if (!plate || typeof plate !== 'object' || Array.isArray(plate)) {
          errors.push(`${at2}: when declared, an object { pad, radius, fill }`);
        } else {
          if (typeof plate.pad !== 'number' || !(plate.pad >= 0) || plate.pad > 1) {
            errors.push(`${at2}.pad: required number in [0, 1] — padding on every side, as a fraction of the mark's own width`);
          }
          if (typeof plate.radius !== 'number' || !(plate.radius >= 0) || plate.radius > 0.5) {
            errors.push(`${at2}.radius: required number in [0, 0.5] — the corner radius as a fraction of the plate's short side (0.5 is a stadium)`);
          }
          const pairIds = Array.isArray(pairs) ? pairs.map((p) => p && p.id).filter((id) => typeof id === 'string' && id) : [];
          const fill = plate.fill;
          if (!fill || typeof fill !== 'object' || Array.isArray(fill)) {
            errors.push(`${at2}.fill: required, keyed by colour PAIR id (${pairIds.join(', ') || 'none declared'})`);
          } else {
            for (const pairId of pairIds) {
              const row = fill[pairId];
              const fat = `${at2}.fill.${pairId}`;
              if (!row || typeof row !== 'object' || Array.isArray(row)) {
                errors.push(`${fat}: EVERY declared colour pair must declare its own plate { colour, opacity } — a pair with no plate would put the mark back on an unmeasured photograph`);
                continue;
              }
              if (relativeLuminance(row.colour) == null) errors.push(`${fat}.colour: required #rrggbb hex`);
              if (typeof row.opacity !== 'number' || !(row.opacity > 0) || row.opacity > 1) {
                errors.push(`${fat}.opacity: required number in (0, 1] — a plate the core always paints cannot be a no-op (M4)`);
              }
            }
            const known = new Set(pairIds);
            for (const key of Object.keys(fill)) {
              if (!known.has(key)) errors.push(`${at2}.fill.${key}: names no declared colour pair — a plate nothing can select is a dead declaration (M4)`);
            }
          }
        }
      }

      // §7.1 THE CROSS-DIMENSION MINIMUM. All four dimensions show the same copy,
      // so the budget a template DECLARES for a text slot is the minimum across
      // the dimensions it supports — otherwise her post fits three and breaks in
      // the fourth. Enforced here so a template cannot ship an unequalised budget.
      if (TEXT_SLOT_SET.has(name)) {
        const perDimBudgets = dimIds
          .map((d) => slot.dimensions?.[d])
          .filter((p) => p && p.present !== false)
          .map((p) => p.charBudget)
          .filter((n) => Number.isInteger(n));
        if (perDimBudgets.length) {
          const min = Math.min(...perDimBudgets);
          if (!Number.isInteger(slot.charBudget)) errors.push(`${at}.charBudget: a present text slot must declare the cross-dimension minimum (§7.1)`);
          else if (slot.charBudget !== min) errors.push(`${at}.charBudget: declared ${slot.charBudget} but the cross-dimension MINIMUM is ${min} (§7.1)`);
        }
      }
    }
  }

  // (6b) Per-template field copy — strings, for slots this template paints.
  if (template.slotLabels !== undefined) {
    const map = template.slotLabels;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      errors.push('template.slotLabels: when declared, an object keyed by slot name');
    } else {
      for (const name of Object.keys(map)) {
        const at = `template.slotLabels.${name}`;
        if (!SLOT_SET.has(name)) { errors.push(`${at}: not in the CLOSED slot vocabulary`); continue; }
        if (!template.slots?.[name]?.present) { errors.push(`${at}: names a slot this template does not paint — a label for nothing (M4)`); continue; }
        const row = map[name];
        if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`${at}: an object of copy strings`); continue; }
        for (const key of Object.keys(row)) {
          if (!SLOT_LABEL_KEYS.includes(key)) errors.push(`${at}.${key}: only ${SLOT_LABEL_KEYS.join(' and ')} may be overridden`);
          else if (typeof row[key] !== 'string' || !row[key].trim()) errors.push(`${at}.${key}: required non-empty string`);
          else if (key === 'label' && !EDIT_FIELD_LABELS.includes(row[key])) errors.push(`${at}.label: must be one of ${EDIT_FIELD_LABELS.join(', ')} — edit vocabulary is shared across templates`);
        }
      }
    }
  }

  // (7) THE PANEL'S SECTION ORDER — declared as data, validated in both
  //     directions so it can be neither short nor decorative.
  validatePanelSections(template, errors);

  // (8) THE AUTHORED STATES — the same rigour as the single-state case.
  validateStates(template, errors);

  return { valid: errors.length === 0, errors };
}

/* Which panel controls THIS template actually needs, read off its own
   declarations. A table, not a judgement: each need is present or it is not. */
function panelNeedsOf(template) {
  const slots = template?.slots || {};
  const needs = new Set();
  if (TEXT_SLOTS.some((s) => slots[s]?.present)) needs.add('text');
  if (slots.colourPair?.present) needs.add('colourPair');
  if (slots.photo?.present) needs.add('photo');
  if (template?.allowedMaskShapes !== undefined) needs.add('mask');
  if (slots.logo?.present) { needs.add('logo'); needs.add('logoPosition'); }
  return needs;
}

function validatePanelSections(template, errors) {
  const order = template?.panelSections;
  if (!Array.isArray(order) || !order.length) {
    errors.push('template.panelSections: required non-empty ordered array of section ids — the panel renders them IN SEQUENCE, so the order is the template\'s to declare, never the surface\'s to guess');
    return;
  }
  for (const id of order) {
    if (typeof id !== 'string' || !PANEL_SECTION_IDS.includes(id)) {
      errors.push(`template.panelSections: '${id}' is not a known section (${PANEL_SECTION_IDS.join(', ')})`);
    }
  }
  if (new Set(order).size !== order.length) {
    errors.push('template.panelSections: duplicate section id — a section can only be in one place in the panel');
  }
  const known = order.filter((id) => PANEL_SECTION_IDS.includes(id));
  const needs = panelNeedsOf(template);
  for (const need of needs) {
    const serving = known.filter((id) => PANEL_SECTION_SERVES[id].includes(need));
    if (!serving.length) errors.push(`template.panelSections: nothing offers '${need}' — the control would be unreachable`);
    else if (serving.length > 1) errors.push(`template.panelSections: '${need}' is offered by ${serving.join(' and ')} — the same picker twice`);
  }
  for (const id of known) {
    const serves = PANEL_SECTION_SERVES[id].filter((need) => needs.has(need));
    if (!serves.length) errors.push(`template.panelSections: '${id}' serves nothing this template declares — a control for nothing (M4)`);
  }
}

function validateStates(template, errors) {
  const states = template?.states;
  if (states === undefined) return;              // a template with one layout never branches
  if (!states || typeof states !== 'object' || Array.isArray(states)) {
    errors.push('template.states: when declared, an object keyed by state id');
    return;
  }
  const ids = Object.keys(states);
  for (const id of ids) {
    if (!TEMPLATE_STATE_IDS.includes(id)) {
      errors.push(`template.states.${id}: not one of the two authored states (${TEMPLATE_STATE_IDS.join(', ')}) — a THIRD state, or any interpolation between them, is a solver and needs a client ruling, not a key`);
    }
  }
  for (const id of TEMPLATE_STATE_IDS) {
    if (!(id in states)) errors.push(`template.states.${id}: both authored states must be declared, so the pair is readable as a pair`);
  }
  // `withHeading` IS the baked geometry. Overriding anything there would mean
  // the base is a third layout nothing renders.
  const base = states.withHeading;
  if (base && typeof base === 'object' && Object.keys(base).length) {
    errors.push('template.states.withHeading: must override nothing — slots.*.dimensions IS that state; a second copy could only drift from it');
  }

  const alt = states.photoOnly;
  if (alt === undefined) return;
  if (!alt || typeof alt !== 'object' || Array.isArray(alt)) {
    errors.push('template.states.photoOnly: an object keyed by slot name');
    return;
  }
  const slotNames = Object.keys(alt);
  if (!slotNames.length) {
    errors.push('template.states.photoOnly: overrides nothing — a state identical to the base is a dead declaration (M4)');
  }
  const dimIds = Object.keys(template?.dimensions || {});
  for (const slotName of slotNames) {
    const at = `template.states.photoOnly.${slotName}`;
    if (!SLOT_SET.has(slotName)) { errors.push(`${at}: not in the CLOSED slot vocabulary`); continue; }
    if (!template?.slots?.[slotName]?.present) { errors.push(`${at}: the base template does not paint this slot — a state cannot introduce one`); continue; }
    const rows = alt[slotName];
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) { errors.push(`${at}: an object keyed by dimension id`); continue; }
    // PARTIAL COVERAGE IS REFUSED. A state that redraws portrait and forgets
    // story would render two different designs under one name.
    for (const dimId of dimIds) {
      if (!rows[dimId]) errors.push(`${at}.${dimId}: a state must cover EVERY declared dimension it touches a slot in — partial coverage is two designs under one name`);
    }
    for (const dimId of Object.keys(rows)) {
      const pat = `${at}.${dimId}`;
      if (!dimIds.includes(dimId)) { errors.push(`${pat}: not a dimension this template declares`); continue; }
      const row = rows[dimId];
      if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`${pat}: a geometry row`); continue; }
      // GEOMETRY ONLY. A state cannot move a budget, a maxLines, a fit or a
      // required flag — that is what keeps §7.1 true with no second copy.
      for (const key of Object.keys(row)) {
        if (!STATE_OVERRIDE_KEYS.includes(key)) {
          errors.push(`${pat}.${key}: a state may override GEOMETRY only (${STATE_OVERRIDE_KEYS.join(', ')}) — anything else would give one template two contracts`);
        }
      }
      const baseRow = template?.slots?.[slotName]?.dimensions?.[dimId];
      if (!baseRow) continue;
      const eff = { ...baseRow, ...row };
      if (eff.present === false) continue;       // absent in this state — nothing to check
      checkPerDimRow(slotName, eff, pat, errors);
      // …and it must actually CHANGE something, or it is a dead declaration.
      const same = STATE_OVERRIDE_KEYS.every((k) => !(k in row) || JSON.stringify(row[k]) === JSON.stringify(baseRow[k]));
      if (same) errors.push(`${pat}: identical to the base row — a state that changes nothing is a dead declaration (M4)`);
    }
  }
}

/** Throwing wrapper — used at module load so a bad template can never render. */
export function assertValidTemplate(template) {
  const { valid, errors } = validateTemplate(template);
  if (!valid) throw new Error(`Invalid template '${template?.id ?? '?'}':\n  - ${errors.join('\n  - ')}`);
  return template;
}

/**
 * The per-dimension constraint row for a slot, or null when it does not paint
 * here. With a `stateId` the AUTHORED STATE's geometry overrides are applied —
 * without one the baked base geometry is returned exactly as before, so every
 * existing caller is unchanged and a template with no states cannot branch.
 */
export function slotConstraint(template, slotName, dimensionId, stateId = null) {
  const slot = template?.slots?.[slotName];
  if (!slot || !slot.present) return null;
  const per = slot.dimensions?.[dimensionId];
  if (!per || per.present === false) return null;
  const over = stateId ? template?.states?.[stateId]?.[slotName]?.[dimensionId] : null;
  if (!over) return per;
  const merged = { ...per, ...over };
  if (merged.present === false) return null;
  return merged;
}
