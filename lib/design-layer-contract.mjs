/**
 * Executable foundation for docs/design-layer-contract.md.
 *
 * This module owns semantic layer vocabulary and cross-layer rule metadata. It
 * deliberately contains no brand facts, rendering code, React state, or storage
 * calls. Renderer/audit migrations can consume it one rule family at a time.
 */

export const DESIGN_LAYER_CONTRACT_VERSION = 1;

export const DESIGN_LAYER_TYPES = Object.freeze({
  FORMAT: "format",
  LAYOUT: "layout",
  BACKGROUND: "background",
  MEDIA: "media",
  CONTENT: "content",
  TYPOGRAPHY: "typography",
  BRAND_MARK: "brand-mark",
  STRUCTURAL_SHAPE: "structural-shape",
  DECORATION: "decoration",
  FURNITURE: "furniture",
});

export const SHAPE_ROLES = Object.freeze({
  IMAGE_FRAME: "image-frame",
  IMAGE_MASK: "image-mask",
  CONTENT_PANEL: "content-panel",
  STRUCTURAL_OVERLAY: "structural-overlay",
  DECORATIVE_OVERLAY: "decorative-overlay",
  ICON: "icon",
  DIVIDER: "divider",
});

export const SHAPE_RENDER_MODES = Object.freeze({
  FRAME: "frame",
  FILL: "fill",
  OUTLINE: "outline",
  LINE_ART: "line-art",
});

export const SHAPE_LAYER_GROUPS = Object.freeze({
  STRUCTURE: "structure",
  DECORATION: "decoration",
});

const SHAPE_ROLE_LABELS = Object.freeze({
  [SHAPE_ROLES.IMAGE_FRAME]: "Image frame",
  [SHAPE_ROLES.IMAGE_MASK]: "Image mask",
  [SHAPE_ROLES.CONTENT_PANEL]: "Content panel",
  [SHAPE_ROLES.STRUCTURAL_OVERLAY]: "Layout overlay",
  [SHAPE_ROLES.DECORATIVE_OVERLAY]: "Decoration",
  [SHAPE_ROLES.ICON]: "Icon",
  [SHAPE_ROLES.DIVIDER]: "Divider",
});

export const LAYER_OWNERS = Object.freeze({
  LAYOUT: "layout",
  CONTENT: "content",
  BRAND: "brand",
  USER: "user",
  SYSTEM: "system",
});

export const RULE_SEVERITIES = Object.freeze({
  BLOCKING: "blocking",
  WARNING: "warning",
  ADVISORY: "advisory",
});

export const RULE_ENFORCEMENTS = Object.freeze({
  PREVENT: "prevent",
  AUTO_REPAIR: "auto-repair",
  PREVENT_OR_REPAIR: "prevent-or-repair",
  WARN: "warn",
  REQUIRE_APPROVAL: "require-approval",
});

export const Z_BANDS = Object.freeze({
  BACKGROUND: 0,
  MEDIA: 10,
  STRUCTURAL_MEDIA: 20,
  STRUCTURAL_UNDERLAY: 30,
  CONTENT: 40,
  BRAND_MARK: 50,
  STRUCTURAL_OVERLAY: 60,
  DECORATION: 70,
  EDITOR_CHROME: 80,
});

const STRUCTURAL_ROLE_SET = new Set([
  SHAPE_ROLES.IMAGE_FRAME,
  SHAPE_ROLES.IMAGE_MASK,
  SHAPE_ROLES.CONTENT_PANEL,
  SHAPE_ROLES.STRUCTURAL_OVERLAY,
]);
const SHAPE_ROLE_SET = new Set(Object.values(SHAPE_ROLES));
const OWNER_SET = new Set(Object.values(LAYER_OWNERS));
const RENDER_MODE_SET = new Set(Object.values(SHAPE_RENDER_MODES));

const rule = (id, layers, kind, severity, enforcement, remedies = [], source = "system") => Object.freeze({
  id,
  layers:Object.freeze([...layers]),
  kind,
  severity,
  enforcement,
  remedies:Object.freeze([...remedies]),
  source,
});

