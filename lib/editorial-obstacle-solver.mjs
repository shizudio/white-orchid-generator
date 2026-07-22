const intersects = (a, b) => Boolean(
  a && b
  && a.x < b.x + b.w
  && a.x + a.w > b.x
  && a.y < b.y + b.h
  && a.y + a.h > b.y
);

/**
 * Creates the collision-policy portion of the editorial layout solver.
 *
 * The canvas renderer supplies measured boxes; this module owns the deterministic
 * decision about whether a text role composes with, flows around, or moves clear of
 * photo seams and decorative shapes. It intentionally performs no canvas work.
 */
export function createEditorialObstacleSolver({
  width,
  height,
  safe,
  photoObstacle = null,
  decorationObstacles = [],
  seamTolerance,
  gap,
}) {
  const w = width;
  const h = height;
  const safeTop = safe.t * h;
  const safeBottom = (1 - safe.b) * h;
  const safeLeft = safe.l * w;
  const safeRight = (1 - safe.r) * w;
  const gapPx = gap ?? Math.min(w, h) * 0.02;
  const seamTol = seamTolerance ?? Math.min(w, h) * 0.02;
  const safeWidth = (1 - safe.l - safe.r) * w;
  const photoIsBand = Boolean(photoObstacle && photoObstacle.w >= 0.8 * safeWidth);
  const photoSeam = photoObstacle
    ? {
        x: photoObstacle.x - seamTol,
        y: photoObstacle.y - seamTol,
        w: photoObstacle.w + seamTol * 2,
        h: photoObstacle.h + seamTol * 2,
      }
    : null;
  const decorations = Array.isArray(decorationObstacles)
    ? decorationObstacles.filter((item) => item?.box)
    : [];

  function constrainToPhoto(box) {
    if (!box || !photoSeam || !intersects(box, photoSeam)) return box;

    if (photoIsBand) {
      const above = photoSeam.y - safeTop;
      const below = safeBottom - (photoSeam.y + photoSeam.h);
      const boxCenterY = box.y + box.h / 2;
      const minimumStrip = 0.05 * h + gapPx;
      const nearerIsAbove = boxCenterY < photoObstacle.y + photoObstacle.h / 2;
      const useAbove = nearerIsAbove
        ? above >= minimumStrip || above >= below
        : !(below >= minimumStrip) && above >= below;

      if (useAbove) {
        const bottom = photoSeam.y - gapPx;
        const y = Math.max(safeTop, Math.min(box.y, bottom - 0.05 * h));
        return { ...box, y, h: Math.max(0.05 * h, Math.min(box.h, bottom - y)) };
      }

      const top = photoSeam.y + photoSeam.h + gapPx;
      const y = Math.max(top, box.y);
      return { ...box, y, h: Math.max(0.05 * h, safeBottom - y) };
    }

    const leftWidth = Math.max(0, photoSeam.x - box.x);
    const rightWidth = Math.max(0, box.x + box.w - (photoSeam.x + photoSeam.w));
    const nearerIsLeft = box.x + box.w / 2 < photoObstacle.x + photoObstacle.w / 2;
    if (nearerIsLeft && leftWidth > 0.18 * w) {
      return { ...box, w: Math.min(box.w, photoSeam.x - box.x - gapPx) };
    }
    if (!nearerIsLeft && rightWidth > 0.18 * w) {
      const x = photoSeam.x + photoSeam.w + gapPx;
      return { ...box, x, w: box.x + box.w - x };
    }
    if (leftWidth >= rightWidth && leftWidth > 0.18 * w) {
      return { ...box, w: Math.min(box.w, photoSeam.x - box.x - gapPx) };
    }
    if (rightWidth > 0.18 * w) {
      const x = photoSeam.x + photoSeam.w + gapPx;
      return { ...box, x, w: box.x + box.w - x };
    }
    return box;
  }

  function resolveDecorations(box) {
    if (!box || !decorations.length) return box;
    let resolved = box;
    for (const decoration of decorations) {
      const inflated = {
        x: decoration.box.x - seamTol,
        y: decoration.box.y - seamTol,
        w: decoration.box.w + seamTol * 2,
        h: decoration.box.h + seamTol * 2,
      };
      if (!intersects(resolved, inflated)) continue;

      const padding = 0.06 * Math.min(decoration.box.w, decoration.box.h);
      if (
        decoration.canCompose
        && resolved.w <= decoration.box.w - padding * 2
        && resolved.h <= decoration.box.h - padding * 2
      ) {
        const x = Math.max(safeLeft, Math.min(
          safeRight - resolved.w,
          decoration.box.x + (decoration.box.w - resolved.w) / 2,
        ));
        const y = Math.max(safeTop, Math.min(
          safeBottom - resolved.h,
          decoration.box.y + (decoration.box.h - resolved.h) / 2,
        ));
        if (
          x >= decoration.box.x + padding
          && x + resolved.w <= decoration.box.x + decoration.box.w - padding
          && y >= decoration.box.y + padding
          && y + resolved.h <= decoration.box.y + decoration.box.h - padding
          && x >= safeLeft
          && y >= safeTop
          && x + resolved.w <= safeRight
          && y + resolved.h <= safeBottom
        ) {
          resolved = { ...resolved, x, y, composedOnShape: true };
          continue;
        }
      }

      const leftWidth = inflated.x - resolved.x;
      const rightWidth = resolved.x + resolved.w - (inflated.x + inflated.w);
      const nearerIsLeft = resolved.x + resolved.w / 2 < decoration.box.x + decoration.box.w / 2;
      if (nearerIsLeft && leftWidth > 0.18 * w) {
        resolved = { ...resolved, w: Math.min(resolved.w, inflated.x - resolved.x - gapPx) };
        continue;
      }
      if (!nearerIsLeft && rightWidth > 0.18 * w) {
        const x = inflated.x + inflated.w + gapPx;
        resolved = { ...resolved, x, w: resolved.x + resolved.w - x };
        continue;
      }

      const above = inflated.y - safeTop;
      const below = safeBottom - (inflated.y + inflated.h);
      const nearerIsAbove = resolved.y + resolved.h / 2 < decoration.box.y + decoration.box.h / 2;
      const minimumStrip = 0.04 * h;
      const moveAbove = nearerIsAbove
        ? above >= minimumStrip || above >= below
        : !(below >= minimumStrip) && above >= below;
      if (moveAbove) {
        const bottom = inflated.y - gapPx;
        const y = Math.max(safeTop, Math.min(resolved.y, bottom - Math.min(resolved.h, minimumStrip)));
        resolved = { ...resolved, y, h: Math.max(minimumStrip, Math.min(resolved.h, bottom - y)) };
      } else {
        const top = inflated.y + inflated.h + gapPx;
        const y = Math.min(Math.max(top, resolved.y), safeBottom - minimumStrip);
        resolved = { ...resolved, y, h: Math.max(minimumStrip, Math.min(resolved.h, safeBottom - y)) };
      }
    }
    return resolved;
  }

  return {
    constrainToPhoto,
    resolveDecorations,
    photoIsBand,
    gapPx,
    photoSeam,
  };
}

