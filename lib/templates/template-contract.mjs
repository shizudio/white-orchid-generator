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

// Keys that smell like behaviour. A template carrying one of these has started
// re-growing the solver in data (§6.2) and is rejected by name, not by value.
const RULE_SHAPED_KEYS = Object.freeze([
  'if', 'when', 'unless', 'else', 'then', 'rule', 'rules', 'condition', 'conditions',
  'compute', 'computed', 'derive', 'derived', 'fn', 'func', 'handler', 'callback',
  'solve', 'solver', 'expr', 'expression', 'script', 'eval',
]);
const RULE_SHAPED_SET = new Set(RULE_SHAPED_KEYS);

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
    if (RULE_SHAPED_SET.has(key.toLowerCase())) {
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
    });
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
