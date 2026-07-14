import { useEffect } from "react";
import { computeReadyChecklist } from "@/lib/audit-local";

/** Owns render-only development and resident-test calibration/guard boards. */
export function useRenderVerificationBoards({
  renderScene,
  devHooks,
  testHooks,
  dimensions,
  archetypeIds,
  archetypesById,
  fonts,
}) {

  /* ── CALIBRATION BOARD (Commit 4, dev-only) ──────────────────────────────────
     window.__woCalibrationBoard(content?) renders the CURRENT design's content
     through the FULL archetype catalog at ig_square into ONE tall labelled composite (3-wide
     grid) and returns + downloads a PNG dataURL for the client to score-tune the
     spec numbers. Each cell renders via renderScene with opts.archOverride (no live
     state mutation). If `content` is passed, its headline/subtext/attribution/
     dateText override the current copy for the board only (per-cell, not state). */
  useEffect(() => {
    if (typeof window === "undefined" || !devHooks) return;   // dev-only (item 8)
    window.__woCalibrationBoard = (content, variant) => {
      const V = Number.isInteger(variant) ? variant : 0;
      // Bare calls must never render an empty design: fall back to the standard
      // calibration copy (the v1 board content) so every tile shows real type.
      content = content || { headline: "Freedom to *explore*", subtext: "Every child", attribution: "Ms Chen", dateText: "18 July" };
      const CELL = 360;               // per-archetype tile (ig_square, downscaled)
      const cols = 3, pad = 18, labelH = 26;
      const rows = Math.ceil(archetypeIds.length / cols); // (P4) show ALL archetypes — the grid grows with the array
      const boardW = cols * CELL + (cols + 1) * pad;
      const boardH = rows * (CELL + labelH) + (rows + 1) * pad + 40;
      const board = document.createElement("canvas");
      board.width = boardW; board.height = boardH;
      const bctx = board.getContext("2d");
      bctx.fillStyle = "#EDECE4"; bctx.fillRect(0, 0, boardW, boardH);
      bctx.fillStyle = "#254E48"; bctx.font = "700 20px " + (fonts.subtitle || "sans-serif");
      bctx.textBaseline = "alphabetic";
      bctx.fillText("White Orchid — Archetype Calibration Board (ig_square)", pad, 28);
      // Off-screen full-res cell canvas reused per archetype.
      const cell = document.createElement("canvas"); cell.width = 1080; cell.height = 1080;
      const cctx = cell.getContext("2d");
      archetypeIds.forEach((id, i) => {
        const col = i % cols, row = (i / cols) | 0;
        const x = pad + col * (CELL + pad);
        const y = 40 + pad + row * (CELL + labelH + pad);
        // (R2 board variety) When the caller does not pin a variant (bare board call,
        // V===0), rotate each tile through its OWN variant ring so the default board
        // shows the sanctioned pastel + ~25–30% dark spread (spec §3), not 12 ivory
        // tiles. An explicit `variant` arg still pins every tile (variant-sweep mode).
        const arch = archetypesById[id];
        const vCount = arch?.variants?.length || 1;
        const cellV = Number.isInteger(variant) ? V : (i % vCount);
        try {
          renderScene(cctx, 1080, 1080, { dimensionId: "ig_square", live: false, archOverride: id, archVariant: cellV, calibrationContent: content || null });
        } catch (_) { cctx.clearRect(0, 0, 1080, 1080); }
        bctx.drawImage(cell, x, y, CELL, CELL);
        bctx.strokeStyle = "#254E4833"; bctx.lineWidth = 1; bctx.strokeRect(x + 0.5, y + 0.5, CELL, CELL);
        bctx.fillStyle = "#254E48"; bctx.font = "600 12px " + (fonts.subtitle || "sans-serif");
        bctx.fillText(`${i + 1}. ${arch?.name || id}`, x, y + CELL + 17);
      });
      const dataURL = board.toDataURL("image/png");
      try {
        const a = document.createElement("a");
        a.href = dataURL; a.download = "wo-calibration-board.png";
        document.body.appendChild(a); a.click(); a.remove();
      } catch (_) { /* headless / no-DOM download — dataURL still returned */ }
      return dataURL;
    };
    return () => { try { delete window.__woCalibrationBoard; } catch {} };
  }, [renderScene]);

  /* ── FEED SIMULATION BOARD (WP-P P4, dev-only) ───────────────────────────────
     window.__woFeedBoard(photos?) renders a FIXED 12-post demo campaign AS A FEED —
     a real 3×4 Instagram grid in the reference's rhythm (feed-grammar §1), each tile
     a DIFFERENT archetype + content (belief statement, stat 1:6, enrolment CTA, photo
     moments with micro-labels, manifesto, brand card, closing card…). `photos` is an
     optional map { slotKey: HTMLImageElement } of real Higgsfield photos injected per
     photo tile via renderScene's opts.imageOverride; text tiles ignore it. The old
     per-archetype board stays callable as __woCalibrationBoard(content, variant). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    // The demo campaign. Each entry drives ONE tile: archetype id, palette variant,
    // per-cell copy (headline/subtext/attribution/dateText), and an optional photo slot.
    // Sequenced in grid #1's row map (dark brand · photo · ivory statement // photo ·
    // wisteria manifesto · photo // dark statement · photo · ivory CTA // photo · celadon
    // stat · dark closing) with grid #2's brighter warmth. attribution = the eyebrow.
    const FEED = [
      // ── Row 1 ── (documentary tiles put the micro-label in HEADLINE — that archetype's
      // hero IS the caps metadata line bottom-left; it has no separate eyebrow role.)
      { arch:"brand_card",  v:0, c:{ headline:"THE WHITE ORCHID", subtext:"a school led by children" } },
      { arch:"documentary", v:0, photo:"bloom", c:{ headline:"In bloom", subtext:"" } },
      { arch:"label_headline", v:0, c:{ attribution:"OUR BELIEF", headline:"Every child is capable of leading their own day." } },
      // ── Row 2 ──
      { arch:"documentary", v:0, photo:"play", c:{ headline:"At play", subtext:"" } },
      { arch:"manifesto",   v:1, c:{ attribution:"HOW WE WORK", headline:"Real ownership. Real decisions. Real consequences." } },
      { arch:"documentary", v:0, photo:"beside", c:{ headline:"Beside them", subtext:"" } },
      // ── Row 3 ──
      { arch:"serif_word",  v:3, c:{ attribution:"ON PLAY", headline:"Play is the work of childhood." } },
      { arch:"documentary", v:0, photo:"studio", c:{ headline:"The studio", subtext:"" } },
      { arch:"cta_card",    v:0, c:{ attribution:"ENROLMENT", headline:"Now *enrolling*", subtext:"Term 3, 2026\nAges four to twelve\nAfterschool care, Singapore" } },
      // ── Row 4 ──
      { arch:"schedule_tile", v:0, c:{ attribution:"A DAY HERE", subtext:"2.30 School pick-up | 3.30 Free play | 4.00 Tea together | 5.00 Gardens and making | 6.30 Stories | 7.00 Home" } },
      { arch:"stat_tile",   v:0, c:{ attribution:"OUR RATIO", dateText:"1 : 6", subtext:"one guide, six children — a room that stays quiet" } },
      { arch:"closing_card",v:0, c:{ headline:"Come and *see for yourself*", subtext:"thewhiteorchid.sg" } },
    ];
    if (!devHooks) return;   // dev-only (item 8)
    window.__woFeedBoard = (photos) => {
      const P = photos || {};
      const CELL = 360, cols = 3, rows = 4, pad = 6;
      const boardW = cols * CELL + (cols + 1) * pad;
      const boardH = rows * CELL + (rows + 1) * pad + 44;
      const board = document.createElement("canvas");
      board.width = boardW; board.height = boardH;
      const bctx = board.getContext("2d");
      bctx.fillStyle = "#EDECE4"; bctx.fillRect(0, 0, boardW, boardH);
      bctx.fillStyle = "#254E48"; bctx.font = "700 20px " + (fonts.subtitle || "sans-serif");
      bctx.textBaseline = "alphabetic";
      bctx.fillText("White Orchid — Feed Simulation (12-post campaign)", pad + 6, 30);
      const cell = document.createElement("canvas"); cell.width = 1080; cell.height = 1080;
      const cctx = cell.getContext("2d");
      FEED.forEach((tile, i) => {
        const col = i % cols, row = (i / cols) | 0;
        const x = pad + col * (CELL + pad);
        const y = 44 + pad + row * (CELL + pad);
        try {
          renderScene(cctx, 1080, 1080, {
            dimensionId: "ig_square", live: false,
            archOverride: tile.arch, archVariant: tile.v || 0,
            calibrationContent: tile.c || null,
            imageOverride: tile.photo && P[tile.photo] ? P[tile.photo] : null,
          });
        } catch (_) { cctx.clearRect(0, 0, 1080, 1080); }
        bctx.drawImage(cell, x, y, CELL, CELL);
      });
      const dataURL = board.toDataURL("image/png");
      try {
        const a = document.createElement("a");
        a.href = dataURL; a.download = "wo-feed-board.png";
        document.body.appendChild(a); a.click(); a.remove();
      } catch (_) { /* headless */ }
      return dataURL;
    };
    return () => { try { delete window.__woFeedBoard; } catch {} };
  }, [renderScene]);

  /* ── STRESS SWEEP (Commit 3 verification, dev-only) ──────────────────────────
     window.__woArchStress(content?) renders EVERY archetype × ALL 6 FORMATS
     offscreen with the given (long) copy via renderScene(archOverride+captureAudit),
     reading the collision assertion (boxOverlaps / outOfMargin) from each render's
     audit signal. Returns a report + a pass flag (zero overlaps, zero crops). No live
     state is touched (temporary materialized state per cell). (Commit 1) The sweep now
     covers ig_portrait / twitter / facebook too — the reported wide-format banner↔logo
     collision and twitter right-edge clip were invisible while only square/story/banner
     were asserted. The permanent stress set is ALL six dimensions. */
  useEffect(() => {
    // (item 8) __woArchStress / __woBornCleanGuard / __woLegacyDupGuard are the
    // tester's GUARD ORACLES — available in dev and in the tester's isolated
    // test-hooks build, never on a real production window. __woCell is dev-only.
    if (typeof window === "undefined" || !testHooks) return;
    window.__woArchStress = (content) => {
      const cc = content || {
        headline: "Early Childhood *Educators* Wanted for Our Growing Nurturing Community",
        subtext: "Join our team of dedicated professionals shaping young minds every single day at The White Orchid preschool",
        attribution: "Apply now at hello@thewhiteorchid.sg before the end of this month",
        dateText: "18 September",
      };
      const fmts = dimensions.map(d => d.id);
      const rows = []; let overlaps = 0, crops = 0, midcuts = 0, seams = 0, degens = 0, logodoms = 0, logolows = 0, dblband = 0, decortext = 0, decorfocal = 0, framemis = 0, bandshape = 0;
        for (const id of archetypeIds) for (const dimId of fmts) {
          const dm = dimensions.find(d => d.id === dimId);
          try {
            const c = document.createElement("canvas"); c.width = dm.w; c.height = dm.h;
            const result=renderScene(c.getContext("2d"), dm.w, dm.h, { dimensionId: dimId, live: false, captureAudit: true, archOverride: id, calibrationContent: cc });
            const dr = result?.auditSignal?.archetypeDrift || {};
            const o = dr.boxOverlaps || 0, cr = dr.outOfMargin ? 1 : 0, mc = dr.midCut || 0;
            const sea = dr.seamStraddles || 0, dg = dr.degeneratePhoto ? 1 : 0, ld = dr.logoDominant ? 1 : 0;
            const ll = dr.logoLowContrast ? 1 : 0;   // (brand ruling) = illegible logo NOT flagged (never fabricate a backing; flag instead)
            const db = dr.doubleBackdrop || 0;        // (single-owner) a text role got >1 contrast band
            const bs = dr.bandOverShape || 0;         // (§6a) a band was blocked from slicing a shape silhouette
            const dt = dr.decorOverlapsText || 0, df = dr.decorInFocal || 0, fm = dr.frameMisalign || 0;  // (item 4) decor law + frame geometry
            overlaps += o; crops += cr; midcuts += mc; seams += sea; degens += dg; logodoms += ld; logolows += ll; dblband += db; decortext += dt; decorfocal += df; framemis += fm; bandshape += bs;
            if (o || cr || mc || sea || dg || ld || ll || db || dt || df || fm || bs) rows.push({ archetype: id, dimId, boxOverlaps: o, outOfMargin: !!cr, midCut: mc, seamStraddles: sea, degeneratePhoto: !!dg, logoDominant: !!ld, logoLowContrast: !!ll, doubleBackdrop: db, bandOverShape: bs, decorOverlapsText: dt, decorInFocal: df, frameMisalign: fm, logoPhotoContrast: dr.logoPhotoContrast ?? null, diag: dr._diag || null });
          } catch (e) { rows.push({ archetype: id, dimId, error: String(e) }); }
        }
      const report = { pass: overlaps === 0 && crops === 0 && midcuts === 0 && seams === 0 && degens === 0 && logodoms === 0 && logolows === 0 && dblband === 0 && decortext === 0 && decorfocal === 0 && framemis === 0 && bandshape === 0, totalOverlaps: overlaps, totalCrops: crops, totalMidCuts: midcuts, totalSeamStraddles: seams, totalDegeneratePhotos: degens, totalLogoDominant: logodoms, totalLogoLowContrast: logolows, totalDoubleBackdrop: dblband, totalBandOverShape: bandshape, totalDecorOverlapsText: decortext, totalDecorInFocal: decorfocal, totalFrameMisalign: framemis, cells: archetypeIds.length * fmts.length, offenders: rows };
      // eslint-disable-next-line no-console
      console.log("[woArchStress]", JSON.stringify(report));
      return report;
    };
    /* ── BORN-CLEAN GUARD (client rule 2026-07-06) ─────────────────────────────
       Anything the SYSTEM produces autonomously (auto logo placement, spec-default
       text layout, format adaptation) must pass every DETERMINISTIC readiness check
       BY CONSTRUCTION — the advisor may never disagree with the system itself. This
       sweeps EVERY archetype × EVERY format with SHORT system copy + a NON-EXPLICIT
       (auto) logo, then asserts ZERO system-caused deterministic findings. Copy-length
       findings (copy-dropped / caption-long / thumb-legibility) are EXCLUDED — those are
       user-content tradeoffs, not system placement — so the guard targets exactly the
       "system manufactured a problem" class: safe-area-text, safe-area-logo,
       logo-legibility, and any archetype safe-zone/overlap fail. */
    window.__woBornCleanGuard = () => {
      // DETERMINISM (B4, 2026-07-06): the guard must pass/fail identically run-to-run.
      // safe-area-text is a PLACEMENT fail (a text role landing in the Story action
      // band), and placement is content-DEPENDENT — long copy the reflow lifts/shrinks
      // can push a role into the band that short copy clears. Earlier the guard used
      // ONE short fixed string and so passed 0 on a day the live path (long generated
      // copy) still offended. We now sweep a FIXED set of content profiles spanning the
      // realistic worst case (short + long-but-bounded), all fixed strings, so the
      // system-placement assertion is exercised at its stress point yet stays fully
      // deterministic. Copy-LENGTH findings (copy-dropped / caption-long / thumb) are
      // still excluded (SYSTEM_FINDING_IDS) — those are honest user-content tradeoffs,
      // not a system-manufactured problem.
      const CONTENT_PROFILES = [
        { headline: "Open house", subtext: "This Saturday", attribution: "The White Orchid", dateText: "18 July" },
        // Fixed WORST-CASE: long-but-plausible copy in every role. The reflow must keep
        // every role clear of the action band even at this volume (shrink-or-lift, never
        // cross in). Kept fixed so the run is deterministic.
        { headline: "Early Childhood Educators Wanted for Our Growing Community",
          subtext: "Join our team of dedicated professionals shaping young minds every single day",
          attribution: "Apply at hello@thewhiteorchid.sg before the month ends",
          dateText: "18 September" },
        // (Item 3iii) The CLIENT's reported class: a short headline + a real two-line
        // caption over a full-bleed photo (the documentary / full_bleed_duotone double-
        // block + ghost-caption geometry). This content-dependent geometry must be in the
        // guard's samples so a regression of the single-band / per-role-contrast fix
        // surfaces here (and via __woArchStress's doubleBackdrop assertion), not in prod.
        { headline: "Celebrating Art Week", subtext: "Join us for a week of creativity and expression",
          attribution: "The White Orchid", dateText: "18 July" },
        // (§6a shape–band exclusion — RATIFIED 2026-07-13) A SHAPE archetype (shape_cutout /
        // petal_window) with a LONG CAPS HEADLINE is the client's reported geometry: the caps
        // headline dips toward the mask's busy crown. With the band rung disabled on shape
        // designs the system must stay born-clean by PLACEMENT alone (the mask is a first-class
        // obstacle) — this profile keeps that case in the deterministic sweep so a regression of
        // the exclusion (a band manufactured behind the headline, or the headline slicing the
        // silhouette) surfaces here and via __woArchStress's bandOverShape assertion, not in prod.
        { headline: "WE'RE HIRING EARLY CHILDHOOD EDUCATORS", subtext: "Join our nurturing team this autumn",
          attribution: "The White Orchid", dateText: "Autumn 2026" },
      ];
      const SYSTEM_FINDING_IDS = new Set(["safe-area-text", "safe-area-logo", "logo-legibility", "archetype-margin-crop", "archetype-box-overlap"]);
      const offenders = [];
      let cells = 0;
        for (const cc of CONTENT_PROFILES) for (const id of archetypeIds) for (const d of dimensions) {
          cells++;
          try {
            const c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
            // A fresh system design: auto logo (userLogoTouched is false in these renders'
            // logoBase unless the live state pinned it — captureAudit uses the live pin,
            // so we can't fully neutralize a live pin here; the guard is meaningful on a
            // fresh/default session where the logo is auto. It still catches auto-placement
            // regressions across the archetype matrix).
            const result=renderScene(c.getContext("2d"), d.w, d.h, { dimensionId: d.id, live: false, captureAudit: true, archOverride: id, calibrationContent: cc });
            const signal=result?.auditSignal||null;
            const verdict = computeReadyChecklist([{ dimensionId: d.id, signal }]).formats[0];
            const sys = (verdict.issues || []).filter(i => i.severity === "fail" && SYSTEM_FINDING_IDS.has(i.id));
            if (sys.length) offenders.push({ archetype: id, dimId: d.id, copy: cc.headline.length > 20 ? "long" : "short", findings: sys.map(i => i.id) });
          } catch (e) { offenders.push({ archetype: id, dimId: d.id, error: String(e) }); }
        }
      const report = { pass: offenders.length === 0, cells, offenders };
      // eslint-disable-next-line no-console
      console.log("[woBornCleanGuard]", JSON.stringify(report));
      return report;
    };
    // Single-cell probe (verification): render ONE archetype x format offscreen and
    // return that cell's drift snapshot (boxes + overlap/crop flags). Dev-only.
    if (devHooks) window.__woCell = (archId, dimId, content) => {
      const dm = dimensions.find(d => d.id === dimId);
      if (!dm || !archetypeIds.includes(archId)) return null;
      try {
        const c = document.createElement("canvas"); c.width = dm.w; c.height = dm.h;
        const result=renderScene(c.getContext("2d"), dm.w, dm.h, { dimensionId: dimId, live: false, captureAudit: true, archOverride: archId, calibrationContent: content || {} });
        return JSON.parse(JSON.stringify(result?.auditSignal?.archetypeDrift || null));
      } catch (e) { return { error: String(e) }; }
    };
    /* ── LEGACY DUPLICATE-DRAW GUARD (Story double-render regression) ───────────
       __woArchStress validates the archetype engine's LAYOUT MODEL — it never
       exercised the legacy (archetypeId-null) postType painters, so the Story 9:16
       "whole composition drawn twice, stacked" bug (a stale strip surviving OUTSIDE
       the render's logical w×h when the <canvas> backing store was momentarily
       taller than (w,h) during a format switch) passed clean. This sibling guard
       reproduces that exact class deterministically for EVERY legacy postType on ALL
       6 formats: it renders into an OVERSIZED backing store, pre-painted with a
       sentinel colour OUTSIDE the format's (w,h), then asserts renderScene fully
       cleared that region (no ghost second copy can survive). It also asserts the
       headline paints in a SINGLE contiguous bright y-band, not two disjoint copies.
       Returns {pass, offenders:[{postType,dimId,reason}]}. */
    window.__woLegacyDupGuard = () => {
      const LEGACY_TYPES = ["photo_logo", "quote", "event", "text_post", "texture_text"];
      const offenders = [];
        for (const pt of LEGACY_TYPES) for (const dm of dimensions) {
          try {
            // ── (a) STALE-STRIP RACE (the exact Story bug) ──
            // Reproduce a format switch where the <canvas> backing store is TALLER +
            // WIDER than the dims renderScene runs with (a stale-dims / mid-resize
            // draw). Backing store = format size; pre-paint the WHOLE store with a
            // sentinel (stands in for the previous format's pixels); then render with
            // SHORTER logical dims (w-360, h-360). A correct renderScene must clear the
            // ENTIRE store first, so the strip BELOW/RIGHT of the short box holds NO
            // sentinel. The pre-fix clearRect(0,0,w,h) left that strip as a ghost.
            const SHRINK = 360;
            const rw = Math.max(200, dm.w - SHRINK), rh = Math.max(200, dm.h - SHRINK);
            const c = document.createElement("canvas"); c.width = dm.w; c.height = dm.h;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            ctx.fillStyle = "#ff00ff"; ctx.fillRect(0, 0, c.width, c.height);   // sentinel = stale prior frame
            renderScene(ctx, rw, rh, { dimensionId: dm.id, live: false, postTypeOverride: pt, legacyForce: true });
            let ghost = 0;
            // Sample strictly OUTSIDE the (rw,rh) render box — any surviving sentinel
            // magenta here is a stale ghost strip (the stacked second copy).
            const outPts = [[(rw + dm.w) / 2, dm.h / 2], [dm.w / 2, (rh + dm.h) / 2], [dm.w - 20, dm.h - 20], [rw + 30, rh / 2], [rw / 2, rh + 30]];
            for (const [x, y] of outPts) {
              const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
              const isSentinel = d[0] > 200 && d[1] < 80 && d[2] > 200;
              if (isSentinel) ghost++;
            }
            if (ghost) { offenders.push({ postType: pt, dimId: dm.id, reason: "stale strip survived outside render box (stacked ghost)" }); continue; }
            // (b) DUPLICATE TEXT-BAND — only for the HEADLINE-CENTRIC types whose
            // painted text is predictable (headline + optional short caption + the
            // corner lockup). Multi-line types (quote/event/text_post) legitimately
            // stack several text bands, so the band count isn't a duplication signal
            // there — check (a) is the universal duplicate-draw guard for them.
            const BAND_CHECK_TYPES = ["photo_logo", "texture_text"];
            if (BAND_CHECK_TYPES.includes(pt)) {
              const c2 = document.createElement("canvas"); c2.width = dm.w; c2.height = dm.h;
              const x2 = c2.getContext("2d", { willReadFrequently: true });
              renderScene(x2, dm.w, dm.h, { dimensionId: dm.id, live: false, postTypeOverride: pt, legacyForce: true });
              const rows = 60, colXs = [0.18, 0.32, 0.5].map(f => Math.floor(dm.w * f));
              let inBand = false, bands = 0;
              for (let r = 0; r < rows; r++) {
                const y = Math.floor((r + 0.5) / rows * dm.h);
                let bright = 0;
                for (const x of colXs) { const d = x2.getImageData(x, y, 1, 1).data; if (d[0] > 190 && d[1] > 190 && d[2] > 190) bright++; }
                const lit = bright >= 2;
                if (lit && !inBand) { bands++; inBand = true; } else if (!lit) inBand = false;
              }
              // Allowed bands: headline + caption(subtext) + corner lockup = up to 3.
              // 4+ disjoint bright bands ⇒ a stacked second copy.
              if (bands >= 4) offenders.push({ postType: pt, dimId: dm.id, reason: `${bands} disjoint text bands (expected ≤3: headline+caption+lockup)` });
            }
          } catch (e) { offenders.push({ postType: pt, dimId: dm.id, reason: "render error: " + String(e) }); }
        }
      const report = { pass: offenders.length === 0, cells: LEGACY_TYPES.length * dimensions.length, offenders };
      // eslint-disable-next-line no-console
      console.log("[woLegacyDupGuard]", JSON.stringify(report));
      return report;
    };
    return () => { try { delete window.__woArchStress; delete window.__woCell; delete window.__woLegacyDupGuard; delete window.__woBornCleanGuard; } catch {} };
  }, [renderScene]);
}
