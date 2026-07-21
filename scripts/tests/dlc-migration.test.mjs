/**
 * CONTRACT GUARD BATTERY — Checker B: migration fidelity & idempotency.
 *
 * This is the frozen reference for "old sessions render identically after
 * migration" (contract §20/§22). It builds representative LEGACY document
 * fixtures and asserts the normalization/migration pipeline:
 *   1. is idempotent (migrating twice == migrating once, byte-for-byte);
 *   2. seeds composition.mediaHostShapeId with the shipped "newest frame wins"
 *      selection when the explicit reference is absent;
 *   3. never touches a userTouched / pinned property;
 *   4. never produces an invalid role/mode combination;
 *   5. is stable across a serialize → parse → migrate round-trip.
 *
 * When DLC-3 retires newest-frame/array-order semantics, test (2) is updated
 * DELIBERATELY — a silent change here is a regression. See docs/design-layer-contract.md §23.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createDesignDocumentV1,
  migrateDesignDocument,
  validateDesignDocument,
  designDocumentToLegacyFields,
} from "../../lib/design-document.mjs";
import {
  createPersistedDesignPayload,
  readPersistedDesignPayload,
} from "../../lib/design-persistence.mjs";
import {
  SHAPE_ROLES,
  SHAPE_RENDER_MODES,
  isMediaHostShape,
  resolveMediaHostShapeId,
} from "../../lib/design-layer-contract.mjs";

const ROLE_SET = new Set(Object.values(SHAPE_ROLES));
const MODE_SET = new Set(Object.values(SHAPE_RENDER_MODES));
const json = v => JSON.stringify(v);

// ── Representative LEGACY fixtures (flat, pre-canonical shape) ────────────────

// A legacy photoFrame doc: the archetype cutout lived in the special media.frame
// field (pre-shape-unification), no overlay shapes, no explicit media host.
const legacyPhotoFrameDoc = () => ({
  headline: "Open house", subtext: "This Saturday", attribution: "The White Orchid", dateText: "18 July",
  postType: "photo_logo",
  photoFrame: { type: "shapeMask", assetId: "petal" },
  overlayLayers: [],
  imageSrc: "data:image/png;base64,AAAA",
});

// Layout-origin frame + a user-added frame + a fill (decorative) shape. No explicit
// mediaHostShapeId — migration must seed the newest frame.
const legacyMixedShapesDoc = () => ({
  headline: "Now enrolling", subtext: "Term 3", attribution: "WO", dateText: "September",
  postType: "photo_logo",
  overlayLayers: [
    { uid: "layout-frame", assetId: "petal", mode: "frame", origin: "layout" },
    { uid: "user-frame", assetId: "oval", mode: "frame" },
    { uid: "fill-1", assetId: "spark", mode: "overlay" },
  ],
});

// userTouched/pinned shapes + pinned text offsets + media format pins + palette pins.
const legacyPinnedDoc = () => ({
  headline: "We are hiring", subtext: "Join us", attribution: "WO", dateText: "Autumn",
  postType: "photo_logo",
  overlayLayers: [
    { uid: "pinned-frame", assetId: "petal", mode: "frame", origin: "layout", userTouched: true, master: { x: 0.12, y: 0.2 } },
    { uid: "pinned-decor", assetId: "spark", mode: "overlay", userTouched: true, master: { x: 0.7 } },
  ],
  roleOffsetsByDim: { ig_portrait: { photo_logo: { headline: { dx: 6, dy: -4 } } } },
  photoTouchedByDim: { ig_portrait: true },
  pinnedProps: { background: true, textColorId: true },
  userLogoTouched: true,
  logoPosition: "top-left",
});

// Legacy mode values that must map to canonical render modes.
const legacyModesDoc = () => ({
  headline: "Art week", subtext: "", attribution: "WO", dateText: "",
  overlayLayers: [
    { uid: "ov", assetId: "a", mode: "overlay" },
    { uid: "la", assetId: "b", mode: "lineart" },
    { uid: "ol", assetId: "c", mode: "outline" },
  ],
});

const ALL_FIXTURES = {
  legacyPhotoFrameDoc,
  legacyMixedShapesDoc,
  legacyPinnedDoc,
  legacyModesDoc,
};

test("migration: is idempotent — migrating twice equals migrating once (byte-identical)", () => {
  for (const [name, make] of Object.entries(ALL_FIXTURES)) {
    const once = createDesignDocumentV1(make());
    const twice = migrateDesignDocument(once);
    const thrice = migrateDesignDocument(twice);
    assert.equal(json(twice), json(once), `${name}: migrate(create) drifted from create`);
    assert.equal(json(thrice), json(twice), `${name}: second migration was not a no-op`);
  }
});

test("migration: seeds mediaHostShapeId with the shipped newest-frame-wins selection", () => {
  const doc = createDesignDocumentV1(legacyMixedShapesDoc());
  // Verified against the actual codebase logic, not assumed: resolveMediaHostShapeId
  // returns the LAST media-host candidate in array order. Both frames qualify; the
  // fill does not. Newest frame ("user-frame") wins.
  const expected = resolveMediaHostShapeId(doc.shapes, null);
  assert.equal(expected, "user-frame");
  assert.equal(doc.composition.mediaHostShapeId, "user-frame");
  // The seeded host is a real image-frame shape and passes document validation.
  const host = doc.shapes.find(s => s.uid === doc.composition.mediaHostShapeId);
  assert.ok(isMediaHostShape(host));
  assert.equal(validateDesignDocument(doc).valid, true);

  // An explicit host reference is honored over the newest-frame fallback.
  const withExplicit = createDesignDocumentV1({ ...legacyMixedShapesDoc(), mediaHostShapeId: "layout-frame" });
  assert.equal(withExplicit.composition.mediaHostShapeId, "layout-frame");
});

test("migration: userTouched / pinned properties survive normalization unchanged", () => {
  const doc = createDesignDocumentV1(legacyPinnedDoc());
  const frame = doc.shapes.find(s => s.uid === "pinned-frame");
  const decor = doc.shapes.find(s => s.uid === "pinned-decor");
  // Shape-level pins.
  assert.equal(frame.userTouched, true);
  assert.deepEqual(frame.master, { x: 0.12, y: 0.2 });
  assert.equal(decor.userTouched, true);
  assert.deepEqual(decor.master, { x: 0.7 });
  // Pinned text offsets.
  assert.deepEqual(doc.typography.roleOffsetsByFormat.ig_portrait.photo_logo.headline, { dx: 6, dy: -4 });
  // Media format pin + palette pins + logo pin.
  assert.equal(doc.media.formatPins.ig_portrait, true);
  assert.deepEqual(doc.palette.pins, { background: true, textColorId: true });
  assert.equal(doc.logo.placementPinned, true);
  assert.equal(doc.logo.masterPlacement.position, "top-left");
  // And they survive a second migration untouched.
  const again = migrateDesignDocument(doc);
  assert.equal(json(again.shapes), json(doc.shapes));
  assert.equal(json(again.typography), json(doc.typography));
  assert.equal(json(again.palette.pins), json(doc.palette.pins));
});

test("migration: never produces an invalid role/mode combination", () => {
  for (const [name, make] of Object.entries(ALL_FIXTURES)) {
    const doc = createDesignDocumentV1(make());
    for (const shape of doc.shapes) {
      assert.ok(ROLE_SET.has(shape.role), `${name}/${shape.uid}: role not in enum: ${shape.role}`);
      assert.ok(MODE_SET.has(shape.renderMode), `${name}/${shape.uid}: renderMode not in enum: ${shape.renderMode}`);
      // A media host must be painted in frame mode. A non-frame render mode may
      // never be silently treated as the media host.
      if (isMediaHostShape(shape)) {
        assert.equal(shape.renderMode, SHAPE_RENDER_MODES.FRAME, `${name}/${shape.uid}: media host not frame-mode`);
      }
    }
    // The document's declared host, if any, must reference a valid media-host shape.
    assert.equal(validateDesignDocument(doc).valid, true, `${name}: document invalid after migration`);
  }
});

test("migration: legacy mode values map to canonical render modes and keep the legacy wire value", () => {
  const doc = createDesignDocumentV1(legacyModesDoc());
  const byId = Object.fromEntries(doc.shapes.map(s => [s.uid, s]));
  assert.equal(byId.ov.renderMode, SHAPE_RENDER_MODES.FILL);
  assert.equal(byId.ov.mode, "overlay");            // legacy wire value preserved for the renderer
  assert.equal(byId.ov.role, SHAPE_ROLES.DECORATIVE_OVERLAY);
  assert.equal(byId.la.renderMode, SHAPE_RENDER_MODES.LINE_ART);
  assert.equal(byId.la.mode, "lineart");
  assert.equal(byId.ol.renderMode, SHAPE_RENDER_MODES.OUTLINE);
  assert.equal(byId.ol.mode, "outline");
});

test("migration: serialize → parse → migrate is a stable round-trip", () => {
  for (const [name, make] of Object.entries(ALL_FIXTURES)) {
    const doc = createDesignDocumentV1(make());
    const roundTrip = migrateDesignDocument(JSON.parse(JSON.stringify(doc)));
    assert.equal(json(roundTrip), json(doc), `${name}: JSON round-trip drifted`);
  }
});

test("migration: persistence layer read is idempotent and preserves pins", () => {
  // The full shipped persistence path (createPersistedDesignPayload →
  // readPersistedDesignPayload) is the real load path for sessions and templates.
  const doc = createDesignDocumentV1(legacyPinnedDoc());
  const payload = createPersistedDesignPayload(doc, { dimensionId: "ig_portrait" });
  const first = readPersistedDesignPayload(payload);
  const rewrapped = createPersistedDesignPayload(first.document, first.metadata, first.acknowledgements);
  const second = readPersistedDesignPayload(rewrapped);
  assert.equal(json(second.document), json(first.document), "persistence read/write not idempotent");
  // Pins survive the persistence path.
  const frame = first.document.shapes.find(s => s.uid === "pinned-frame");
  assert.equal(frame.userTouched, true);
  assert.equal(first.document.media.formatPins.ig_portrait, true);
  // Legacy flat-field projection still round-trips into a valid canonical document
  // (old deployed clients read the flat view).
  const viaLegacy = createDesignDocumentV1(designDocumentToLegacyFields(first.document));
  assert.equal(validateDesignDocument(viaLegacy).valid, true);
});