/**
 * Stable rule IDs are the join key between preflight, renderer measurements,
 * advice-ledger findings, approvals, analytics, and future brand-profile rules.
 */
export const DESIGN_RULES = Object.freeze([
  rule("format.export-bounds", [DESIGN_LAYER_TYPES.FORMAT], "bounds", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["move-inside", "switch-layout"]),
  rule("format.platform-occlusion", [DESIGN_LAYER_TYPES.FORMAT], "safe-zone", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["move-inside", "apply-format-layout"]),
  rule("pin.no-silent-overwrite", [DESIGN_LAYER_TYPES.LAYOUT], "ownership", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.REQUIRE_APPROVAL, ["solve-around-pin", "unpin", "switch-layout"]),
  rule("content.stored-equals-painted", [DESIGN_LAYER_TYPES.CONTENT], "fidelity", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT, ["persist-fitted-copy"]),
  rule("content.complete-or-absent", [DESIGN_LAYER_TYPES.CONTENT], "fidelity", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["fit-complete-role", "omit-optional-role", "switch-layout"]),
  rule("content.required-never-dropped", [DESIGN_LAYER_TYPES.CONTENT, DESIGN_LAYER_TYPES.LAYOUT], "requiredness", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT, ["switch-layout", "edit-content-requirement"]),
  rule("content.optional-loss-visible", [DESIGN_LAYER_TYPES.CONTENT, DESIGN_LAYER_TYPES.LAYOUT], "degradation", RULE_SEVERITIES.WARNING, RULE_ENFORCEMENTS.WARN, ["restore-content", "switch-layout", "approve-omission"]),
  rule("typography.minimum-readable-size", [DESIGN_LAYER_TYPES.TYPOGRAPHY], "legibility", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["use-roomier-layout", "rewrite-ai-copy", "edit-copy"]),
  rule("typography.minimum-role-gap", [DESIGN_LAYER_TYPES.TYPOGRAPHY, DESIGN_LAYER_TYPES.CONTENT], "rhythm", RULE_SEVERITIES.WARNING, RULE_ENFORCEMENTS.AUTO_REPAIR, ["restore-role-gap", "switch-layout"]),
  rule("typography.surface-contrast", [DESIGN_LAYER_TYPES.TYPOGRAPHY, DESIGN_LAYER_TYPES.BACKGROUND, DESIGN_LAYER_TYPES.MEDIA], "contrast", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["switch-approved-ink", "move-content", "use-structural-panel", "switch-layout"]),
  rule("typography.brand-register", [DESIGN_LAYER_TYPES.TYPOGRAPHY, DESIGN_LAYER_TYPES.CONTENT], "brand-style", RULE_SEVERITIES.WARNING, RULE_ENFORCEMENTS.AUTO_REPAIR, ["restore-approved-register"]),
  rule("surface.single-legibility-treatment", [DESIGN_LAYER_TYPES.BACKGROUND, DESIGN_LAYER_TYPES.MEDIA, DESIGN_LAYER_TYPES.CONTENT], "surface", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["remove-duplicate-treatment", "switch-layout"]),
  rule("surface.shape-band-exclusion", [DESIGN_LAYER_TYPES.BACKGROUND, DESIGN_LAYER_TYPES.STRUCTURAL_SHAPE, DESIGN_LAYER_TYPES.CONTENT], "collision", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["switch-approved-ink", "move-content", "remove-band", "switch-layout"]),
  rule("media.protected-subject", [DESIGN_LAYER_TYPES.MEDIA, DESIGN_LAYER_TYPES.CONTENT, DESIGN_LAYER_TYPES.BRAND_MARK], "collision", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["adjust-crop", "move-element", "switch-layout"]),
  rule("media.crop-coverage", [DESIGN_LAYER_TYPES.MEDIA, DESIGN_LAYER_TYPES.LAYOUT], "crop", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["cover-media-zone", "adjust-crop", "switch-layout"]),
  rule("layout.no-element-overlap", [DESIGN_LAYER_TYPES.LAYOUT], "collision", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["reflow-elements", "remove-optional-element", "switch-layout"]),
  // (Text Elements slice 4 — spec §4) The crowding ADVISORY: too many dynamic text
  // elements for the layout's density/whitespace budget. Advisory, never a hard cap —
  // the three ranked, executable remedies (AI simplify, drop the lowest-priority
  // element, switch to a solver-verified roomier layout) are offered, never a dead end.
  rule("layout.whitespace-budget", [DESIGN_LAYER_TYPES.LAYOUT, DESIGN_LAYER_TYPES.CONTENT], "density", RULE_SEVERITIES.ADVISORY, RULE_ENFORCEMENTS.WARN, ["simplify-copy", "remove-optional-element", "switch-layout"]),
  rule("logo.no-text-overlap", [DESIGN_LAYER_TYPES.BRAND_MARK, DESIGN_LAYER_TYPES.CONTENT], "collision", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["move-logo", "switch-logo", "switch-layout"]),
  rule("logo.no-subject-overlap", [DESIGN_LAYER_TYPES.BRAND_MARK, DESIGN_LAYER_TYPES.MEDIA], "collision", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["move-logo", "adjust-crop", "switch-layout"]),
  rule("logo.surface-contrast", [DESIGN_LAYER_TYPES.BRAND_MARK, DESIGN_LAYER_TYPES.BACKGROUND, DESIGN_LAYER_TYPES.MEDIA], "contrast", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["switch-logo", "move-logo", "switch-layout"]),
  rule("logo.intrinsic-clear-space", [DESIGN_LAYER_TYPES.BRAND_MARK], "clear-space", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["resize-logo", "move-logo"]),
  rule("shape.explicit-media-host", [DESIGN_LAYER_TYPES.STRUCTURAL_SHAPE, DESIGN_LAYER_TYPES.MEDIA], "relationship", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT, ["select-media-host", "use-layout-media-zone"]),
  rule("structural.no-seam-straddle", [DESIGN_LAYER_TYPES.STRUCTURAL_SHAPE, DESIGN_LAYER_TYPES.CONTENT, DESIGN_LAYER_TYPES.BRAND_MARK], "surface", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["move-element", "move-structural-shape", "switch-layout"]),
  rule("decoration.yields-to-meaning", [DESIGN_LAYER_TYPES.DECORATION, DESIGN_LAYER_TYPES.CONTENT, DESIGN_LAYER_TYPES.BRAND_MARK, DESIGN_LAYER_TYPES.MEDIA], "priority", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["move-decoration", "remove-decoration", "reduce-decoration"]),
  rule("decoration.approved-asset", [DESIGN_LAYER_TYPES.DECORATION], "asset-governance", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT_OR_REPAIR, ["replace-decoration", "remove-decoration"]),
  rule("decoration.density-budget", [DESIGN_LAYER_TYPES.DECORATION], "density", RULE_SEVERITIES.WARNING, RULE_ENFORCEMENTS.WARN, ["remove-decoration", "reduce-decoration"]),
  rule("decoration.occupied-area-budget", [DESIGN_LAYER_TYPES.DECORATION], "density", RULE_SEVERITIES.WARNING, RULE_ENFORCEMENTS.WARN, ["resize-decoration", "remove-decoration"]),
  rule("decoration.accent-color-budget", [DESIGN_LAYER_TYPES.DECORATION], "color", RULE_SEVERITIES.WARNING, RULE_ENFORCEMENTS.WARN, ["restore-approved-accent", "reduce-decoration"]),
  rule("validation.blocker-has-remedy", [DESIGN_LAYER_TYPES.LAYOUT], "workflow", RULE_SEVERITIES.BLOCKING, RULE_ENFORCEMENTS.PREVENT, ["direct-edit", "approved-exception"]),
]);

