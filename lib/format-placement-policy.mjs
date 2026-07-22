import { resolveInheritedValue } from "./format-inheritance.mjs";

export function resolveTextSafeMargins(baseSafe, platformSafe = null) {
  if (!platformSafe) return { ...baseSafe };
  return {
    t: Math.max(baseSafe.t, platformSafe.top || 0),
    b: Math.max(baseSafe.b, platformSafe.bottom || 0),
    l: Math.max(baseSafe.l, platformSafe.left || 0),
    r: Math.max(baseSafe.r, platformSafe.right || 0),
  };
}

export function clampNormalizedRoleBox(box, { width, height, safe }) {
  if (!box) return null;
  const normalizedWidth = Math.max(0.05, Math.min(box.w ?? 0.8, 1 - safe.l - safe.r));
  const normalizedHeight = Math.max(0.03, Math.min(box.h ?? 0.2, 1 - safe.t - safe.b));
  const x = Math.max(safe.l, Math.min(1 - safe.r - normalizedWidth, box.x ?? safe.l));
  const y = Math.max(safe.t, Math.min(1 - safe.b - normalizedHeight, box.y ?? safe.t));
  return {
    x: x * width,
    y: y * height,
    w: normalizedWidth * width,
    h: normalizedHeight * height,
  };
}

export function projectBleedBox(box, { width, height, edgeTolerance = 0.015 }) {
  if (!box) return null;
  let x0 = box.x ?? 0;
  let y0 = box.y ?? 0;
  let x1 = x0 + (box.w ?? 0);
  let y1 = y0 + (box.h ?? 0);
  if (x0 <= edgeTolerance) x0 = 0;
  if (x1 >= 1 - edgeTolerance) x1 = 1;
  if (y0 <= edgeTolerance) y0 = 0;
  if (y1 >= 1 - edgeTolerance) y1 = 1;
  return {
    x: x0 * width,
    y: y0 * height,
    w: (x1 - x0) * width,
    h: (y1 - y0) * height,
  };
}

/** Resolve role drags from the master format or a format-specific override. */
export function resolveRoleOffsetsForFormat({
  formatId,
  postType,
  offsetsByFormat,
  masterFormatId,
}) {
  const master = offsetsByFormat?.[masterFormatId]?.[postType] || {};
  const byFormat = Object.fromEntries(
    Object.entries(offsetsByFormat || {}).flatMap(([id, posts]) =>
      id !== masterFormatId && posts?.[postType] ? [[id, posts[postType]]] : [],
    ),
  );
  return resolveInheritedValue(
    { master, byFormat },
    formatId,
    masterFormatId,
    value => value,
  ).value || {};
}

/**
 * Resolve the semantic logo anchor before collision/contrast relocation.
 * Only an explicit override for this format, or a user-pinned master placement
 * on the master format, is protected from automatic relocation.
 */
export function resolveLogoPlacementBase({
  formatId,
  postType,
  masterFormatId,
  masterPinned,
  placementsByFormat,
  masterPosition,
  masterSizeId,
  masterFree = null,
  defaultPlacementForFormat,
}) {
  const defaultMaster = defaultPlacementForFormat(masterFormatId, postType);
  const master = masterPinned
    ? { position:masterPosition, sizeId:masterSizeId, free:masterFree || null }
    : { position:defaultMaster.position, sizeId:defaultMaster.sizeId, free:null };
  const resolved = resolveInheritedValue(
    { master, byFormat:placementsByFormat || {} },
    formatId,
    masterFormatId,
    (_base, id) => {
      const placement = defaultPlacementForFormat(id, postType);
      return { position:placement.position, sizeId:placement.sizeId, free:null };
    },
  );

  return {
    ...resolved.value,
    free:resolved.value?.free || null,
    explicit:resolved.source === "override" || (resolved.source === "master" && masterPinned),
  };
}
