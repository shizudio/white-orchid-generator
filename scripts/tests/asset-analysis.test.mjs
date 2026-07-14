import test from "node:test";
import assert from "node:assert/strict";
import { createAssetAnalysisCache } from "../../lib/asset-analysis.mjs";

test("decoded asset analysis runs once per asset identity", () => {
  const cache=createAssetAnalysisCache();
  const first={},second={};let calls=0;
  const analyze=asset=>({asset,calls:++calls});
  assert.equal(cache.get(first,analyze),cache.get(first,analyze));
  assert.notEqual(cache.get(first,analyze),cache.get(second,analyze));
  assert.equal(calls,2);
  cache.invalidate(first);
  cache.get(first,analyze);
  assert.equal(calls,3);
});

