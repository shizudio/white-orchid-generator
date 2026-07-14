import test from "node:test";
import assert from "node:assert/strict";
import { createRenderModel, resolveRenderDimension } from "../../lib/render-model.mjs";

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
  assert.equal(Object.isFrozen(model),true);
});

test("render dimension is explicit and may be overridden for offscreen output", () => {
  const model=createRenderModel({ document:{}, dimensionId:"ig_square" });
  assert.equal(resolveRenderDimension(model),"ig_square");
  assert.equal(resolveRenderDimension(model,"story"),"story");
  assert.throws(() => createRenderModel({ document:{}, dimensionId:"" }),/dimensionId/);
});

