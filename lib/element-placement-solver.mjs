// Universal text-element placement solver (docs/element-placement-spec.md §2;
// docs/design-engine-refactor-remaining-prd.md §B1 extraction).
//
// PRD-B1: "date and eyebrow placement can be tested without DOM or Canvas painting;
// Canvas receives final coordinates, font choice, ink, and optional backing only."
// This module is that boundary — pure geometry + the register-escalation ladder. It
// owns NO Canvas: the caller injects `measure(px,face,weight)` and `surface(box,ink)`
// adapters (thin wrappers over ctx.measureText / measureZoneContrast), and the solver
// returns final coordinates + the chosen face/weight/ink/band. Extracted VERBATIM from
// the Generator painter (placeTextElement, the date/eyebrow/badge element classes, the
// candidate ladders and furniture-obstacle projection) so the render fingerprint stays
// pixel-identical (guard battery D).
//
// Pure (no React, no DOM, no brand literals): fonts are injected (`F`), inks come from
// the caller's inkPoles/baseInk. Element classes are built at call time so a live brand
// font swap (applyBrandFonts mutates F) is reflected exactly as the inline version was.

/* ── TEXT-CLASS PLACEMENT (docs/element-placement-spec.md §2; P1 slice 1b) ────────
   The measured-text-box path of the universal solver. The caller hands it candidate
   ANCHORS in priority order + the shared hard-restraint set; this walks each candidate
   through the ratified register-escalation ladder (cfg.escalate.rungs — rung 0 is the
   ink-flip, then heavier sanctioned weight → the most robust brand face → size up within
   range → band last resort) with a GUARDED RE-MEASURE at every rung: a face/size change
   re-measures the box (text width shifts), and a re-measured box that overflows its bounds
   or hits an obstacle is rejected. The FIRST candidate that yields a legible, in-bounds,
   collision-free box wins — priority order encodes the art-directed preference, so a clean
   archetype prior (candidate #1) reproduces today's placement. Furniture is a SOFT obstacle
   (it yields to the element downstream via the furniture avoid-list), so a candidate
   clearing the hard set but sitting on furniture is used only if none clears both (two
   passes). Returns { id, x, y, w, h, px, face, weight, ink, band } or null (an HONEST
   refusal — the caller then leaves the role dead so the pendingOffer path fires as before). */
import { TYPE_SCALE, elementStepPx as elementStepPxScaled } from "./type-scale.mjs";
import { registerFace, registerWeightRange, resolveTypographyConfig } from "./typography-config.mjs";

