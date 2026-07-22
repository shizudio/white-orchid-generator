import test from "node:test";
import assert from "node:assert/strict";
import {
  clampNormalizedRoleBox,
  projectBleedBox,
  resolveLogoPlacementBase,
  resolveRoleOffsetsForFormat,
  resolveTextSafeMargins,
} from "../../lib/format-placement-policy.mjs";

const masterFormatId = "ig_square";
const defaults = {
  ig_square:{ position:"bottom-center", sizeId:"m" },
  story:{ position:"top-right", sizeId:"s" },
  banner:{ position:"mid-right", sizeId:"s" },
};
const defaultPlacementForFormat = formatId => defaults[formatId];

test("role offsets inherit from master until a format override exists", () => {
  const offsetsByFormat = {
    ig_square:{ event:{ date:{ dx:0.1, dy:0.2 } } },
    story:{ event:{ date:{ dx:-0.1, dy:0.4 } } },
  };

  assert.deepEqual(resolveRoleOffsetsForFormat({
    formatId:"banner", postType:"event", offsetsByFormat, masterFormatId,
  }), { date:{ dx:0.1, dy:0.2 } });
  assert.deepEqual(resolveRoleOffsetsForFormat({
    formatId:"story", postType:"event", offsetsByFormat, masterFormatId,
  }), { date:{ dx:-0.1, dy:0.4 } });
});

test("unpinned logo placements use each format default and remain relocatable", () => {
  const result = resolveLogoPlacementBase({
    formatId:"story",
    postType:"event",
    masterFormatId,
    masterPinned:false,
    placementsByFormat:{},
    masterPosition:"center",
    masterSizeId:"xl",
    defaultPlacementForFormat,
  });

  assert.deepEqual(result, { position:"top-right", sizeId:"s", free:null, explicit:false });
});

test("a master pin is explicit only on master, while format overrides are explicit everywhere", () => {
  const master = resolveLogoPlacementBase({
    formatId:masterFormatId,
    postType:"event",
    masterFormatId,
    masterPinned:true,
    placementsByFormat:{ story:{ position:"bottom-left", sizeId:"m", free:{ x:0.2, y:0.8 } } },
    masterPosition:"center",
    masterSizeId:"l",
    masterFree:{ x:0.5, y:0.5 },
    defaultPlacementForFormat,
  });
  const story = resolveLogoPlacementBase({
    formatId:"story",
    postType:"event",
    masterFormatId,
    masterPinned:true,
    placementsByFormat:{ story:{ position:"bottom-left", sizeId:"m", free:{ x:0.2, y:0.8 } } },
    masterPosition:"center",
    masterSizeId:"l",
    defaultPlacementForFormat,
  });
  const banner = resolveLogoPlacementBase({
    formatId:"banner",
    postType:"event",
    masterFormatId,
    masterPinned:true,
    placementsByFormat:{},
    masterPosition:"center",
    masterSizeId:"l",
    defaultPlacementForFormat,
  });

  assert.deepEqual(master, { position:"center", sizeId:"l", free:{ x:0.5, y:0.5 }, explicit:true });
  assert.deepEqual(story, { position:"bottom-left", sizeId:"m", free:{ x:0.2, y:0.8 }, explicit:true });
  assert.deepEqual(banner, { position:"mid-right", sizeId:"s", free:null, explicit:false });
});

test("text safe margins merge layout and platform ownership", () => {
  assert.deepEqual(resolveTextSafeMargins(
    { t:0.08,b:0.08,l:0.08,r:0.08 },
    { top:0.13,bottom:0.15,left:0,right:0.1 },
  ), { t:0.13,b:0.15,l:0.08,r:0.1 });
});

test("normalized role boxes clamp to the effective safe rectangle", () => {
  const result=clampNormalizedRoleBox(
    { x:-0.1,y:0.95,w:1.2,h:0.01 },
    { width:1000,height:2000,safe:{ t:0.1,b:0.15,l:0.08,r:0.08 } },
  );
  assert.deepEqual({x:result.x,y:result.y,h:result.h},{x:80,y:1640,h:60});
  assert.ok(Math.abs(result.w-840)<1e-9);
});

test("photo boxes bleed only edges explicitly authored at the frame", () => {
  assert.deepEqual(projectBleedBox(
    { x:0.01,y:0.2,w:0.5,h:0.79 },
    { width:1000,height:500 },
  ), { x:0,y:100,w:510,h:400 });
});
