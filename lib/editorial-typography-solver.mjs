/**
 * Fits an editorial headline into an already-resolved layout box.
 *
 * Canvas remains a measurement adapter only. Line construction, readable floors,
 * width-fill intent, orphan repair and complete-or-absent shrinking are owned here
 * so painters cannot invent their own typography placement policy.
 */
export function fitEditorialHeadline({
  context,
  text,
  register,
  caps,
  box,
  canvasHeight,
  scale,
  capFraction,
  sizeMultiplier = 1,
  widthTarget = 0,
  minimumFloor,
  stripMarkers,
  parseWords,
  fontFor,
  measureLines,
  wrapLines,
}) {
  const h = canvasHeight;
  // (type-scale) The fit below runs at the NATURAL size (1x). Baking the S/M/L multiplier
  // into targetSize here is what made the step a no-op: an oversized target always shrinks
  // back to the same box-capacity fill, so S, M and L all painted identically. Instead we
  // find the natural box-fill (== the M render, byte-identical) and apply the step to that
  // RESULT below — S shrinks below the fill, L grows only as far as the box allows.
  let targetSize = Math.max(24, (capFraction || 0.3) * h * 1.35);
  const minimumSize = minimumFloor("headline", h, targetSize, 38 * scale);
  let size = minimumSize;
  let lineHeight = 0;
  let usedHeight = 0;
  let hitFloor = false;

  if (!text || !box) {
    return {
      targetSize: Math.max(targetSize, minimumSize),
      minimumSize,
      size,
      lineHeight,
      usedHeight,
      hitFloor,
    };
  }

  const words = caps
    ? stripMarkers(text).toUpperCase().split(/\s+/).filter(Boolean).map((word) => ({
        text: word,
        italic: false,
        space: true,
      }))
    : parseWords(text);
  const lineRatio = register === "serif" ? 1.02 : 1.05;
  const widestWordFits = (candidateSize) => words.every((word) => {
    context.font = fontFor(register, candidateSize, word.italic);
    return context.measureText(word.text).width <= box.w;
  });

  let candidate = Math.max(targetSize, minimumSize);
  if (widthTarget && words.length && box.w > 0) {
    let oneLineWidth = 0;
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      context.font = fontFor(register, 100, word.italic);
      oneLineWidth += context.measureText(word.text).width;
      if (index < words.length - 1 && word.space !== false) {
        oneLineWidth += context.measureText(" ").width;
      }
    }
    if (oneLineWidth > 0) {
      const sizeForWidth = 100 * (widthTarget * box.w) / oneLineWidth;
      candidate = Math.max(candidate, Math.min(sizeForWidth, 0.42 * h));
    }
  }

  while (candidate >= minimumSize) {
    const fit = measureLines(context, words, register, candidate, box.w);
    if (fit.lineCount * candidate * lineRatio <= box.h && widestWordFits(candidate)) {
      size = candidate;
      lineHeight = candidate * lineRatio;
      usedHeight = fit.lineCount * lineHeight;
      break;
    }
    candidate -= 2;
  }

  if (size >= minimumSize && words.length >= 3) {
    const orphanScore = (candidateSize) => {
      const wrapped = wrapLines(context, words, register, candidateSize, box.w);
      const widest = Math.max(...wrapped.widths, 1);
      return {
        fraction: Math.min(...wrapped.widths) / widest,
        lines: wrapped.lineCount,
      };
    };
    const current = orphanScore(size);
    if (current.fraction < 0.35) {
      const lowerBound = Math.max(minimumSize, Math.floor(size * 0.84));
      for (let repaired = size - 2; repaired >= lowerBound; repaired -= 2) {
        const score = orphanScore(repaired);
        if (
          score.lines <= current.lines
          && score.fraction >= 0.35
          && repaired * score.lines * lineRatio <= box.h
          && widestWordFits(repaired)
        ) {
          size = repaired;
          lineHeight = repaired * lineRatio;
          usedHeight = score.lines * lineHeight;
          break;
        }
      }
    }
  }

  if (candidate < minimumSize) {
    hitFloor = true;
    const hardFloor = Math.max(14, 0.02 * h);
    candidate = minimumSize;
    while (candidate > hardFloor) {
      if (widestWordFits(candidate)) {
        const fit = measureLines(context, words, register, candidate, box.w);
        if (fit.lineCount * candidate * lineRatio <= box.h) break;
      }
      candidate -= 2;
    }
    size = candidate;
    lineHeight = candidate * lineRatio;
    const fit = measureLines(context, words, register, candidate, box.w);
    usedHeight = fit.lineCount * lineHeight;
  }

  if (lineHeight > 0 && usedHeight > box.h) {
    usedHeight = Math.max(1, Math.floor(box.h / lineHeight)) * lineHeight;
  }

  // (type-scale / M2 honesty) Apply the S/M/L step to the NATURAL fill just measured.
  //   mult == 1 (M)  → untouched: byte-identical to the pre-type-scale render (fixtures).
  //   mult  < 1 (S)  → shrink below the fill (never below the readable floor), the
  //                    distinction the fit-loop used to erase.
  //   mult  > 1 (L)  → grow only as far as the box still holds the copy; if it cannot,
  //                    stay at the fill and report capped (honest — no silent no-op).
  const naturalSize = size;
  let requestedSize = naturalSize * sizeMultiplier;
  let sizeCapped = false;
  if (naturalSize > 0 && sizeMultiplier < 1) {
    size = Math.max(minimumSize, requestedSize);
    sizeCapped = size > requestedSize + 0.5;   // floor stopped the shrink
    lineHeight = size * lineRatio;
    usedHeight = measureLines(context, words, register, size, box.w).lineCount * lineHeight;
  } else if (naturalSize > 0 && sizeMultiplier > 1) {
    let grown = naturalSize;
    for (let candidateUp = Math.floor(requestedSize); candidateUp > naturalSize; candidateUp -= 2) {
      const fit = measureLines(context, words, register, candidateUp, box.w);
      const widthOk = words.every((word) => {
        context.font = fontFor(register, candidateUp, word.italic);
        return context.measureText(word.text).width <= box.w;
      });
      if (widthOk && fit.lineCount * candidateUp * lineRatio <= box.h) { grown = candidateUp; break; }
    }
    size = grown;
    sizeCapped = grown < requestedSize - 0.5;   // box stopped the growth (L fits as M/less)
    lineHeight = size * lineRatio;
    usedHeight = measureLines(context, words, register, size, box.w).lineCount * lineHeight;
    if (usedHeight > box.h) usedHeight = Math.max(1, Math.floor(box.h / lineHeight)) * lineHeight;
  }

  return {
    targetSize: Math.max(requestedSize, minimumSize),
    minimumSize,
    size,
    naturalSize,
    sizeMultiplier,
    sizeCapped,
    lineHeight,
    usedHeight,
    hitFloor,
  };
}

