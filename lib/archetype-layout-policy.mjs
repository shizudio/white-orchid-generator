export function archetypeFormatClass(dimensionId) {
  if (dimensionId === "ig_square") return "square";
  if (dimensionId === "ig_portrait") return "portrait";
  if (dimensionId === "story") return "story";
  if (dimensionId === "banner") return "banner";
  if (dimensionId === "twitter" || dimensionId === "facebook") return "wide";
  return "square";
}

export function resolveArchetypeElements(archetype, dimensionId) {
  const base = archetype?.elements || {};
  const overrides = archetype?.perDim || {};
  const formatOverride = overrides[dimensionId]
    || overrides[archetypeFormatClass(dimensionId)]
    || null;
  const result = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, { ...value }]),
  );
  if (formatOverride) {
    for (const [key, value] of Object.entries(formatOverride)) {
      result[key] = { ...(result[key] || {}), ...value };
    }
  }
  return result;
}

// (client ruling 2026-07-27, element-placement-spec §7d) A TEXT-ONLY archetype
// carries NO media model at all: no photo column, no mask window, no floated
// card, and it is not full-bleed. Derived from the archetype's own geometry —
// the same honesty rule as isEditorialSplitArchetype (§7b) — so a new text
// field archetype is covered automatically. A photo added onto such a layout
// has nowhere to paint; §7d auto-switches the base to a photo-capable layout.
export function isTextOnlyArchetype(archetype) {
  if (!archetype || archetype.fullBleed) return false;
  const elements = archetype.elements || {};
  return !elements.photo && !elements.mask && !elements.card;
}

export function resolveArchetypeVariant(archetype, variantIndex = 0) {
  const variants = Array.isArray(archetype?.variants) && archetype.variants.length
    ? archetype.variants
    : null;
  const base = archetype?.palette || {
    bg: "whiteSmoke",
    ink: "burnham",
    accent: "softTangerine",
    klass: "light",
  };
  if (!variants) {
    return {
      bg: base.bg,
      ink: base.ink,
      accentUse: base.accent,
      klass: base.klass || "light",
    };
  }
  const normalizedIndex = ((variantIndex % variants.length) + variants.length) % variants.length;
  const variant = variants[normalizedIndex];
  return {
    bg: variant.bg,
    ink: variant.ink,
    accentUse: variant.accentUse,
    klass: variant.klass || "light",
    motifPastels: variant.motifPastels,
    logoUse: variant.logoUse,
    shapeId: variant.shapeId,
  };
}

/** Turns archetype specification data into renderer-independent editable intent. */
export function materializeArchetypeLayout(archetype, dimensionId, variantIndex = 0) {
  const elements = resolveArchetypeElements(archetype, dimensionId);
  const asRole = (box) => box
    ? { x: box.x, y: box.y, w: box.w, h: box.h, align: box.align || "left" }
    : null;
  const variant = resolveArchetypeVariant(archetype, variantIndex);
  let photoFrame = { type: "none" };
  if (archetype.special === "floatedCard" && elements.card) {
    photoFrame = {
      type: "card",
      box: asRole(elements.card),
      radiusFrac: archetype.cardRadiusFrac || 0.06,
      rotationDeg: 0,
    };
  } else if (archetype.special === "petalWindow" && elements.mask) {
    photoFrame = {
      type: "petalMask",
      box: asRole(elements.mask),
      areaFrac: archetype.maskAreaFrac || 0.30,
      centroid: {
        x: elements.mask.x + elements.mask.w / 2,
        y: elements.mask.y + elements.mask.h / 2,
      },
    };
  } else if (archetype.special === "shapeCutout" && elements.mask) {
    photoFrame = {
      type: "shapeMask",
      box: asRole(elements.mask),
      shapeId: variant.shapeId || "shape-1",
    };
  }

  return {
    roles: {
      hero: asRole(elements.hero),
      support: asRole(elements.support),
      microLabel: asRole(elements.microLabel),
    },
    photoRegion: asRole(elements.photo),
    register: archetype.heroRegister === "heavySans" ? "heavySans" : "serif",
    caps: Boolean(archetype.caps || archetype.usesDateAsHero),
    usesDateAsHero: Boolean(archetype.usesDateAsHero),
    photoTreatment: archetype.photoTreatment || "none",
    photoFrame,
    split: archetype.split || null,
    sideFrac: archetype.split || null,
    motif: archetype.special === "motifField"
      ? {
          count: archetype.motifCount || 3,
          pastels: variant.motifPastels || archetype.motifPastels || ["sage", "butter"],
        }
      : null,
    furniture: Array.isArray(archetype.furniture) ? archetype.furniture : null,
    cropDrama: typeof archetype.cropDrama === "number" ? archetype.cropDrama : null,
    fullBleed: Boolean(archetype.fullBleed),
    thinBorder: Boolean(archetype.thinBorder),
    heroCapFrac: archetype.scaleRatio?.heroCapFrac || 0.3,
    heroToSupport: archetype.scaleRatio?.heroToSupport || 8,
    leading: archetype.heroRegister === "heavySans" ? 1.05 : 1.02,
    leadingBody: archetype.leadingBody || 1.32,
    heroLeading: archetype.heroLeading || null,
    heroTracking: archetype.heroTracking || null,
    logoSizeId: archetype.elements?.logo?.sizeId || null,
    logoPos: archetype.elements?.logo?.position || null,
    whitespace: typeof archetype.whitespace === "number" ? archetype.whitespace : null,
    centerExclude: Boolean(archetype.centerExclude),
    gridAnchor: archetype.gridAnchor || "edge",
    palette: {
      klass: variant.klass,
      bg: variant.bg,
      ink: variant.ink,
      accent: variant.accentUse || archetype.palette?.accent || "softTangerine",
    },
    logoUse: variant.logoUse || archetype.logoUse || "url",
    supportRegister: archetype.supportRegister || null,
    special: archetype.special || null,
    variantIdx: variantIndex || 0,
    variantCount: archetype.variants?.length || 1,
  };
}

