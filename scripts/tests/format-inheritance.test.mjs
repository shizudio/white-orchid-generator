import test from "node:test";
import assert from "node:assert/strict";
import { hasInheritedOverride, resetInheritedFormat, resolveInheritedValue, setInheritedValue } from "../../lib/format-inheritance.mjs";

test("inheritance resolves override, master, and derived values deterministically", () => {
  const state={master:{x:1},byFormat:{story:{x:2}}};
  assert.deepEqual(resolveInheritedValue(state,"story","square",()=>({x:3})),{value:{x:2},source:"override"});
  assert.deepEqual(resolveInheritedValue(state,"square","square",()=>({x:3})),{value:{x:1},source:"master"});
  assert.deepEqual(resolveInheritedValue(state,"banner","square",m=>({x:m.x+2})),{value:{x:3},source:"derived"});
});

test("writes target master or one format and reset restores inheritance", () => {
  const master=setInheritedValue({master:1,byFormat:{}},"square","square",2);
  const story=setInheritedValue(master,"story","square",3);
  assert.equal(story.master,2);
  assert.equal(hasInheritedOverride(story,"story","square"),true);
  assert.deepEqual(resetInheritedFormat(story,"story","square"),{master:2,byFormat:{}});
});