const RULES_BY_ID = new Map(DESIGN_RULES.map(item => [item.id, item]));

export function designRuleById(id) {
  return RULES_BY_ID.get(id) || null;
}

const LEGACY_FINDING_RULES = Object.freeze({
  "contrast-fail":"typography.surface-contrast",
  "contrast-warn":"typography.surface-contrast",
  "type-size-floor":"typography.minimum-readable-size",
  "thumb-legibility":"typography.minimum-readable-size",
  "degradation-drops":"content.optional-loss-visible",
  "copy-stump":"content.complete-or-absent",
  "italic-phrase-count":"typography.brand-register",
  "logo-overlap-text":"logo.no-text-overlap",
  "logo-focal-band":"logo.no-subject-overlap",
  "logo-legibility":"logo.surface-contrast",
  "logo-clear-space":"logo.intrinsic-clear-space",
  "media-crop-coverage":"media.crop-coverage",
  "surface-double-treatment":"surface.single-legibility-treatment",
  "surface-band-shape-conflict":"surface.shape-band-exclusion",
  "surface-pinned-color-overridden":"pin.no-silent-overwrite",
  "logo-action-band":"format.platform-occlusion",
  "safe-zone-violation":"format.platform-occlusion",
  "safe-area-text":"format.platform-occlusion",
  "safe-area-logo":"format.platform-occlusion",
  "pinned-placement":"pin.no-silent-overwrite",
  "archetype-margin-crop":"format.export-bounds",
  "archetype-box-overlap":"layout.no-element-overlap",
  "archetype-seam-straddle":"structural.no-seam-straddle",
  "archetype-degenerate-photo":"media.crop-coverage",
  "decor-overlap":"decoration.yields-to-meaning",
  "decor-focal":"decoration.yields-to-meaning",
  "decoration-unapproved-asset":"decoration.approved-asset",
  "decoration-density-budget":"decoration.density-budget",
  "decoration-area-budget":"decoration.occupied-area-budget",
  "decoration-color-budget":"decoration.accent-color-budget",
});

