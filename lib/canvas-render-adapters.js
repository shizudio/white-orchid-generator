import { decorationGridIntersectsRect, shapeGridStraddlesRect } from "./decoration-paint-intersection.mjs";
import { photoWindow } from "./photo-cover.mjs";

const decorationAlphaCache = new WeakMap();

export function drawableDimensions(image) {
  return {
    iw: image?.videoWidth || image?.width || 0,
    ih: image?.videoHeight || image?.height || 0,
  };
}

export function photoGeometry(image, width, height, transform) {
  const { iw, ih } = drawableDimensions(image);
  return photoWindow(iw, ih, width, height, transform);
}

export function drawPhotoWithTransform(context, image, width, height, transform) {
  const geometry = photoGeometry(image, width, height, transform);
  if (!geometry) return null;
  context.save();
  context.translate(geometry.cx, geometry.cy);
  if (geometry.rot) context.rotate((geometry.rot * Math.PI) / 180);
  context.drawImage(image, -geometry.dw / 2, -geometry.dh / 2, geometry.dw, geometry.dh);
  context.restore();
  return geometry;
}

export function decorationAlphaGrid(image) {
  if (!image) return null;
  if (decorationAlphaCache.has(image)) return decorationAlphaCache.get(image);
  let result = null;
  try {
    const size = 36;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    result = { size, alpha: context.getImageData(0, 0, size, size).data };
  } catch (_) {
    result = null;
  }
  decorationAlphaCache.set(image, result);
  return result;
}

export function decorationPaintIntersectsRect(image, shape, target) {
  return decorationGridIntersectsRect(decorationAlphaGrid(image), shape, target);
}

export function structuralPaintStraddlesRect(image, shape, target) {
  return shapeGridStraddlesRect(decorationAlphaGrid(image), shape, target);
}

/** Match the frame painter's safe-box clamp and intrinsic-aspect fit. */
export function fittedFrameBounds(box, width, height, safe = {}, ratio = 1) {
  if (!box || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  const sm = { t:safe.t ?? 0, b:safe.b ?? 0, l:safe.l ?? 0, r:safe.r ?? 0 };
  const nw = Math.max(0.05, Math.min(box.w ?? 0.8, 1-sm.l-sm.r));
  const nh = Math.max(0.03, Math.min(box.h ?? 0.2, 1-sm.t-sm.b));
  const nx = Math.max(sm.l, Math.min(1-sm.r-nw, box.x ?? sm.l));
  const ny = Math.max(sm.t, Math.min(1-sm.b-nh, box.y ?? sm.t));
  const container = { x:nx*width, y:ny*height, w:nw*width, h:nh*height };
  const aspect = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  let fw=container.w,fh=fw/aspect;
  if(fh>container.h){fh=container.h;fw=fh*aspect;}
  return {x:container.x+(container.w-fw)/2,y:container.y+(container.h-fh)/2,w:fw,h:fh};
}