// (Font Ruling B — runtime threading, 2026-07-23) Build one escalation rung by resolving its
// FACE + sanctioned WEIGHT through the brand typography config instead of hardcoding F.title /
// F.subtitle / F.body. registerFace maps a register → its brand font ROLE → the injected F key;
// registerWeightRange clamps the rung's ladder weight into that register's sanctioned band.
// `config` is a resolved (or raw, or null → White Orchid default) typography_config. With the
// default config this is byte-identical to the old hardcodes — serif→F.title,
// heavySans/eyebrow/badge→F.subtitle, body→F.body — and every default rung weight already sits
// inside its register's range, so nothing clamps. Callers pass `opts.typographyConfig`.
function rung(config, F, register, weight, extra) {
  const [lo, hi] = registerWeightRange(config, register);
  const w = Math.min(hi, Math.max(lo, weight));
  return extra ? { face: registerFace(config, register, F), weight: w, ...extra }
               : { face: registerFace(config, register, F), weight: w };
}
// rung 0 — ink-flip. On a photo the pole with the higher worst-cell contrast wins;
// on a SOLID field surface() returns null and the zone-resolved ink (baseInk) already
// contrasts the field, so no flip is forced (that ink stays, matching today's look).
// Shared by placeTextElement and resolveTextTreatmentAt so the two can never drift.
function makeInkPicker(surface, baseInk, inkPoles){
  return (box)=>{
    const s0=surface(box,baseInk);
    if(!s0) return baseInk;
    let best=baseInk, bestMin=s0.min;
    for(const p of inkPoles){ if(p===baseInk) continue; const s=surface(box,p); if(s && s.min>bestMin){ bestMin=s.min; best=p; } }
    return best;
  };
}
// (Item D optical weight — 15a2680) a THIN register is forbidden RAW over photo
// texture (sqrt(maxV)>opticalMax) even at passing colour contrast; a heavy weight
// or a band survives the texture. Colour contrast must also clear the AA floor.
function rungLegible(cfg, surf, rung){
  if(!surf) return true;   // solid field / no photo under the box → the light serif reads
  const opticalOK = Math.sqrt(surf.maxV||0)<=cfg.escalate.opticalMax || rung.weight>=cfg.escalate.heavyWeight || rung.band;
  const contrastOK = surf.min>=cfg.escalate.contrastFloor || rung.band;
  return opticalOK && contrastOK;
}
export function placeTextElement(ctx){
  const { cfg, candidates, hardObstacles, softObstacles, safe, focalBox,
          measure, surface, baseInk, inkPoles } = ctx;
  const hit=(a,b)=>a&&b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const tolX=safe.tolX||0, tolY=safe.tolY||0;
  const inBounds=(box)=>box.x>=safe.x0-tolX && box.y>=safe.y0-tolY &&
                        box.x+box.w<=safe.x1+tolX && box.y+box.h<=safe.y1+tolY;
  const clears=(box,obs)=>!obs.some(o=>hit(box,o));
  const pickInk=makeInkPicker(surface, baseInk, inkPoles);
  const rungs=cfg.escalate.rungs;
  const legible=(surf,rung)=>rungLegible(cfg,surf,rung);
  for(const requireSoft of [true,false]){
    if(requireSoft && !(softObstacles&&softObstacles.length)) continue;   // no soft set → single pass
    for(const cand of candidates){
      for(let ri=0; ri<rungs.length; ri++){
        const rung=rungs[ri];
        const px=cfg.preferredPx*(rung.sizeMul||1);
        const dim=measure(px,rung.face,rung.weight);
        const at=cand.at(dim.w,dim.h);
        const box={x:at.x,y:at.y,w:dim.w,h:dim.h};
        if(!inBounds(box)) break;                               // position can't hold this box → next candidate
        if(!clears(box,hardObstacles)) break;                   // hard collision → next candidate
        if(focalBox && hit(box,focalBox)) break;                // on a face → next candidate
        if(requireSoft && softObstacles && !clears(box,softObstacles)) break;   // save for the hard-only pass
        const ink=pickInk(box);
        const surf=surface(box,ink);
        if(legible(surf,rung)) return { id:cand.id, x:box.x, y:box.y, w:box.w, h:box.h, px, face:rung.face, weight:rung.weight, ink, band:!!rung.band };
        // illegible at this rung → escalate the register (next rung, same candidate).
      }
    }
  }
  return null;
}

/* ── CONTINUOUS TREATMENT RE-RESOLUTION (docs/text-unification-spec.md §Phase C) ───
   The accessibility director must keep adapting AFTER placement, not only at it:
   "all text elements should have the same auto change accessibility feature (changing
   in weight and color depending on placement within the composition)" (client ruling 4).

   placeTextElement resolves ink/weight for the box IT chose. An owner DRAG pin then
   moves the painted box somewhere else — law 5 keeps that spot — so the treatment has
   to be re-resolved AT THE PAINTED BOX, or a heading dragged from the ivory field onto
   the photo keeps the field's ink and goes illegible.

   Same ladder, same order, position NOT negotiable: walk the rungs at this position and
   return the first legible one. If no rung is legible the LAST (most robust) rung is
   returned rather than a refusal — the element is already on canvas and the owner's spot
   is a pin; the honest report is a contrast finding, never a disappearing text.
   `anchor` is either {center:{x,y}} (a frozen centre pin) or {topLeft:{x,y}}. */
export function resolveTextTreatmentAt({ cfg, anchor, measure, surface, baseInk, inkPoles }){
  const pickInk=makeInkPicker(surface, baseInk, inkPoles);
  let last=null;
  for(const rung of cfg.escalate.rungs){
    const px=cfg.preferredPx*(rung.sizeMul||1);
    const dim=measure(px,rung.face,rung.weight);
    const box=anchor.center
      ? { x:anchor.center.x-dim.w/2, y:anchor.center.y-dim.h/2, w:dim.w, h:dim.h }
      : { x:anchor.topLeft.x, y:anchor.topLeft.y, w:dim.w, h:dim.h };
    const ink=pickInk(box);
    last={ x:box.x, y:box.y, w:box.w, h:box.h, px, face:rung.face, weight:rung.weight, ink, band:!!rung.band };
    if(rungLegible(cfg, surface(box,ink), rung)) return last;
  }
  return last;
}

