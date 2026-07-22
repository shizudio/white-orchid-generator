import test from "node:test";
import assert from "node:assert/strict";
import { applyDesignCommand, createDesignDocumentV1 } from "../../lib/design-document.mjs";
import { compileDesignPatchCommands } from "../../lib/design-patch-commands.mjs";

const applyEntries = (document, entries) => entries.reduce(
  (current, entry) => applyDesignCommand(current, entry.command).document,
  document,
);

test("compiles direct assistant fields into ordered semantic commands", () => {
  const plan = compileDesignPatchCommands({
    postType:"event",
    headline:"Open studio",
    microLabel:"THIS SATURDAY",
    bgColor:"celadon",
    textColorId:"burnham",
    backdropMode:"band",
    bgAlpha:1.4,
    fieldColor:"sage",
    photoTreatment:"warmGrade",
    mediaKind:"video",
    photoFrameType:"card",
    fontSizes:{ heading:"xl", content:"m", highlight:"invalid" },
  });

  assert.deepEqual(plan.beforeMaterialization.map(entry => entry.patchField), ["postType"]);
  assert.deepEqual(plan.afterMaterialization.map(entry => entry.patchField), [
    "headline", "microLabel", "bgColor", "textColorId", "backdropMode", "bgAlpha", "fieldColor", "photoTreatment", "mediaKind", "photoFrameType", "fontSizes",
  ]);
  assert.equal(plan.afterMaterialization.find(entry=>entry.patchField==="bgAlpha").command.value,1);
  assert.deepEqual(plan.afterMaterialization.at(-1).command.patch, { heading:"xl", content:"m" });
  assert.deepEqual(plan.compatibilityFields, []);
});

test("compiled commands produce the canonical document state", () => {
  const plan = compileDesignPatchCommands({
    postType:"quote",
    headline:"Curiosity grows here",
    subtext:"A thoughtful place to learn.",
    bgColor:"wisteria",
    textColorId:"whiteSmoke",
    backdropMode:"gradient",
    bgAlpha:-1,
    fieldColor:"",
    photoTreatment:"duotone",
    mediaKind:"video",
    photoFrameType:"card",
    fontSizes:{ heading:"l" },
  });
  const before = createDesignDocumentV1();
  const afterPre = applyEntries(before, plan.beforeMaterialization);
  const after = applyEntries(afterPre, plan.afterMaterialization);

  assert.equal(after.composition.postType, "quote");
  assert.equal(after.content.headline, "Curiosity grows here");
  assert.equal(after.content.subtext, "A thoughtful place to learn.");
  assert.equal(after.palette.background, "wisteria");
  assert.equal(after.palette.text, "whiteSmoke");
  assert.equal(after.palette.backdrop, "auto");
  assert.equal(after.palette.backgroundOpacity,0);
  assert.equal(after.palette.field,null);
  assert.equal(after.media.treatment, "duotone");
  assert.equal(after.media.kind, "video");
  assert.equal(after.media.frame.type, "card");
  assert.equal(after.typography.fontSizes.heading, "l");
});

test("invalid direct values are ignored and composite fields stay visible", () => {
  const plan = compileDesignPatchCommands({
    postType:"unknown",
    bgColor:"neon",
    fontSizes:{ heading:"giant" },
    archetypeId:"documentary",
    logoPosition:"top-left",
    addOverlay:{ assetId:"shape-1", mode:"frame" },
    imagePrompt:"children painting outdoors",
    nullField:null,
  });

  assert.deepEqual(plan.beforeMaterialization, []);
  assert.deepEqual(plan.afterMaterialization, []);
  assert.deepEqual(plan.compatibilityFields, [
    "postType", "bgColor", "fontSizes", "archetypeId", "logoPosition", "addOverlay", "imagePrompt",
  ]);
});

test("null and non-object patches produce an empty plan", () => {
  assert.deepEqual(compileDesignPatchCommands(null), {
    beforeMaterialization:[], afterMaterialization:[], compatibilityFields:[],
  });
});