/** Compatibility join used while old audits migrate to direct rule IDs. */
export function designRuleIdForFinding(finding = {}) {
  if (finding.ruleId && RULES_BY_ID.has(finding.ruleId)) return finding.ruleId;
  const id = String(finding.id || "");
  if (LEGACY_FINDING_RULES[id]) return LEGACY_FINDING_RULES[id];
  if (id.includes("safe-area") || id.includes("safe-zone")) return "format.platform-occlusion";
  if (id.includes("margin-crop") || id.includes("off-canvas")) return "format.export-bounds";
  if (id.includes("logo") && id.includes("contrast")) return "logo.surface-contrast";
  if (id.includes("overlap")) return "layout.no-element-overlap";
  if (finding.category === "contrast") return "typography.surface-contrast";
  if (finding.category === "type-size") return "typography.minimum-readable-size";
  if (finding.category === "safe-zone") return "format.platform-occlusion";
  if (finding.category === "degradation") return "content.optional-loss-visible";
  return null;
}

export function isShapeRole(value) {
  return SHAPE_ROLE_SET.has(value);
}

export function isStructuralShapeRole(value) {
  return STRUCTURAL_ROLE_SET.has(value);
}

export function shapeLayerGroup(shape = {}) {
  const role = inferShapeRole(shape);
  return isStructuralShapeRole(role) ? SHAPE_LAYER_GROUPS.STRUCTURE : SHAPE_LAYER_GROUPS.DECORATION;
}

export function shapeRoleLabel(shape = {}) {
  return SHAPE_ROLE_LABELS[inferShapeRole(shape)] || "Shape";
}

export function legacyShapeModeToRenderMode(value) {
  if (value === "overlay" || value === "fill") return SHAPE_RENDER_MODES.FILL;
  if (value === "lineart" || value === "line-art") return SHAPE_RENDER_MODES.LINE_ART;
  if (value === "outline") return SHAPE_RENDER_MODES.OUTLINE;
  return SHAPE_RENDER_MODES.FRAME;
}