// The DATE-LINE element class (docs/element-placement-spec.md §1; P1 slice 1b). The
// secondary date is a MEASURED serif line; preferredPx is supplied per-render (it tracks
// the hero size). Its register escalates in the ratified order — rung 0 ink-flip (pickInk),
// then heavier sanctioned WEIGHT → the most robust brand FACE (the sans body) → SIZE up
// within range → BAND last resort. Faces/weights reference the injected brand fonts F.
// opts.noBand drops the BAND last-resort for callers that explicitly disallow it (and on
// any design with an active shape the band rung is disabled — §6a — so the ladder resolves
// through ink→weight→face→size only; a null return is an HONEST refusal, never a band).
export function makeDateClass(preferredPx, F, opts){
  const noBand = !!(opts && opts.noBand);
  const config = resolveTypographyConfig(opts && opts.typographyConfig);
  return {
    preferredPx,
    escalate: {
      contrastFloor: 4.5,   // AA for a reading line (the caption's own escalate floor)
      opticalMax: 0.14,     // sqrt(maxV) busyness ceiling for a THIN register (15a2680)
      heavyWeight: 600,     // a sanctioned weight ≥ this survives photo texture raw
      noBand,
      rungs: [
        rung(config, F, "serif", 300),                 // the elegant light serif (today's default)
        rung(config, F, "serif", 700),                 // rung: heavier SANCTIONED serif weight
        rung(config, F, "body",  600),                 // rung: the most robust brand FACE (sans body)
        rung(config, F, "body",  700, { sizeMul: 1.15 }),  // rung: robust sans, SIZE up within range
        rung(config, F, "body",  700, { band: true }),     // rung: BAND last resort (guarantees legibility)
      ].filter(r => !(noBand && r.band)),
    },
  };
}

// The EYEBROW (micro-label) element class (docs/element-placement-spec.md §1; P1 slice
// 2b-i). The eyebrow is a small tracked ALL-CAPS line; preferredPx is supplied per-render
// and floored at the dateLabel class floor. Its register escalates in the ratified order —
// rung 0 ink-flip, then a heavier sanctioned caps WEIGHT within the subtitle face → the
// most robust brand FACE (the sans body, still drawn caps+tracked) → SIZE up within range
// → BAND last resort. Built at call time (F references the injected brand fonts).
export function makeEyebrowClass(preferredPx, F, opts){
  const noBand = !!(opts && opts.noBand);
  const config = resolveTypographyConfig(opts && opts.typographyConfig);
  return {
    preferredPx,
    escalate: {
      contrastFloor: 4.5,   // AA for a small reading label (mirrors the date's floor)
      opticalMax: 0.14,     // sqrt(maxV) busyness ceiling for a THIN register (15a2680)
      heavyWeight: 600,     // a sanctioned weight ≥ this survives photo texture raw
      noBand,
      rungs: [
        rung(config, F, "eyebrow", 400),                 // the light tracked eyebrow (today's default register)
        rung(config, F, "eyebrow", 700),                 // rung: heavier SANCTIONED caps weight (Syne 700)
        rung(config, F, "body",    600),                 // rung: the most robust brand FACE (sans body, caps)
        rung(config, F, "body",    700, { sizeMul: 1.15 }),  // rung: robust sans, SIZE up within range
        rung(config, F, "body",    700, { band: true }),     // rung: BAND last resort (guarantees legibility)
      ].filter(r => !(noBand && r.band)),
    },
  };
}

// The BADGE (accent pill) element class (docs/element-placement-spec.md §1; P1 slice
// 2b-ii). The badge is an OPAQUE filled lozenge — self-legible against its own fill, so
// NO register-escalation ladder applies: a single rung, and the caller's surface() returns
// null so placeTextElement's legibility test passes immediately and the solver just walks
// the candidate anchors for a clean (in-bounds, collision-free) spot.
export function makeBadgeClass(preferredPx, F, opts){
  const config = resolveTypographyConfig(opts && opts.typographyConfig);
  return {
    preferredPx,
    escalate: {
      contrastFloor: 0, opticalMax: 1, heavyWeight: 0,   // opaque pill → self-legible, ladder never fires
      rungs: [ rung(config, F, "badge", 600) ],
    },
  };
}

