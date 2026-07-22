/**
 * Resolves the complete-or-absent caption contract from a measured text fit.
 * Painters consume this plan; they never choose a different line subset themselves.
 */
export function planCompleteSupportPlacement({
  fit,
  box,
  floor,
  canvasHeight,
  heroBottom = null,
  maximumLines = 3,
  allowLift = true,
}) {
  if (!fit || !box || !Array.isArray(fit.lines)) return null;
  let roomLines = Math.max(
    1,
    Math.floor((floor - box.y - fit.size * 0.28) / fit.lineHeight),
  );
  const lineBottomAt = (y, count) => (
    y + fit.size + (count - 1) * fit.lineHeight + fit.size * 0.28
  );
  while (roomLines > 1 && lineBottomAt(box.y, roomLines) > floor) roomLines -= 1;

  let y = box.y;
  if (allowLift && lineBottomAt(y, roomLines) > floor) {
    const overflow = lineBottomAt(y, roomLines) - floor;
    y = Math.max(heroBottom ?? -Infinity, box.y - overflow);
  }
  const bottom = lineBottomAt(y, roomLines);
  const lineLimit = Math.min(maximumLines, roomLines);
  const willDraw = bottom <= floor + 0.005 * canvasHeight
    && fit.lines.length <= lineLimit;
  return {
    y,
    bottom,
    roomLines,
    lineLimit,
    willDraw,
    lines: willDraw ? fit.lines : [],
    usedHeight: willDraw
      ? Math.max(fit.size, fit.lines.length * fit.lineHeight)
      : 0,
  };
}

