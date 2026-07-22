import { clampNormalizedRoleBox } from "./format-placement-policy.mjs";

/** Ensures authored content never becomes silently unreachable on the canvas. */
export function synthesizeMissingEditorialRoles({
  width,
  height,
  safe,
  heroBox,
  supportBox,
  labelBox,
  supportText,
  eyebrowText,
  roles,
  furniture,
  provenanceElements,
  special,
}) {
  let support = supportBox;
  let label = labelBox;
  const clamp = (box) => clampNormalizedRoleBox(box, { width, height, safe });
  const hasIndexCarrier = !roles?.microLabel
    && (furniture || []).some((item) => item?.type === "index");

  if (
    supportText
    && !support
    && heroBox
    && !provenanceElements?.support
    && special !== "scheduleRows"
  ) {
    const belowY = (heroBox.y + heroBox.h) / height + 0.015;
    const fitsBelow = belowY <= 1 - safe.b - 0.055;
    const y = fitsBelow ? belowY : Math.max(safe.t, heroBox.y / height - 0.075);
    support = clamp({
      x: heroBox.x / width,
      y,
      w: heroBox.w / width,
      h: 0.06,
    });
  }

  if (
    eyebrowText
    && !label
    && heroBox
    && !hasIndexCarrier
    && !provenanceElements?.microLabel
  ) {
    label = clamp({
      x: heroBox.x / width,
      y: Math.max(safe.t, heroBox.y / height - 0.075),
      w: heroBox.w / width,
      h: 0.05,
    });
  }

  return { supportBox: support, labelBox: label, hasIndexCarrier };
}

/** Moves a message-pill text group away from a confident photo focal subject. */
export function dodgeMessagePillFromFocal({
  width,
  height,
  safe,
  heroBox,
  supportBox,
  labelBox,
  focal,
  photoGeometry,
}) {
  if (!heroBox || !focal || focal.confidence < 0.35 || !photoGeometry) {
    return { heroBox, supportBox, labelBox, shifted: false };
  }
  const focalX = photoGeometry.cx + (focal.fx - 0.5) * photoGeometry.dw;
  const focalY = photoGeometry.cy + (focal.fy - 0.5) * photoGeometry.dh;
  const radius = 0.20 * Math.min(width, height);
  const pillTop = heroBox.y - 0.05 * height;
  const overlapsX = focalX + radius > heroBox.x
    && focalX - radius < heroBox.x + heroBox.w;
  if (!overlapsX || focalY + radius <= pillTop) {
    return { heroBox, supportBox, labelBox, shifted: false };
  }

  const left = safe.l * width;
  const right = (1 - safe.r) * width;
  const targetX = focalX > width / 2 ? left : right - heroBox.w;
  const deltaX = Math.max(left, Math.min(right - heroBox.w, targetX)) - heroBox.x;
  const shift = (box) => box
    ? { ...box, x: Math.max(left, Math.min(right - box.w, box.x + deltaX)) }
    : box;
  return {
    heroBox: shift(heroBox),
    supportBox: shift(supportBox),
    labelBox: shift(labelBox),
    shifted: Math.abs(deltaX) > 1e-9,
  };
}

/** Produces paint-ready schedule rows while keeping parsing and rhythm out of Canvas. */
export function planScheduleRows({
  raw,
  box,
  width,
  height,
  stripMarkers = (value) => String(value || ""),
  maximumRows = 8,
}) {
  if (!box) return null;
  const rows = stripMarkers(String(raw || "")).trim()
    .split(/\s*\|\s*|\n+/)
    .map((row) => row.trim())
    .filter(Boolean)
    .slice(0, maximumRows)
    .map((row) => {
      const match = row.match(/^(\S+)\s+(.+)$/);
      return match ? { time: match[1], activity: match[2] } : { time: "", activity: row };
    });
  if (!rows.length) return null;
  const rowHeight = box.h / rows.length;
  const timeSize = Math.min(rowHeight * 0.42, box.w * 0.11);
  const activitySize = Math.min(rowHeight * 0.30, box.w * 0.058);
  const hairline = Math.max(0.5, Math.round(Math.min(width, height) * 0.0009));
  return {
    box: { ...box },
    timeSize,
    activitySize,
    hairline,
    timeX: box.x,
    activityX: box.x + box.w * 0.38,
    rows: rows.map((row, index) => ({
      ...row,
      centerY: box.y + rowHeight * index + rowHeight * 0.5,
      ruleY: index < rows.length - 1
        ? box.y + rowHeight * (index + 1) - hairline
        : null,
    })),
  };
}
