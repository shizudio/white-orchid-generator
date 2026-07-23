import test from "node:test";
import assert from "node:assert/strict";
import {contrastAtExtremes,contrastRemedy,evaluateInkLegibility,hexLuminance,luminanceContrast,rgbLuminance,summarizeLuminanceSamples} from "../../lib/surface-contrast-policy.mjs";

// (Symptom 3) The remedy generator must never recommend the current ink.
const INKS=[
  {id:"whiteSmoke",label:"White Smoke",luminance:0.90},
  {id:"burnham",label:"Burnham",luminance:0.05},
  {id:"jet",label:"Jet",luminance:0.02},
  {id:"tangerine",label:"Tangerine",luminance:0.35},
  {id:"wisteria",label:"Wisteria",luminance:0.30},
];

test("remedy never names the active ink and only names improving options",()=>{
  // White Smoke on a bright surface (0.85) fails; darker inks improve + reach floor.
  const r=contrastRemedy({currentInkId:"whiteSmoke",autoInkId:"burnham",surfaceLuminance:0.85,options:INKS});
  assert.ok(!/White Smoke/.test(r.message),`must not name current ink: ${r.message}`);
  assert.equal(r.reachesFloor,true);
  assert.ok(r.betterInks.every(o=>o.id!=="whiteSmoke"));
  assert.ok(r.betterInks[0].contrast>=4.5);
});

test("remedy surfaces Auto only when Auto resolves to a better ink",()=>{
  const helps=contrastRemedy({currentInkId:"whiteSmoke",autoInkId:"burnham",surfaceLuminance:0.85,options:INKS});
  assert.equal(helps.autoHelps,true);
  assert.ok(/Auto/.test(helps.message));
  // When Auto would keep the same failing ink, it is not a remedy.
  const noHelp=contrastRemedy({currentInkId:"whiteSmoke",autoInkId:"whiteSmoke",surfaceLuminance:0.85,options:INKS});
  assert.equal(noHelp.autoHelps,false);
});

test("remedy is honest when no ink reaches the floor",()=>{
  // Surface ~0.20 sits in the dead band where no ink clears 4.5:1 and White Smoke
  // is already the best available — so no colour is named; band/darker/photo instead.
  const r=contrastRemedy({currentInkId:"whiteSmoke",surfaceLuminance:0.20,options:INKS});
  assert.equal(r.reachesFloor,false);
  assert.ok(!/White Smoke/.test(r.message));
  assert.ok(/darker area|different photo/.test(r.message));
});

test("remedy drops the band offer under the shape exclusion (§6a)",()=>{
  const withBand=contrastRemedy({currentInkId:"tangerine",surfaceLuminance:0.20,options:INKS,bandAvailable:true});
  const noBand=contrastRemedy({currentInkId:"tangerine",surfaceLuminance:0.20,options:INKS,bandAvailable:false});
  assert.ok(/band/.test(withBand.message));
  assert.ok(!/band/.test(noBand.message));
});

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
