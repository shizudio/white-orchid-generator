// ── Frame-photo COVER math (pure, testable) ──────────────────────────────────
// (§2.9.2 cover invariant, client ruling 2026-07-15) A frame shape must be FULLY
// COVERED by its photo — backing (the card pad, the field, an older silhouette)
// may never show inside the silhouette window. The unified fitted-window painter
// draws the photo with the SAME geometry as the canvas renderer's `photoGeom`:
//
//     s = max(w/iw, h/ih) * zoom          (zoom is in COVER units: 1 == exact cover)
//     photo size = (iw*s, ih*s), centered at (cx*w, cy*h), rotated `rotation`°.
//
// `photoGeom` only re-clamps the CENTER to guarantee coverage when the image
// already covers an axis (dw>=w / dh>=h) AND rotation is 0. So a user zoom-OUT
// (the zoom control floors at 0.1, well below cover) or a rotated pan leaves the
// photo short of the window and exposes backing. These helpers are the root fix:
// `coverClampT` returns a transform guaranteed to cover the w×h window (used at
// paint time for every frame shape), and `coversFrameBox` is the pure oracle the
// guards assert. Full-bleed photos are NOT frame shapes — they intentionally allow
// zoom<1 (the field is a deliberate mat) and never go through these helpers.

// Geometry of the drawn photo window for a transform, mirroring the canvas
// `photoGeom` (including its rotation-0 coverage center-clamp). Returns the photo's
// drawn edges in the window's local px space, or null when dims are degenerate.
export function photoWindow(iw, ih, w, h, t) {
  if (!iw || !ih || !w || !h) return null;
  const s = Math.max(w / iw, h / ih) * (t && typeof t.zoom === 'number' ? t.zoom : 1);
  const dw = iw * s, dh = ih * s;
  let cx = (t && typeof t.cx === 'number' ? t.cx : 0.5) * w;
  let cy = (t && typeof t.cy === 'number' ? t.cy : 0.5) * h;
  const rot = (t && t.rotation) || 0;
  if (rot === 0) {
    if (dw >= w) cx = Math.max(w - dw / 2, Math.min(dw / 2, cx));
    if (dh >= h) cy = Math.max(h - dh / 2, Math.min(dh / 2, cy));
  }
  return { cx, cy, dw, dh, rot, left: cx - dw / 2, right: cx + dw / 2, top: cy - dh / 2, bot: cy + dh / 2 };
}

// Does the transform's drawn photo fully cover the w×h frame window? (½px slack for
// float noise.) For a ROTATED photo we require the four window corners to fall
// inside the rotated image rectangle — an AABB test would wrongly pass corners that
// poke past a rotated edge.
export function coversFrameBox(iw, ih, w, h, t) {
  const g = photoWindow(iw, ih, w, h, t);
  if (!g) return true; // nothing to cover
  const rot = (t && t.rotation) || 0;
  const EPS = 0.5;
  if (rot === 0) {
    return g.left <= EPS && g.top <= EPS && g.right >= w - EPS && g.bot >= h - EPS;
  }
  const th = (rot * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
  const rinv = (x, y) => ({ x: x * cs + y * sn, y: -x * sn + y * cs }); // R(-θ)
  const c0 = rinv(g.cx, g.cy);
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const p = rinv(x, y);
    if (Math.abs(p.x - c0.x) > g.dw / 2 + EPS || Math.abs(p.y - c0.y) > g.dh / 2 + EPS) return false;
  }
  return true;
}

// Return the transform closest to `t` that is GUARANTEED to cover the w×h frame
// window: floor the zoom to the (rotation-aware) cover scale, then clamp the center
// so the window stays inside the image. Reduces to the exact `photoGeom` clamp when
// rotation is 0. `t` is {zoom,cx,cy,rotation} in cover units; returns the same shape.
export function coverClampT(iw, ih, w, h, t) {
  const zoomIn = t && typeof t.zoom === 'number' ? t.zoom : 1;
  const cxIn = t && typeof t.cx === 'number' ? t.cx : 0.5;
  const cyIn = t && typeof t.cy === 'number' ? t.cy : 0.5;
  const rotDeg = (t && t.rotation) || 0;
  if (!iw || !ih || !w || !h) return { zoom: Math.max(1, zoomIn), cx: cxIn, cy: cyIn, rotation: rotDeg };
  const cover = Math.max(w / iw, h / ih);            // plain cover scale (zoom == 1)
  const th = (rotDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  const needW = w * c + h * s, needH = w * s + h * c; // window bbox in the image frame
  const coverRot = Math.max(needW / iw, needH / ih);  // scale needed to cover incl. rotation
  // Never below plain cover (zoom>=1) nor below the rotation-aware cover.
  const zoom = Math.max(zoomIn, coverRot / cover, 1);
  const scale = cover * zoom, dw = iw * scale, dh = ih * scale;
  // Clamp the center so the window's four corners fall inside the (rotated) image.
  const cs = Math.cos(th), sn = Math.sin(th);
  const rinv = (x, y) => ({ x: x * cs + y * sn, y: -x * sn + y * cs }); // R(-θ)
  const rfwd = (x, y) => ({ x: x * cs - y * sn, y: x * sn + y * cs });  // R(θ)
  const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => rinv(x, y));
  const pax = corners.map((p) => p.x), pay = corners.map((p) => p.y);
  const a = rinv(cxIn * w, cyIn * h);
  const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
  const ax = clamp(a.x, Math.max(...pax) - dw / 2, Math.min(...pax) + dw / 2);
  const ay = clamp(a.y, Math.max(...pay) - dh / 2, Math.min(...pay) + dh / 2);
  const back = rfwd(ax, ay);
  return { zoom, cx: back.x / w, cy: back.y / h, rotation: rotDeg };
}
