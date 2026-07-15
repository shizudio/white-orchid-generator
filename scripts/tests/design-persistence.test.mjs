import test from "node:test";
import assert from "node:assert/strict";
import { createPersistedDesignPayload, readPersistedDesignPayload, migratePersistedDesignCollection } from "../../lib/design-persistence.mjs";

test("canonical persistence stores only document and view metadata", () => {
  const payload=createPersistedDesignPayload({headline:"Grow curious",overlayLayers:[{uid:"shape-7",assetId:"petal",master:{x:0.5,y:0.5}}]},{dimensionId:"story",exportFormat:"jpeg"},{"ack-1":{issueId:"contrast"}});
  assert.deepEqual(Object.keys(payload).sort(),["document","metadata","persistenceVersion"]);
  assert.equal(payload.document.shapes[0].uid,"shape-7");
  const restored=readPersistedDesignPayload(payload);
  assert.equal(restored.document.content.headline,"Grow curious");
  assert.deepEqual(restored.metadata,{dimensionId:"story",exportFormat:"jpeg",revision:1});
  assert.equal(restored.acknowledgements["ack-1"].issueId,"contrast");
});

test("legacy flat saves migrate through the same persistence reader", () => {
  const restored=readPersistedDesignPayload({headline:"Legacy",dimensionId:"ig_square",acks:{old:{issueId:"safe"}}});
  assert.equal(restored.document.content.headline,"Legacy");
  assert.equal(restored.metadata.dimensionId,"ig_square");
  assert.equal(restored.acknowledgements.old.issueId,"safe");
});

test("collection rollout retains exact legacy rollback records and telemetry", () => {
  const legacy={id:"old",state:{headline:"Legacy"}};
  const current={id:"new",state:createPersistedDesignPayload({content:{headline:"Current"}})};
  const result=migratePersistedDesignCollection([legacy,current]);
  assert.equal(result.telemetry.attempted,1);
  assert.equal(result.telemetry.succeeded,1);
  assert.equal(result.telemetry.alreadyCurrent,1);
  assert.deepEqual(result.backups,[legacy]);
  assert.equal(result.migrated[0].state.persistenceVersion,1);
});

// ── (2026-07-15) stored-stump cleanup adapter ────────────────────────────────
import { repairStoredCopyStumps, repairStumpText, isDanglingStump } from "../../lib/design-persistence.mjs";

const stumpDoc=(fields,authorship)=>({content:{headline:"",subtext:"",attribution:"",dateText:"",microLabel:null,pillText:null,...fields,authorship},composition:{}});

test("stump repair trims an AI-authored dangling function word back to the last complete phrase", () => {
  const doc=stumpDoc({subtext:"Join us for a week of creativity and"},{subtext:"ai"});
  const out=repairStoredCopyStumps(doc);
  assert.equal(out.content.subtext,"Join us for a week of creativity");
});

test("stump repair strips stacked function words and dangling separators", () => {
  assert.equal(repairStumpText("A celebration of songs, stories, and of the"),"A celebration of songs, stories");
});

test("owner-typed and authorship-less copy is NEVER altered (law 5)", () => {
  const owner=stumpDoc({headline:"We are proud of our children and"},{headline:"owner"});
  assert.equal(repairStoredCopyStumps(owner),owner);
  const unknown=stumpDoc({headline:"We are proud of our children and"},{});
  assert.equal(repairStoredCopyStumps(unknown),unknown);
});

test("clean-ending and non-stump copy passes through untouched", () => {
  const clean=stumpDoc({headline:"Welcome back to school."},{headline:"ai"});
  assert.equal(repairStoredCopyStumps(clean),clean);
  assert.equal(isDanglingStump("Welcome back to school."),false);
  assert.equal(isDanglingStump("A bright new term"),false); // ends on a content word
});

test("a stump too thin to repair is left stored (advisor surfaces it) — never deleted", () => {
  const thin=stumpDoc({dateText:"On the of"},{dateText:"ai"});
  const out=repairStoredCopyStumps(thin);
  assert.equal(out.content.dateText,"On the of");   // untouched — copy-stump finding fires instead
  assert.equal(repairStumpText("On the of"),null);
});

test("the repair adapter is idempotent and runs inside readPersistedDesignPayload", () => {
  const payload=createPersistedDesignPayload({headline:"Come celebrate a week of art and",copyAuthors:{headline:"ai"}});
  const once=readPersistedDesignPayload(payload);
  assert.equal(once.document.content.headline,"Come celebrate a week of art");
  const twice=readPersistedDesignPayload(createPersistedDesignPayload(once.document));
  assert.equal(twice.document.content.headline,"Come celebrate a week of art");
});
