/**
 * Type-scale audit driver — the truth table for S/M/L.
 *
 * Runs pure (no Canvas): it reports the TARGET painted px each S/M/L step resolves to for
 * every class × format, BEFORE and AFTER the type-scale change, so we can see exactly where
 * a step was a no-op (delta < NOOP_THRESHOLD) and why (floor clamp vs tiny multiplier).
 *
 * What it does NOT capture: the downstream auto-fit/fitText capacity clamp, which only bites
 * when the copy is long enough to fill its box (then the painter shrinks the target to fit and
 * the step collapses regardless of the table — that is the honest capped case, reported at
 * render time by resolveEffectiveStep). The absolute PAINTED px for a specific copy string needs
 * the Chromium/149 render-truth harness (roleBounds/textMetrics); this driver measures the
 * target the table hands the painter, which is the lever the client's complaint is about.
 *
 * Usage:  node scripts/tools/type-scale-audit.mjs
 */
import { TYPE_SCALE, formatFamilyOf } from "../../lib/type-scale.mjs";

const NOOP_THRESHOLD = 0.08;   // < 8% adjacent delta = imperceptible (the complaint)
const TARGET_DELTA = 0.18;     // the design target for adjacent S/M/L

// Mirrored from components/Generator.jsx (DIMENSIONS + the element CLASS_BASE/FLOOR + MIN_FONT_PX).
const FORMATS = [
  { id: "ig_portrait", w: 1080, h: 1350 },
  { id: "story", w: 1080, h: 1920 },
  { id: "ig_square", w: 1080, h: 1080 },
  { id: "twitter", w: 1600, h: 900 },
  { id: "facebook", w: 1200, h: 630 },
  { id: "banner", w: 1500, h: 500 },
];
const canvasScale = (w, h) => Math.min(w, h) / 1080;
const classBasePx = (cls, w, h) => {
  const S = canvasScale(w, h);
  return { heading: 54 * S, subheading: 38 * S, body: 30 * S, caption: 26 * S, cta: 0.024 * h }[cls];
};
const classFloorPx = (cls, w, h) => {
  const S = canvasScale(w, h);
  return { heading: 34 * S, subheading: 26 * S, body: 22 * S, caption: 18 * S, cta: 0.016 * h }[cls];
};

// The OLD tables (format-blind), lifted from git before this change.
const OLD_ELEMENT = { S: 0.82, M: 1, L: 1.25 };
const OLD_LEGACY = { xs: 0.7, s: 0.85, m: 1, l: 1.25, xl: 1.55 };

const pct = x => `${(x * 100).toFixed(0)}%`;
const num = x => x.toFixed(1).padStart(6);

function elementRow(cls, fmt, elMult, family) {
  const base = classBasePx(cls, fmt.w, fmt.h);
  const floor = classFloorPx(cls, fmt.w, fmt.h);
  const px = step => Math.max(floor, base * (typeof elMult === "function" ? elMult(step, family) : elMult[step]));
  const s = px("S"), m = px("M"), l = px("L");
  const dSM = (m - s) / s, dML = (l - m) / m;
  const noop = dSM < NOOP_THRESHOLD || dML < NOOP_THRESHOLD;
  return { s, m, l, dSM, dML, noop, floorHit: s <= floor + 0.01 };
}

function printBlock(title, elMult, useFamily) {
  console.log(`\n### ${title}`);
  console.log("class      format         S      M      L    ΔS→M   ΔM→L  flag");
  console.log("-".repeat(70));
  for (const cls of ["heading", "subheading", "body", "caption"]) {
    for (const fmt of FORMATS) {
      const family = useFamily ? formatFamilyOf(fmt.id) : "square";
      const r = elementRow(cls, fmt, elMult, family);
      const flag = r.noop ? "NO-OP" : (r.dSM >= TARGET_DELTA && r.dML >= TARGET_DELTA ? "ok" : "weak");
      const fh = r.floorHit ? " (S@floor)" : "";
      console.log(
        `${cls.padEnd(10)} ${fmt.id.padEnd(12)} ${num(r.s)} ${num(r.m)} ${num(r.l)}  ${pct(r.dSM).padStart(5)}  ${pct(r.dML).padStart(5)}  ${flag}${fh}`,
      );
    }
  }
}

console.log("TYPE-SCALE AUDIT — element classes, target px per S/M/L (pre auto-fit clamp)");
console.log(`NO-OP = adjacent delta < ${pct(NOOP_THRESHOLD)} (imperceptible); target >= ${pct(TARGET_DELTA)}`);

printBlock("BEFORE (format-blind ELEMENT_SIZE_STEPS S:0.82 M:1 L:1.25)", OLD_ELEMENT, false);
printBlock("AFTER (type-scale, per-format-family)", (step, family) => TYPE_SCALE[family].element[step], true);

// Legacy hero target (pre fit-loop). capFrac 0.30, the editorial default anchor.
console.log("\n### LEGACY hero role — target px = capFrac*h*1.35*mult, floored (pre fit-loop)");
console.log("mult set    format          S      M      L    ΔS→M   ΔM→L  flag");
console.log("-".repeat(70));
const heroTarget = (fmt, mult, step) => {
  const cap = 0.3 * fmt.h * 1.35 * mult[step];
  const floor = Math.max(0.068 * fmt.h, 38 * (fmt.h / 1080));
  return Math.max(floor, cap);
};
for (const [label, mult, fam] of [["BEFORE", OLD_LEGACY, false], ["AFTER", null, true]]) {
  for (const fmt of FORMATS) {
    const family = fam ? formatFamilyOf(fmt.id) : "square";
    const m = fam ? TYPE_SCALE[family].legacy : mult;
    const s = heroTarget(fmt, m, "s"), mm = heroTarget(fmt, m, "m"), l = heroTarget(fmt, m, "l");
    const dSM = (mm - s) / s, dML = (l - mm) / mm;
    const flag = dSM < NOOP_THRESHOLD || dML < NOOP_THRESHOLD ? "NO-OP" : "ok";
    console.log(`${label.padEnd(11)} ${fmt.id.padEnd(12)} ${num(s)} ${num(mm)} ${num(l)}  ${pct(dSM).padStart(5)}  ${pct(dML).padStart(5)}  ${flag}`);
  }
}
console.log("\nNote: hero target ΔS→M above 0 does not survive the fit-loop when copy fills the box;");
console.log("that capped case is surfaced honestly at render by resolveEffectiveStep (M2), not silently.");
