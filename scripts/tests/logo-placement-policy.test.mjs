import test from "node:test";
import assert from "node:assert/strict";
import {LOGO_PAD,LOGO_POSITIONS,LOGO_SIZES,logoCenter} from "../../lib/logo-placement-policy.mjs";

test("named anchors preserve intrinsic edge clear space",()=>{
  const width=1080,height=1350,size=LOGO_SIZES.find(item=>item.id==="m").pct*width;
  const [x,y]=logoCenter(LOGO_POSITIONS["bottom-right"],width,height,size,null);
  assert.equal(width-(x+size/2),LOGO_PAD*width);
  assert.equal(height-(y+size/2),LOGO_PAD*width);
});

test("Story anchors clear platform action bands plus breathing room",()=>{
  const width=1080,height=1920,size=LOGO_SIZES[0].pct*width;
  const safe={top:0.13,bottom:0.13,left:0,right:0};
  const [,topY]=logoCenter(LOGO_POSITIONS["top-left"],width,height,size,safe);
  const [,bottomY]=logoCenter(LOGO_POSITIONS["bottom-right"],width,height,size,safe);
  assert.ok(topY-size/2>=(safe.top+0.015)*height-0.001);
  assert.ok(bottomY+size/2<=(1-safe.bottom-0.015)*height+0.001);
});

test("centre anchors remain centred regardless of safe edge bands",()=>{
  assert.deepEqual(logoCenter(LOGO_POSITIONS.center,1000,1200,200,{top:0.2,bottom:0.2}),[500,600]);
});
