import test from "node:test";
import assert from "node:assert/strict";
import { createDesignDocumentV1 } from "../../lib/design-document.mjs";
import { createDesignHistorySnapshot, createNewPostHistorySnapshot, planDesignHistoryStep, planManualEditBurstStep } from "../../lib/design-history.mjs";

test("history snapshots contain one canonical document and minimal view context", () => {
  const document=createDesignDocumentV1({
    headline:"Curiosity grows here",
    selectedLogoId:"s1-ivory",
    overlayLayers:[{uid:"shape-a",assetId:"shape-1",master:{x:0.5,y:0.5}}],
  });
  const snapshot=createDesignHistorySnapshot({designDocument:document,dimensionId:"story"});

  assert.deepEqual(Object.keys(snapshot).sort(),["designDocument","dimensionId","markTab"]);
  assert.equal(snapshot.designDocument.content.headline,"Curiosity grows here");
  assert.equal(snapshot.dimensionId,"story");
  assert.equal(snapshot.markTab,"secondary");
});

test("history snapshots are detached from subsequent document mutations", () => {
  const document=createDesignDocumentV1({headline:"Before"});
  const snapshot=createDesignHistorySnapshot({designDocument:document,markTab:"primary"});
  document.content.headline="After";

  assert.equal(snapshot.designDocument.content.headline,"Before");
  assert.notEqual(snapshot.designDocument,document);
  assert.notEqual(snapshot.designDocument.content,document.content);
});

test("new-post history starts canonical without emitting a legacy flat snapshot", () => {
  const snapshot=createNewPostHistorySnapshot({
    typeLayouts:{photo_logo:{x:0.1,y:0.2,width:0.8}},
    fontSizes:{photo_logo:{headline:44}},
    defaultImage:"/sample.jpg",
  });

  assert.equal(snapshot.designDocument.schemaVersion,1);
  assert.equal(snapshot.designDocument.composition.postType,"photo_logo");
  assert.equal(snapshot.designDocument.content.headline,"");
  assert.equal(snapshot.designDocument.media.source,"/sample.jpg");
  assert.deepEqual(snapshot.designDocument.shapes,[]);
  assert.deepEqual(snapshot.designDocument.typography.fontSizes,{photo_logo:{headline:44}});
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot,"headline"),false);
});

test("history traversal plans one bounded stack step",()=>{
  const step=planDesignHistoryStep({stack:["previous","older"],currentSnapshot:"current",depth:5});
  assert.deepEqual(step,{snapshotToRestore:"previous",remainingStack:["older"],oppositeEntry:"current",depth:5});
  assert.equal(planDesignHistoryStep({stack:[],currentSnapshot:"current"}),null);
});

test("burst opens a new undo entry for the first edit of a burst",()=>{
  const plan=planManualEditBurstStep({pending:false,touchedTags:[],tags:["text"]});
  assert.equal(plan.startNewEntry,true);
  assert.deepEqual(plan.nextTouched,["text"]);
});

test("burst folds a continuation that shares an interaction kind (typing, dragging)",()=>{
  // typing a heading: patch after patch tagged "text" collapses into ONE undo entry
  const plan=planManualEditBurstStep({pending:true,touchedTags:["text"],tags:["text"]});
  assert.equal(plan.startNewEntry,false);
  assert.deepEqual(plan.nextTouched,["text"]);
});

test("burst splits a distinct-kind action landing inside the debounce window",()=>{
  // BUG 1: a colour pick right after a headline edit must be its own undo step,
  // not folded away — otherwise quick distinct edits read as "undo only works once".
  const plan=planManualEditBurstStep({pending:true,touchedTags:["text"],tags:["colour"]});
  assert.equal(plan.startNewEntry,true);
  assert.deepEqual(plan.nextTouched,["colour"]);
});

test("burst treats a multi-kind edit that overlaps the open burst as a continuation",()=>{
  const plan=planManualEditBurstStep({pending:true,touchedTags:["text"],tags:["text","photo"]});
  assert.equal(plan.startNewEntry,false);
  assert.deepEqual(plan.nextTouched.sort(),["photo","text"]);
});

test("burst never splits on an untagged edit",()=>{
  const plan=planManualEditBurstStep({pending:true,touchedTags:["colour"],tags:[]});
  assert.equal(plan.startNewEntry,false);
  assert.deepEqual(plan.nextTouched,["colour"]);
});

test("a five distinct-action sequence yields five undo entries",()=>{
  // Simulate the client repro: five distinct edits inside one debounce window.
  const sequence=[["text"],["colour"],["logo"],["photo"],["overlay"]];
  let pending=false;
  let touched=[];
  let entries=0;
  for(const tags of sequence){
    const plan=planManualEditBurstStep({pending,touchedTags:touched,tags});
    if(plan.startNewEntry)entries++;
    pending=true;
    touched=plan.nextTouched;
  }
  assert.equal(entries,5);
});
