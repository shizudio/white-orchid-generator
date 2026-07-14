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
