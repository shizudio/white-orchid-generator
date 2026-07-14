import test from "node:test";
import assert from "node:assert/strict";
import { scheduleIdleWork } from "../../lib/idle-work-queue.mjs";

test("idle queue preserves order and completes once", () => {
  const jobs=[]; let id=0;
  const env={requestIdleCallback:fn=>{jobs.push(fn);return ++id;},cancelIdleCallback:()=>{}};
  const seen=[];let completed=0;
  scheduleIdleWork([1,2,3],x=>seen.push(x),()=>completed++,env);
  while(jobs.length)jobs.shift()({timeRemaining:()=>0});
  assert.deepEqual(seen,[1,2,3]);
  assert.equal(completed,1);
});

test("cancellation prevents queued work", () => {
  const jobs=[];
  const env={setTimeout:fn=>{jobs.push(fn);return 1;},clearTimeout:()=>{}};
  const seen=[];
  const cancel=scheduleIdleWork([1],x=>seen.push(x),null,env);
  cancel(); jobs.shift()?.();
  assert.deepEqual(seen,[]);
});