// Light approximate boxes for an archetype's authored furniture (rule / index / underline /
// counterweight / badge), used as the date/eyebrow solver's SOFT obstacle set so a placed
// line prefers a spot clear of the tells. Furniture yields downstream (the placed box joins
// drawFurniture's avoid-list), so these need only be roughly right. Pure.
export function dateFurnitureObstacles(mat,w,h){
  const list=[]; const f=mat&&mat.furniture; if(!Array.isArray(f)) return list;
  for(const it of f){ if(!it) continue;
    const x=(it.x||0)*w, y=(it.y||0)*h;
    if(it.type==="rule"||it.type==="underline"){ const ww=(it.w||0.1)*w; list.push({x, y:y-0.015*h, w:ww, h:0.03*h}); }
    else if(it.type==="index"){ list.push({x:it.align==="right"?x-0.24*w:x, y:y-0.03*h, w:0.24*w, h:0.05*h}); }
    else if(it.type==="counterweight"){ list.push({x:x-0.02*w, y:y-0.02*h, w:0.12*w, h:0.05*h}); }
    else if(it.type==="badge"){ list.push({x:it.align==="right"?x-0.24*w:x, y:y-0.01*h, w:0.26*w, h:0.06*h}); }
  }
  return list;
}

// Merge a format's editorial safe margin (sm{l,r,t,b}) with the platform's UI action zone
// (ps{left,right,top,bottom}, PLATFORM_SAFE) — the tighter of the two per side. A text role
// landing in the platform band trips safe-area-text, so a corner date/eyebrow must clear it.
export function mergeSafeMargins(sm, ps){
  return ps
    ? { l:Math.max(sm.l,ps.left), r:Math.max(sm.r,ps.right), t:Math.max(sm.t,ps.top), b:Math.max(sm.b,ps.bottom) }
    : { l:sm.l, r:sm.r, t:sm.t, b:sm.b };
}

// Horizontal placement of a measured box against the hero column, honouring the role's
// alignment (left/center/right). Pure — the exact alignX the date/eyebrow painters used.
function alignXOf(align, heroBox){
  return (bw)=> align==="center" ? heroBox.x+(heroBox.w-bw)/2
              : align==="right"  ? heroBox.x+heroBox.w-bw
              : heroBox.x;
}

/* ── EYEBROW candidate ladder (docs/element-placement-spec.md §2/§3) ──────────────
   The eyebrow's art-directed home is ABOVE the hero; then the top edge corners / centre;
   then below the hero / caption; then the bottom corners (a quiet footer eyebrow). safe =
   {l,r,t,b} fractions (already platform-merged). supBox = truthy when a support caption
   follows (adds the below-support anchor). Returns [{id, at(bw,bh)→{x,y}}] — same order,
   same math as the extracted painter. */
export function buildEyebrowAnchors({ heroBox, supBox, supBottom, ebGap, usedH, safe, w, h, align }){
  const ax=alignXOf(align, heroBox); const { l, r, t, b }=safe; const out=[];
  out.push({ id:"above-hero",   at:(bw,bh)=>({ x:ax(bw),        y:heroBox.y-ebGap-bh }) });
  out.push({ id:"corner-tl",    at:()=>       ({ x:l*w,           y:t*h }) });
  out.push({ id:"corner-tr",    at:(bw)=>     ({ x:(1-r)*w-bw,    y:t*h }) });
  out.push({ id:"top-center",   at:(bw)=>     ({ x:(w-bw)/2,      y:t*h }) });
  out.push({ id:"below-hero",   at:(bw)=>     ({ x:ax(bw),        y:heroBox.y+usedH+ebGap }) });
  if(supBox) out.push({ id:"below-support", at:(bw)=>({ x:ax(bw), y:supBottom+ebGap }) });
  out.push({ id:"corner-bl",    at:(bw,bh)=>  ({ x:l*w,           y:(1-b)*h-bh }) });
  out.push({ id:"corner-br",    at:(bw,bh)=>  ({ x:(1-r)*w-bw,    y:(1-b)*h-bh }) });
  return out;
}

/* ── DATE candidate ladder (docs/element-placement-spec.md §2/§3) ─────────────────
   The date's art-directed prior is below the hero, then below the support caption, then
   above the hero, then the four safe corners, then bottom-centre. supBelow = truthy when a
   caption follows below the hero (adds the below-support anchor). safe = {l,r,t,b} (already
   platform-merged). Returns [{id, at(bw,bh)→{x,y}}] — same order, same math as the painter. */
