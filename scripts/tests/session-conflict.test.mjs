import test from "node:test";
import assert from "node:assert/strict";
import { resolveSessionConflict } from "../../lib/sessions.js";

test("session conflicts prefer revision, then timestamp, then deterministic payload", () => {
  const local={state:{metadata:{revision:3},document:{content:{headline:"Local"}}},updatedAt:100};
  const cloud={state:{metadata:{revision:2},document:{content:{headline:"Cloud"}}},updated_at:new Date(1000).toISOString()};
  assert.equal(resolveSessionConflict(local,cloud),local);
  const sameRevision={...cloud,state:{...cloud.state,metadata:{revision:3}}};
  assert.equal(resolveSessionConflict(local,sameRevision),sameRevision);
  const a={state:{metadata:{revision:1},document:{value:"a"}},updatedAt:10};
  const b={state:{metadata:{revision:1},document:{value:"b"}},updatedAt:10};
  assert.equal(resolveSessionConflict(a,b),b);
});
