import test from "node:test";
import assert from "node:assert/strict";
import { canvasPixelSignature } from "../../lib/canvas-pixel-signature.mjs";

test("canvas pixel signatures are deterministic and region-aware",()=>{
  const calls=[];
  const canvas={width:100,height:80,getContext:()=>({getImageData:(...args)=>{
    calls.push(args);return{data:new Uint8ClampedArray([10,20,30,255,40,50,60,255])};
  }})};
  const first=canvasPixelSignature(canvas,{x:0.1,y:0.25,w:0.5,h:0.5});
  const second=canvasPixelSignature(canvas,{x:0.1,y:0.25,w:0.5,h:0.5});
  assert.equal(first,second);
  assert.deepEqual(calls[0],[10,20,50,40]);
  assert.equal(canvasPixelSignature(null),null);
});
