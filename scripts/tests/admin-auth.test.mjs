import test from "node:test";
import assert from "node:assert/strict";
import { requireAdminKey, ADMIN_KEY_HEADER } from "../../lib/admin-auth.js";

const KEY = "11111111-2222-3333-4444-555555555555";
const req = (headers = {}) => new Request("http://local/api/x", { method: "POST", headers });

// Fail CLOSED: with WO_ADMIN_KEY unset the gate can never be satisfied, so the
// route is unavailable (503 {configured:false}) — NEVER silently open.
test("unconfigured env → 503 {configured:false}, never open", async () => {
  delete process.env.WO_ADMIN_KEY;
  const res = requireAdminKey(req({ [ADMIN_KEY_HEADER]: KEY }));
  assert.ok(res, "expected a Response, not null (must not pass through)");
  assert.equal(res.status, 503);
  assert.equal((await res.json()).configured, false);
});

test("configured but header absent → 403", async () => {
  process.env.WO_ADMIN_KEY = KEY;
  const res = requireAdminKey(req());
  assert.ok(res);
  assert.equal(res.status, 403);
  delete process.env.WO_ADMIN_KEY;
});

test("configured but header wrong → 403", async () => {
  process.env.WO_ADMIN_KEY = KEY;
  const res = requireAdminKey(req({ [ADMIN_KEY_HEADER]: "nope" }));
  assert.ok(res);
  assert.equal(res.status, 403);
  delete process.env.WO_ADMIN_KEY;
});

test("configured and header correct → null (caller proceeds)", () => {
  process.env.WO_ADMIN_KEY = KEY;
  assert.equal(requireAdminKey(req({ [ADMIN_KEY_HEADER]: KEY })), null);
  delete process.env.WO_ADMIN_KEY;
});
