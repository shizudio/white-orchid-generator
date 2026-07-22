import test from "node:test";
import assert from "node:assert/strict";
import {decorationGridIntersectsRect,decorationPaintFraction,shapeGridStraddlesRect} from "../../lib/decoration-paint-intersection.mjs";

const grid=(size,painted=[])=>{
  const alpha=new Uint8ClampedArray(size*size*4);
  for(const [x,y,a=255] of painted)alpha[(y*size+x)*4+3]=a;
  return {size,alpha};
};

test("a hollow decoration does not collide through its transparent centre",()=>{
  const ring=grid(10,[[0,0],[9,0],[0,9],[9,9]]);
  const shape={bounds:{x:0,y:0,w:100,h:100},transform:{rotation:0}};
  assert.equal(decorationGridIntersectsRect(ring,shape,{x:35,y:35,w:30,h:30},{samples:10}),false);
});

test("visible decoration paint collides and unreadable alpha falls back conservatively",()=>{
  const solid=grid(10,[[5,5]]);
  const shape={bounds:{x:0,y:0,w:100,h:100},transform:{rotation:0}};
  assert.equal(decorationGridIntersectsRect(solid,shape,{x:50,y:50,w:10,h:10},{samples:10}),true);
  assert.equal(decorationGridIntersectsRect(null,shape,{x:50,y:50,w:10,h:10}),true);
});

test("non-overlapping bounds never collide",()=>{
  const shape={bounds:{x:0,y:0,w:100,h:100},transform:{rotation:45}};
  assert.equal(decorationGridIntersectsRect(grid(4,[[0,0]]),shape,{x:200,y:200,w:20,h:20}),false);
});

test("paint coverage measures visible alpha instead of the whole asset box",()=>{
  const alpha=new Uint8ClampedArray(4*4*4);
  alpha[3]=255;alpha[7]=255;alpha[11]=255;alpha[15]=255;
  assert.equal(decorationPaintFraction({size:4,alpha}),0.25);
});

test("structural seams require both painted and unpainted samples",()=>{
  const alpha=new Uint8ClampedArray(4*4*4);
  for(let y=0;y<4;y++)for(let x=2;x<4;x++)alpha[(y*4+x)*4+3]=255;
  const alphaGrid={size:4,alpha};
  const shape={bounds:{x:0,y:0,w:100,h:100},transform:{rotation:0}};
  assert.equal(shapeGridStraddlesRect(alphaGrid,shape,{x:4,y:10,w:36,h:70}),false,"transparent AABB corner is not a seam");
  assert.equal(shapeGridStraddlesRect(alphaGrid,shape,{x:60,y:10,w:30,h:70}),false,"content fully on the painted surface is not a seam");
  assert.equal(shapeGridStraddlesRect(alphaGrid,shape,{x:35,y:10,w:40,h:70}),true,"content spanning the alpha boundary is a seam");
  assert.equal(shapeGridStraddlesRect(null,shape,{x:35,y:10,w:40,h:70}),null,"missing pixels retain the geometry fallback");
});
