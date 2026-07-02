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
  // DIMENSIONS[].id
  dimensionId: ['ig_square', 'ig_portrait', 'story', 'twitter', 'facebook', 'banner'],
  // BG_OPTIONS[].id
  bgColor: ['burnham', 'whiteSmoke', 'wisteria', 'celadon', 'jet'],
  // TEXT_COLOR_OPTIONS[].id
  textColorId: ['auto', 'whiteSmoke', 'burnham', 'jet', 'tangerine', 'wisteria'],
  // LOGO_VARIANTS[].id
  logoId: ['p1-green', 'p1-ivory', 'p2-green', 'p2-ivory', 'p3-green', 'p3-ivory', 'p3f-green', 'p4', 'p-central', 'p-circle', 'p-bg', 's1-green', 's1-ivory', 's2-green'],
  // LOGO_POSITIONS keys (9-grid)
  logoPosition: ['top-left', 'top-center', 'top-right', 'mid-left', 'mid-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'],
  // LOGO_SIZES[].id
  logoSize: ['s', 'm', 'l', 'xl'],
  // backdropMode states
  backdropMode: ['auto', 'gradient', 'band', 'none'],
  // FONT_ROLES[].id — keys allowed in the fontSizes object
  fontRole: ['heading', 'subheading', 'content', 'highlight'],
  // FONT_SIZE_STEPS[].id — values allowed in the fontSizes object
  fontStep: ['xs', 's', 'm', 'l', 'xl'],
  // DEFAULT_OVERLAYS[].id (built-in shapes + accessories, incl. orchid-petal)
  overlayAssetId: ['orchid-petal', 'shape-1', 'shape-2', 'shape-3', 'acc-arrow', 'acc-curve', 'acc-spark', 'acc-plus', 'acc-ring', 'acc-wave'],
  // overlay layer modes
  overlayMode: ['frame', 'outline', 'lineart', 'overlay'],
};

// Human-readable notes fed to the model so it knows what each field does.
export const PATCH_FIELD_GUIDE = {
  postType: 'Layout family: photo_logo (visual-first), quote (headline is the quote, attribution is source), event (headline is title, dateText is a date only if given, subtext is a detail/CTA), text_post (subtext intro, headline main line, attribution supporting), texture_text (short headline over a photo).',
  dimensionId: 'Canvas format: ig_square (1:1), ig_portrait (4:5), story (9:16), twitter (16:9), facebook (1.91:1), banner (3:1).',
  headline: 'Main line of copy. Keep concise. Never invent quotations, sources, dates, statistics, offers, or factual claims.',
  subtext: 'Secondary line / intro / detail depending on postType.',
  attribution: 'Source or supporting line. Never invent a source.',
  dateText: 'A date ONLY if the user explicitly supplied one. Otherwise leave empty.',
  bgColor: 'Background colour token: burnham (deep green), whiteSmoke (ivory), wisteria (mauve), celadon (soft green), jet (near-black).',
  textColorId: 'Text colour token, or "auto" to let the editor pick an accessible colour.',
  logoId: 'Logo variant id. Use an ivory logo (…-ivory) on dark/photo backgrounds and a green logo (…-green) on light backgrounds.',
  logoPosition: '9-grid anchor for the logo (top-left … bottom-right).',
  logoSize: 'Logo size: s, m, l, or xl.',
  backdropMode: 'Scrim behind text: auto (add only where needed), gradient (full-bleed brand gradient), band (solid brand strip), none (drop shadow only).',
  fontSizes: 'Object mapping a text role (heading, subheading, content, highlight) to a size step (xs, s, m, l, xl). Only include roles you want to resize.',
  addOverlay: 'Place a built-in brand shape. { assetId: one of orchid-petal/shape-1..3/acc-*, mode: frame|outline|lineart|overlay }. orchid-petal in "frame" mode makes the signature orchid photo frame.',
  removeOverlays: 'Set true to clear all placed overlay shapes.',
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
        'postType', 'dimensionId', 'headline', 'subtext', 'attribution', 'dateText',
        'bgColor', 'textColorId', 'logoId', 'logoPosition', 'logoSize', 'backdropMode',
        'fontSizes', 'addOverlay', 'removeOverlays',
      ],
      properties: {
        postType: nullableEnum(PATCH_OPTIONS.postType),
        dimensionId: nullableEnum(PATCH_OPTIONS.dimensionId),
        headline: nullableString(100),
        subtext: nullableString(140),
        attribution: nullableString(100),
        dateText: nullableString(60),
        bgColor: nullableEnum(PATCH_OPTIONS.bgColor),
        textColorId: nullableEnum(PATCH_OPTIONS.textColorId),
        logoId: nullableEnum(PATCH_OPTIONS.logoId),
        logoPosition: nullableEnum(PATCH_OPTIONS.logoPosition),
        logoSize: nullableEnum(PATCH_OPTIONS.logoSize),
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
const AUDIT_COPY_FIELDS = ['headline', 'subtext', 'attribution', 'dateText'];
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

// Which patch keys count as "real" changes (used to summarise + gate apply).
export const PATCH_CHANGE_KEYS = [
  'postType', 'dimensionId', 'headline', 'subtext', 'attribution', 'dateText',
  'bgColor', 'textColorId', 'logoId', 'logoPosition', 'logoSize', 'backdropMode',
  'fontSizes', 'addOverlay', 'removeOverlays',
];

// Friendly labels for the "changed: …" summary line in the editor chat.
export const PATCH_KEY_LABELS = {
  postType: 'post type',
  dimensionId: 'format',
  headline: 'headline',
  subtext: 'subtext',
  attribution: 'attribution',
  dateText: 'date',
  bgColor: 'background',
  textColorId: 'text colour',
  logoId: 'logo',
  logoPosition: 'logo position',
  logoSize: 'logo size',
  backdropMode: 'text backdrop',
  fontSizes: 'text size',
  addOverlay: 'overlay',
  removeOverlays: 'overlay',
};

// True if the patch would change anything at all.
export function patchHasChanges(patch) {
  if (!patch || typeof patch !== 'object') return false;
  return PATCH_CHANGE_KEYS.some(key => {
    const value = patch[key];
    if (value === undefined || value === null) return false;
    if (key === 'removeOverlays') return value === true;
    if (key === 'fontSizes') return value && typeof value === 'object' && Object.keys(value).length > 0;
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
    const label = PATCH_KEY_LABELS[key] || key;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join(', ');
}