export function buildDateAnchors({ heroBox, usedH, dGap, supBelow, supBottom, safe, w, h, align }){
  const ax=alignXOf(align, heroBox); const { l, r, t, b }=safe; const out=[];
  out.push({ id:"below-hero",     at:(bw)=>     ({ x:ax(bw),     y:heroBox.y+usedH+dGap }) });
  if(supBelow) out.push({ id:"below-support", at:(bw)=>({ x:ax(bw), y:supBottom+dGap }) });
  out.push({ id:"above-hero",     at:(bw,bh)=>  ({ x:ax(bw),     y:heroBox.y-dGap-bh }) });
  out.push({ id:"corner-bl",      at:(bw,bh)=>  ({ x:l*w,        y:(1-b)*h-bh }) });
  out.push({ id:"corner-br",      at:(bw,bh)=>  ({ x:(1-r)*w-bw, y:(1-b)*h-bh }) });
  out.push({ id:"corner-tl",      at:()=>        ({ x:l*w,        y:t*h }) });
  out.push({ id:"corner-tr",      at:(bw)=>     ({ x:(1-r)*w-bw, y:t*h }) });
  out.push({ id:"bottom-center",  at:(bw,bh)=>  ({ x:(w-bw)/2,   y:(1-b)*h-bh }) });
  return out;
}

/* ── CONTENT-BLOCK candidate ladder (docs/text-elements-spec.md §3; Slice 2b) ─────
   The measured multi-line block ladder for ADDED heading/subheading/body elements.
   Unlike the date/eyebrow edge lines, a content block stacks in the reading COLUMN:
   its art-directed prior is UNDER the existing content stack (below the support caption
   when one is present, else below the hero), then above the hero, then the column top,
   then the safe corners. Same alignment + coordinate math (alignXOf) and the same
   {id, at(bw,bh)→{x,y}} shape as the sibling ladders, so the solver walks them identically.
   supBelow = truthy when a support caption follows below the hero (adds the below-support
   anchor at the head of the order). safe = {l,r,t,b} (already platform-merged). */
export function buildContentBlockAnchors({ heroBox, usedH, gap, supBelow, supBottom, safe, w, h, align }){
  const ax=alignXOf(align, heroBox); const { l, r, t, b }=safe; const out=[];
  if(supBelow) out.push({ id:"below-support", at:(bw)=>({ x:ax(bw), y:supBottom+gap }) });
  out.push({ id:"below-hero",  at:(bw)=>     ({ x:ax(bw),     y:heroBox.y+usedH+gap }) });
  out.push({ id:"above-hero",  at:(bw,bh)=>  ({ x:ax(bw),     y:heroBox.y-gap-bh }) });
  out.push({ id:"column-top",  at:(bw)=>     ({ x:ax(bw),     y:t*h }) });
  out.push({ id:"corner-tl",   at:()=>        ({ x:l*w,        y:t*h }) });
  out.push({ id:"corner-bl",   at:(bw,bh)=>  ({ x:l*w,        y:(1-b)*h-bh }) });
  out.push({ id:"corner-br",   at:(bw,bh)=>  ({ x:(1-r)*w-bw, y:(1-b)*h-bh }) });
  return out;
}

/* ── ADDED-ELEMENT CLASS CONFIGS (docs/text-elements-spec.md §2; orchestrator ruling) ─
   The five brand-governed classes bind 1:1 to the EXISTING ratified register/class
   configs — no new fonts, weights, or treatments are invented here:
     heading    → the hero register path (the elegant serif F.title, or the heavySans
                  register when opts.register==="heavySans" — mirroring heroRegister).
     subheading → the support register (F.body), a larger sanctioned step.
     body       → the support register (F.body), a smaller sanctioned step.
     caption    → the date/eyebrow EDGE treatment (makeDateClass by default; the tracked
                  all-caps eyebrow register when opts.eyebrow is set — the microLabel path).
     cta        → the opaque badge/pill (makeBadgeClass; self-legible, ladder never fires).
   Each escalation ladder is the ratified order (ink → heavier sanctioned weight → the most
   robust brand face → size up within range → band last resort), identical in shape to the
   date/eyebrow classes so placeTextElement walks them unchanged. opts.noBand drops the band
   rung (§6a shape-band exclusion, honoured by the caller on any design with an active shape). */

