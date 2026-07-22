import test from "node:test";
import assert from "node:assert/strict";
import {contrastAtExtremes,evaluateInkLegibility,hexLuminance,luminanceContrast,rgbLuminance,summarizeLuminanceSamples} from "../../lib/surface-contrast-policy.mjs";

test("shared color math preserves WCAG luminance and contrast poles",()=>{
  assert.equal(rgbLuminance(0,0,0),0);
  assert.equal(hexLuminance("#000"),0);
  assert.ok(Math.abs(rgbLuminance(255,255,255)-1)<1e-12);
  assert.ok(Math.abs(hexLuminance("#ffffff")-1)<1e-12);
  assert.equal(luminanceContrast(1,0),21);
});

test("uniform surfaces use mean contrast",()=>{
  const surface=summarizeLuminanceSamples([0.8,0.8,0.8,0.8]);
  const result=evaluateInkLegibility(surface,0.02);
  assert.equal(result.busy,false);
  assert.equal(result.ok,true);
  assert.equal(result.contrast,result.meanContrast);
});

test("busy surfaces must clear the worst local contrast, not only the mean",()=>{
  const surface=summarizeLuminanceSamples([0.02,0.02,0.9,0.9]);
  const result=evaluateInkLegibility(surface,0.02);
  assert.equal(result.busy,true);
  assert.equal(result.ok,false);
  assert.ok(result.meanContrast>result.worstContrast);
});

test("extreme contrast reports the weakest sampled pole",()=>{
  const surface=summarizeLuminanceSamples([0.1,0.4,0.9]);
  assert.equal(contrastAtExtremes(surface,0.1),1);
  assert.equal(summarizeLuminanceSamples([]),null);
});