/** Reserves one readable support line before headline fitting consumes the zone. */
export function reserveHeadlineSupportSpace({
  height,
  safe,
  headlineBox,
  supportBox,
  supportText,
  minimumSupportHeight,
  photoObstacle,
  obstacleSolver,
}) {
  if (!headlineBox || !supportText || !supportBox) return headlineBox;
  const h = height;
  let effectiveBottom = (1 - safe.b) * h;
  if (
    obstacleSolver?.photoIsBand
    && photoObstacle
    && photoObstacle.y > headlineBox.y
  ) {
    effectiveBottom = Math.min(
      effectiveBottom,
      photoObstacle.y - (obstacleSolver.gapPx || 0),
    );
  }
  const prefitGap = Math.max(h * 0.03, 0.05 * h);
  const bottomCap = effectiveBottom - minimumSupportHeight - prefitGap;
  if (headlineBox.y + headlineBox.h <= bottomCap) return headlineBox;
  return {
    ...headlineBox,
    h: Math.max(0.06 * h, bottomCap - headlineBox.y),
  };
}

/** Resolves the editorial reading rhythm after the headline has been measured. */
export function resolveEditorialRoleRhythm({
  height,
  safe,
  scale,
  heroBox,
  supportBox,
  labelBox,
  heroSize,
  heroLineHeight,
  heroUsedHeight,
  heroToSupport,
  supportText,
  supportSizeMultiplier = 1,
  minimumFloor,
  bodyFloor,
  obstacleSolver,
}) {
  const h = height;
  const safeTop = safe.t * h;
  const safeBottom = (1 - safe.b) * h;
  const clampY = (y) => Math.max(safeTop, Math.min(safeBottom, y));
  const intersects = (a, b) => Boolean(
    a && b
    && a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y
  );
  const constrainToPhoto = obstacleSolver?.constrainToPhoto || ((box) => box);
  const resolveDecorations = obstacleSolver?.resolveDecorations || ((box) => box);
  const flooredRoles = [];
  const heroBottom = heroBox ? heroBox.y + Math.max(heroUsedHeight, 0) : safeTop;
  const rhythmGap = Math.max(0.35 * (heroLineHeight || heroSize * 1.02), 24 * (h / 1080));

  let resolvedLabel = labelBox;
  let labelSize = resolvedLabel
    ? Math.max(minimumFloor("body", h, resolvedLabel.h, 20 * scale), 0.022 * h)
    : 0;
  if (resolvedLabel) {
    labelSize = Math.min(labelSize, resolvedLabel.h);
    const measuredLabel = {
      x: resolvedLabel.x,
      y: resolvedLabel.y,
      w: resolvedLabel.w,
      h: labelSize * 1.4,
    };
    if (
      heroBox
      && intersects(measuredLabel, {
        x: heroBox.x,
        y: heroBox.y,
        w: heroBox.w,
        h: Math.max(heroUsedHeight, heroBox.h * 0.3),
      })
    ) {
      const above = heroBox.y - labelSize * 1.5;
      resolvedLabel = above >= safeTop ? { ...resolvedLabel, y: above } : null;
    }
  }

  const supportTarget = (heroSize || heroBox?.h * 0.5 || 0.1 * h) / (heroToSupport || 8);
  const readableBodyFloor = bodyFloor(h);
  const supportStart = Math.max(0.02 * h, supportTarget, readableBodyFloor) * supportSizeMultiplier;
  const bodyAtFloor = supportTarget < readableBodyFloor - 0.5;
  const supportMinimum = minimumFloor("body", h, supportStart, 24 * scale);
  let resolvedSupport = supportBox;

  if (resolvedSupport) {
    if (heroBox && resolvedSupport.y >= heroBox.y - 0.01 * h && heroBottom > heroBox.y) {
      const currentGap = resolvedSupport.y - heroBottom;
      if (currentGap < rhythmGap * 0.75 || currentGap > rhythmGap * 1.6) {
        resolvedSupport = { ...resolvedSupport, y: clampY(heroBottom + rhythmGap) };
      }
    }
    if (
      heroBox
      && intersects(resolvedSupport, {
        x: heroBox.x,
        y: heroBox.y,
        w: heroBox.w,
        h: Math.max(heroUsedHeight, heroBox.h * 0.3),
      })
    ) {
      resolvedSupport = { ...resolvedSupport, y: clampY(heroBottom + rhythmGap) };
    }

    const minimumSupportHeight = supportMinimum * 1.3;
    if (resolvedSupport.y + resolvedSupport.h > safeBottom) {
      const room = safeBottom - resolvedSupport.y;
      resolvedSupport = room >= minimumSupportHeight
        ? { ...resolvedSupport, h: room }
        : {
            ...resolvedSupport,
            y: Math.max(safeTop, safeBottom - minimumSupportHeight),
            h: minimumSupportHeight,
          };
    }
    resolvedSupport = constrainToPhoto(resolvedSupport);
    resolvedSupport = resolveDecorations(resolvedSupport);
    if (resolvedSupport.y + resolvedSupport.h > safeBottom) {
      const room = safeBottom - resolvedSupport.y;
      resolvedSupport = room >= minimumSupportHeight
        ? { ...resolvedSupport, h: room }
        : {
            ...resolvedSupport,
            y: Math.max(safeTop, safeBottom - minimumSupportHeight),
            h: minimumSupportHeight,
          };
    }
    if (resolvedSupport.h < supportMinimum * 1.3) flooredRoles.push({ label: "Body text" });
  }

  return {
    supportBox: resolvedSupport,
    labelBox: resolvedLabel,
    labelSize,
    supportStart,
    supportMinimum,
    bodyAtFloor,
    flooredRoles,
  };
}
