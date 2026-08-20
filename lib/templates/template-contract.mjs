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
        if (typeof per.required !== 'boolean') errors.push(`${pat}.required: required boolean`);
        if (!isBox(per.box)) errors.push(`${pat}.box: required {x,y,w,h} in canvas fractions`);
        if (TEXT_SLOT_SET.has(name)) {
          if (!Number.isInteger(per.maxLines) || per.maxLines < 1) errors.push(`${pat}.maxLines: required positive integer`);
          if (!Number.isInteger(per.charBudget) || per.charBudget < 1) errors.push(`${pat}.charBudget: required positive integer (MEASURED at the floor — §7.4)`);
        }
        // The photo's fit is an ENUM per dimension — the template says HOW the
        // photo sits in its box; it never computes it.
        if (name === 'photo' && !PHOTO_FIT_ENUM.includes(per.fit)) {
          errors.push(`${pat}.fit: required one of ${PHOTO_FIT_ENUM.join(' | ')}`);
        }
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

  return { valid: errors.length === 0, errors };
}

/** Throwing wrapper — used at module load so a bad template can never render. */
export function assertValidTemplate(template) {
  const { valid, errors } = validateTemplate(template);
  if (!valid) throw new Error(`Invalid template '${template?.id ?? '?'}':\n  - ${errors.join('\n  - ')}`);
  return template;
}

/** The per-dimension constraint row for a slot, or null when it does not paint here. */
export function slotConstraint(template, slotName, dimensionId) {
  const slot = template?.slots?.[slotName];
  if (!slot || !slot.present) return null;
  const per = slot.dimensions?.[dimensionId];
  if (!per || per.present === false) return null;
  return per;
}
