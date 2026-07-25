import test from "node:test";
import assert from "node:assert/strict";
import {
  COPY_AUTHOR_FIELDS,
  designPatchInteractionTags,
  isContinuousDesignPatch,
  prepareDesignPatch,
  resolveDesignPatchCompletion,
  shouldRetainAuthoredCopy,
} from "../../lib/design-patch-preparation.mjs";

test("patch preparation normalizes retired treatments without mutating the caller", () => {
  const patch={backdropMode:"gradient",headline:"Original"};
  const prepared=prepareDesignPatch(patch,{uiSource:true});
  assert.deepEqual(prepared,{backdropMode:"auto",headline:"Original"});
  assert.equal(patch.backdropMode,"gradient");
});

test("AI copy fitting resolves budgets against the patch target", () => {
  const calls=[];
  const prepared=prepareDesignPatch({
    archetypeId:"editorial",
    dimensionId:"story",
    postType:"event",
    headline:"A complete sentence. Additional words",
  },{
    currentArchetypeId:"current",
    currentDimensionId:"ig_square",
    currentPostType:"quote",
    archetypeIds:["editorial"],
    dimensionIds:["story"],
    postTypes:["event"],
    getCopyBudgets:(...args)=>{calls.push(args);return{headline:20};},
    fitCopy:()=>"A complete sentence.",
  });

  assert.deepEqual(calls,[["editorial","story","event"]]);
  assert.equal(prepared.headline,"A complete sentence.");
});

test("owner copy and UI copy remain verbatim", () => {
  const options={
    getCopyBudgets:()=>({headline:5}),
    fitCopy:()=>"Short",
  };
  assert.equal(prepareDesignPatch({headline:"Owner wording"},{...options,copyAuthors:{headline:"owner"}}).headline,"Owner wording");
  assert.equal(prepareDesignPatch({headline:"UI wording"},{...options,uiSource:true}).headline,"UI wording");
});

test("fragment and dangling-word trims retain authored copy", () => {
  assert.equal(shouldRetainAuthoredCopy("We are so grateful for our community","We are so"),true);
  assert.equal(shouldRetainAuthoredCopy("A week of creativity and play","A week of creativity and"),true);
  assert.equal(shouldRetainAuthoredCopy("A complete sentence. More","A complete sentence."),false);
  const prepared=prepareDesignPatch({subtext:"A week of creativity and play"},{
    getCopyBudgets:()=>({subtext:22}),
    fitCopy:()=>"A week of creativity and",
  });
  assert.equal(prepared.subtext,"A week of creativity and play");
});

test("brand-name copy exclusion: the system never authors the brand's own name on canvas", () => {
  const options={
    getCopyBudgets:()=>({attribution:64,headline:48}),
    fitCopy:value=>value,
    brandName:"The White Orchid",
  };
  // System-authored attribution that is merely the brand name is dropped at the boundary
  // (enters complete-or-absent) — exact and trivial case/whitespace variants.
  assert.equal("attribution" in prepareDesignPatch({attribution:"The White Orchid"},options),false);
  assert.equal("attribution" in prepareDesignPatch({attribution:"  the white orchid "},options),false);
  assert.equal("headline" in prepareDesignPatch({headline:"THE WHITE ORCHID"},options),false);
  // Real generated copy is untouched.
  assert.equal(prepareDesignPatch({headline:"A morning of music and movement"},options).headline,
    "A morning of music and movement");
  // A generated added element whose text is the brand name is dropped too.
  assert.equal("addTextElement" in prepareDesignPatch({addTextElement:{class:"heading",text:"The White Orchid"}},options),false);
  assert.deepEqual(prepareDesignPatch({addTextElement:{class:"heading",text:"Open house Friday"}},options).addTextElement,
    {class:"heading",text:"Open house Friday"});
});

test("brand-name exclusion never touches owner-typed copy or the off-canvas caption path", () => {
  const options={
    getCopyBudgets:()=>({attribution:64}),
    fitCopy:value=>value,
    brandName:"The White Orchid",
  };
  // Owner-TYPED brand-name copy passes verbatim (authorship check).
  assert.equal(prepareDesignPatch({attribution:"The White Orchid"},{...options,copyAuthors:{attribution:"owner"}}).attribution,
    "The White Orchid");
  // A direct UI edit (uiSource) returns early — brand name is the owner's to type.
  assert.equal(prepareDesignPatch({attribution:"The White Orchid"},{...options,uiSource:true}).attribution,
    "The White Orchid");
  // The off-canvas caption writer never passes brandName through this boundary, so with
  // no brandName the field is untouched (the caption writer is exempt by construction).
  assert.equal(prepareDesignPatch({attribution:"The White Orchid"},{getCopyBudgets:()=>({attribution:64}),fitCopy:v=>v}).attribution,
    "The White Orchid");
});

test("the copy authorship vocabulary remains explicit and stable", () => {
  assert.deepEqual(COPY_AUTHOR_FIELDS,["headline","subtext","attribution","dateText","microLabel","pillText"]);
});

test("interaction classification identifies continuous patches and layer ownership", () => {
  assert.equal(isContinuousDesignPatch({photoTransform:{zoom:1.2}}),true);
  assert.equal(isContinuousDesignPatch({headline:"New"}),false);
  assert.deepEqual(designPatchInteractionTags({
    headline:"New",
    textColorId:"whiteSmoke",
    logoFree:{x:0.2,y:0.3},
    overlayUpdate:{uid:"shape-a"},
    photoTransform:{zoom:1.2},
  }),["logo","colour","text","overlay","photo"]);
  assert.deepEqual(designPatchInteractionTags({resetFormatToMaster:"story"}),["text","logo","photo","overlay"]);
});

test("completion policy derives history, authorship, selection, and harmonizer state", () => {
  assert.deepEqual(resolveDesignPatchCompletion({
    patch:{headline:"New",logoPosition:"center"},
    appliedFields:["headline","logoPosition"],
    options:{harmonize:true},
  }),{
    clearPhotoSelection:true,
    harmonizer:{armed:true,rounds:0,applied:[],avoidLogoGeo:true},
    authorship:{fields:["headline"],author:"ai"},
    commitHistory:true,
  });
  const ui=resolveDesignPatchCompletion({
    patch:{subtext:"Owner"},appliedFields:["subtext"],
    options:{uiSource:true,amendUndo:true,harmonize:true},
  });
  assert.equal(ui.clearPhotoSelection,false);
  assert.equal(ui.harmonizer,null);
  assert.deepEqual(ui.authorship,{fields:["subtext"],author:"owner"});
  assert.equal(ui.commitHistory,false);
});
