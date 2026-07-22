import test from "node:test";
import assert from "node:assert/strict";
import { createRenderModel, resolveRenderConstraints, resolveRenderContentTypography, resolveRenderDecoration, resolveRenderDimension, resolveRenderLayout, resolveRenderMediaLogo, resolveRenderSurface } from "../../lib/render-model.mjs";

test("render model keeps canonical design and transient assets in separate bags", () => {
  const decodedImage={ width:1200, height:800 };
  const model=createRenderModel({
    document:{ headline:"Learn boldly", postType:"event" },
    dimensionId:"ig_portrait",
    runtime:{ selectedShapeId:"shape:1" },
    assets:{ media:decodedImage },
  });
  assert.equal(model.document.content.headline,"Learn boldly");
  assert.equal(model.document.composition.postType,"event");
  assert.equal(model.assets.media,decodedImage);
  assert.equal(model.runtime.selectedShapeId,"shape:1");
  assert.equal(model.layout.dimensionId,"ig_portrait");
  assert.equal(model.constraints.dimensionId,"ig_portrait");
  assert.equal(model.contentTypography.dimensionId,"ig_portrait");
  assert.equal(model.mediaLogo.dimensionId,"ig_portrait");
  assert.equal(model.surface.dimensionId,"ig_portrait");
  assert.equal(model.decoration.dimensionId,"ig_portrait");
  assert.equal(Object.isFrozen(model),true);
});

test("render dimension is explicit and may be overridden for offscreen output", () => {
  const model=createRenderModel({ document:{}, dimensionId:"ig_square" });
  assert.equal(resolveRenderDimension(model),"ig_square");
  assert.equal(resolveRenderDimension(model,"story"),"story");
  assert.equal(resolveRenderLayout(model,"story").dimensionId,"story");
  assert.equal(resolveRenderConstraints(model,"story").dimensionId,"story");
  assert.equal(resolveRenderContentTypography(model,"story").dimensionId,"story");
  assert.equal(resolveRenderMediaLogo(model,"story").dimensionId,"story");
  assert.equal(resolveRenderSurface(model,"story").dimensionId,"story");
  assert.equal(resolveRenderDecoration(model,"story").dimensionId,"story");
  assert.throws(() => createRenderModel({ document:{}, dimensionId:"" }),/dimensionId/);
});
