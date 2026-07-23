import { createEditorialObstacleSolver } from "./editorial-obstacle-solver.mjs";
import {
  fitEditorialHeadline,
  reserveHeadlineSupportSpace,
  resolveEditorialRoleRhythm,
} from "./editorial-typography-solver.mjs";

/**
 * Canonical editorial layout-solver boundary.
 *
 * The caller provides canvas-backed measurement adapters. This module resolves all
 * role geometry and typography policy and returns paint-ready boxes and sizes.
 */
export function solveEditorialLayout(context, input, measurements) {
  const {
    w,
    h,
    S,
    sm,
    register,
    caps,
    heroText,
    supportText,
    heroCapFrac,
    heroToSupport,
    cardBox,
    maskBox,
    photoRegion,
  } = input;
  const heroMultiplier = input.heroMult || 1;
  const supportMultiplier = input.supMult || 1;
  let heroBox = input.heroBox ? { ...input.heroBox } : null;
  let supportBox = input.supBox ? { ...input.supBox } : null;
  let labelBox = input.labelBox ? { ...input.labelBox } : null;
  const flooredRoles = [];
  const photoObstacle = cardBox || maskBox || photoRegion || null;
  const obstacleSolver = createEditorialObstacleSolver({
    width: w,
    height: h,
    safe: sm,
    photoObstacle,
    decorationObstacles: input.decorObstacles,
  });

  if (heroBox) heroBox = obstacleSolver.constrainToPhoto(heroBox);
  if (heroBox) heroBox = obstacleSolver.resolveDecorations(heroBox);
  if (labelBox) labelBox = obstacleSolver.constrainToPhoto(labelBox);
  if (labelBox) labelBox = obstacleSolver.resolveDecorations(labelBox);

  const minimumSupportHeight = supportText
    ? measurements.minimumFloor("body", h, 0.02 * h, 24 * S) * 1.3
    : 0;
  heroBox = reserveHeadlineSupportSpace({
    height: h,
    safe: sm,
    headlineBox: heroBox,
    supportBox,
    supportText,
    minimumSupportHeight,
    photoObstacle,
    obstacleSolver,
  });

  const headline = fitEditorialHeadline({
    context,
    text: heroText,
    register,
    caps,
    box: heroBox,
    canvasHeight: h,
    scale: S,
    capFraction: heroCapFrac,
    sizeMultiplier: heroMultiplier,
    widthTarget: input.heroWidthTarget,
    minimumFloor: measurements.minimumFloor,
    stripMarkers: measurements.stripMarkers,
    parseWords: measurements.parseWords,
    fontFor: measurements.fontFor,
    measureLines: measurements.measureLines,
    wrapLines: measurements.wrapLines,
  });
  if (headline.hitFloor) flooredRoles.push({ label: "Headline" });

  const rhythm = resolveEditorialRoleRhythm({
    height: h,
    safe: sm,
    scale: S,
    heroBox,
    supportBox,
    labelBox,
    heroSize: headline.size,
    heroLineHeight: headline.lineHeight,
    heroUsedHeight: headline.usedHeight,
    heroToSupport,
    supportSizeMultiplier: supportMultiplier,
    minimumFloor: measurements.minimumFloor,
    bodyFloor: measurements.bodyFloor,
    obstacleSolver,
  });
  supportBox = rhythm.supportBox;
  labelBox = rhythm.labelBox;
  flooredRoles.push(...rhythm.flooredRoles);

  return {
    heroBox,
    supBox: supportBox,
    labelBox,
    heroStart: headline.targetSize,
    heroMin: headline.minimumSize,
    heroPx: headline.size,
    // (type-scale / M2) the natural (1x) fill and whether the S/M/L step was capacity-capped,
    // so the caller can surface an honest hero effective step ("L fits as M here").
    heroNaturalPx: headline.naturalSize,
    heroSizeMultiplier: headline.sizeMultiplier,
    heroSizeCapped: !!headline.sizeCapped,
    labelSize: rhythm.labelSize,
    supStart: rhythm.supportStart,
    supMin: rhythm.supportMinimum,
    flooredRoles,
    bodyAtFloor: rhythm.bodyAtFloor,
  };
}