export function renderModeToLegacyShapeMode(value) {
  if (value === SHAPE_RENDER_MODES.FILL) return "overlay";
  if (value === SHAPE_RENDER_MODES.LINE_ART) return "lineart";
  if (value === SHAPE_RENDER_MODES.OUTLINE) return "outline";
  return "frame";
}

export function inferShapeRole(shape = {}) {
  if (isShapeRole(shape.role)) return shape.role;
  const renderMode = legacyShapeModeToRenderMode(shape.renderMode ?? shape.mode);
  if (renderMode === SHAPE_RENDER_MODES.FRAME) return SHAPE_ROLES.IMAGE_FRAME;
  if (shape.origin === "layout") return SHAPE_ROLES.STRUCTURAL_OVERLAY;
  if (shape.icon === true) return SHAPE_ROLES.ICON;
  if (shape.divider === true) return SHAPE_ROLES.DIVIDER;
  return SHAPE_ROLES.DECORATIVE_OVERLAY;
}

export function shapeOwnerForRole(role, shape = {}) {
  if (OWNER_SET.has(shape.owner)) return shape.owner;
  if (shape.origin === "layout" || isStructuralShapeRole(role)) return LAYER_OWNERS.LAYOUT;
  if (shape.motif) return LAYER_OWNERS.SYSTEM;
  if (role === SHAPE_ROLES.ICON || role === SHAPE_ROLES.DIVIDER) return LAYER_OWNERS.CONTENT;
  return LAYER_OWNERS.USER;
}

export function shapeZBand(role) {
  if (role === SHAPE_ROLES.IMAGE_FRAME || role === SHAPE_ROLES.IMAGE_MASK) return Z_BANDS.STRUCTURAL_MEDIA;
  if (role === SHAPE_ROLES.CONTENT_PANEL) return Z_BANDS.STRUCTURAL_UNDERLAY;
  if (role === SHAPE_ROLES.STRUCTURAL_OVERLAY) return Z_BANDS.STRUCTURAL_OVERLAY;
  return Z_BANDS.DECORATION;
}

/** Additive adapter: legacy renderer fields remain while semantic fields appear. */
export function normalizeShapeLayerContract(shape = {}) {
  const renderMode = RENDER_MODE_SET.has(shape.renderMode)
    ? shape.renderMode
    : legacyShapeModeToRenderMode(shape.mode);
  const role = inferShapeRole({ ...shape, renderMode });
  return {
    ...shape,
    mode:renderModeToLegacyShapeMode(renderMode),
    renderMode,
    role,
    owner:shapeOwnerForRole(role, shape),
    structural:isStructuralShapeRole(role),
    zBand:shapeZBand(role),
  };
}

export function isMediaHostShape(shape) {
  if (!shape) return false;
  const normalized = normalizeShapeLayerContract(shape);
  return (normalized.role === SHAPE_ROLES.IMAGE_FRAME || normalized.role === SHAPE_ROLES.IMAGE_MASK)
    && normalized.renderMode === SHAPE_RENDER_MODES.FRAME;
}

/** Runtime lookup: unlike migration, this never guesses intent from array order. */
export function explicitMediaHostShapeId(shapes, explicitId = null) {
  if (!explicitId) return null;
  const match = (Array.isArray(shapes) ? shapes : []).find(shape => shape?.uid === explicitId);
  return match && isMediaHostShape(match) ? match.uid : null;
}

/**
 * Explicit host wins. The final-frame fallback exists only to preserve pre-DLC
 * visual behavior while documents acquire composition.mediaHostShapeId.
 */
export function resolveMediaHostShapeId(shapes, explicitId = null) {
  const candidates = (Array.isArray(shapes) ? shapes : []).filter(isMediaHostShape);
  const validExplicitId = explicitMediaHostShapeId(candidates, explicitId);
  if (validExplicitId) return validExplicitId;
  return candidates.length ? candidates[candidates.length - 1].uid : null;
}