// heading → the hero register (serif F.title, or heavySans F.subtitle). Ratified ladder.
export function makeHeadingClass(preferredPx, F, opts){
  const noBand = !!(opts && opts.noBand);
  const heavySans = !!(opts && opts.register === "heavySans");
  const config = resolveTypographyConfig(opts && opts.typographyConfig);
  return {
    preferredPx,
    escalate: {
      contrastFloor: 4.5, opticalMax: 0.14, heavyWeight: 600, noBand,
      rungs: (heavySans ? [
        rung(config, F, "heavySans", 700),                 // the heavy-sans hero register
        rung(config, F, "heavySans", 800),                 // rung: heavier sanctioned sans weight
        rung(config, F, "body",      700, { sizeMul: 1.10 }),  // rung: robust brand body, SIZE up
        rung(config, F, "body",      700, { band: true }),     // rung: BAND last resort
      ] : [
        rung(config, F, "serif", 400),                     // the elegant serif hero (today's default)
        rung(config, F, "serif", 700),                     // rung: heavier SANCTIONED serif weight
        rung(config, F, "body",  700),                     // rung: the most robust brand FACE (sans body)
        rung(config, F, "body",  700, { sizeMul: 1.15 }),  // rung: robust sans, SIZE up within range
        rung(config, F, "body",  700, { band: true }),     // rung: BAND last resort
      ]).filter(r => !(noBand && r.band)),
    },
  };
}

// subheading + body → the SUPPORT register (F.body). One shared builder: the two classes
// differ only by the preferredPx step the caller supplies (subheading larger, body smaller),
// per the orchestrator ruling "S/M/L only steps within each register's sanctioned range."
export function makeSupportClass(preferredPx, F, opts){
  const noBand = !!(opts && opts.noBand);
  const config = resolveTypographyConfig(opts && opts.typographyConfig);
  return {
    preferredPx,
    escalate: {
      contrastFloor: 4.5, opticalMax: 0.14, heavyWeight: 600, noBand,
      rungs: [
        rung(config, F, "body", 400),                     // the support body line (today's default)
        rung(config, F, "body", 600),                     // rung: heavier SANCTIONED body weight
        rung(config, F, "body", 700),                     // rung: heaviest sanctioned body weight
        rung(config, F, "body", 700, { sizeMul: 1.15 }),  // rung: SIZE up within range
        rung(config, F, "body", 700, { band: true }),     // rung: BAND last resort
      ].filter(r => !(noBand && r.band)),
    },
  };
}
export const makeSubheadingClass = makeSupportClass;
export const makeBodyClass = makeSupportClass;

// (type-scale) S/M/L step multipliers — the ONLY size freedom, applied to a class's
// per-render base px before the config is built. The numbers now live in lib/type-scale.mjs
// as a per-format-family table (a step must read the same on a tall portrait and a wide
// banner even though the canvas scale differs). ELEMENT_SIZE_STEPS is the square-family
// view kept for the 2-arg callers; pass a family (formatFamilyOf(dimId)) to vary the spread.
// The class floor still clamps the shrink; M is pinned at 1.0 (fixture invariance).
export const ELEMENT_SIZE_STEPS = TYPE_SCALE.square.element;
export function elementStepPx(basePx, step, family = "square"){
  return elementStepPxScaled(basePx, step, family);
}

// (docs/text-elements-spec.md §2) The 1:1 class → config dispatcher. Returns the ratified
// placement config for one of the five sanctioned classes, or null for an unknown class
// (the caller then leaves the element unpainted — complete-or-absent). preferredPx is the
// per-render base (already S/M/L stepped via elementStepPx). caption defaults to the date
// edge line; opts.eyebrow selects the tracked micro-label register instead.
export function resolveElementClassConfig(className, { preferredPx, F, opts } = {}){
  switch(className){
    case "heading":    return makeHeadingClass(preferredPx, F, opts);
    case "subheading": return makeSubheadingClass(preferredPx, F, opts);
    case "body":       return makeBodyClass(preferredPx, F, opts);
    case "caption":    return (opts && opts.eyebrow) ? makeEyebrowClass(preferredPx, F, opts)
                                                     : makeDateClass(preferredPx, F, opts);
    case "cta":        return makeBadgeClass(preferredPx, F, opts);
    default:           return null;
  }
}

// (docs/text-elements-spec.md §3) The class → candidate-ladder binding. heading/subheading/
// body stack in the reading column (buildContentBlockAnchors); caption rides the date/eyebrow
// edge ladder; cta rides the badge/pill anchors (the date ladder's corner-first order suits a
// pill). Pure — the caller supplies the resolved geometry. Returns the anchor array.
export function buildElementAnchors(className, geom){
  switch(className){
    case "heading":
    case "subheading":
    case "body":
      return buildContentBlockAnchors(geom);
    case "caption":
      return geom.eyebrow ? buildEyebrowAnchors(geom) : buildDateAnchors(geom);
    case "cta":
      return buildDateAnchors(geom);
    default:
      return [];
  }
}
