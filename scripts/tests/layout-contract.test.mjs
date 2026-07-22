import test from "node:test";
import assert from "node:assert/strict";
import {
  LAYOUT_MEDIA_MODELS,
  LAYOUT_RELATION_TYPES,
  LAYOUT_ZONE_KINDS,
  createLayoutCapability,
  deriveLayoutCapability,
  validateLayoutCapability,
} from "../../lib/layout-contract.mjs";

test("layout capability derives named content, media, structure, and mark zones", () => {
  const capability = deriveLayoutCapability({
    headline:"Learn boldly",
    subtext:"A thoughtful programme.",
    image:"/photo.jpg",
    selectedLogoId:"p1-green",
    overlayLayers:[{uid:"frame-a",assetId:"shape-1",mode:"frame",master:{x:0.7,y:0.5,scale:0.5}}],
    typeLayouts:{photo_logo:{roles:{hero:{x:0.08,y:0.18,w:0.55,h:0.22},support:{x:0.08,y:0.48,w:0.5,h:0.12}}}},
    postType:"photo_logo",
  }, "ig_square");
  assert.equal(capability.mediaModel,LAYOUT_MEDIA_MODELS.SHAPE_FRAME);
  assert.equal(capability.mediaHostShapeId,"frame-a");
  assert.ok(capability.zones.some(zone=>zone.id==="content:hero"&&zone.kind===LAYOUT_ZONE_KINDS.CONTENT&&zone.required));
  assert.ok(capability.zones.some(zone=>zone.id==="media:primary"&&zone.kind===LAYOUT_ZONE_KINDS.MEDIA));
  assert.ok(capability.zones.some(zone=>zone.id==="structural:frame-a"&&zone.kind===LAYOUT_ZONE_KINDS.STRUCTURAL));
  assert.ok(capability.zones.some(zone=>zone.id==="mark:primary"&&zone.kind===LAYOUT_ZONE_KINDS.MARK));
  assert.ok(capability.relations.some(relation=>relation.type===LAYOUT_RELATION_TYPES.CONTAINS));
  assert.equal(validateLayoutCapability(capability).valid,true);
  assert.equal(Object.isFrozen(capability),true);
});

test("format-specific role geometry produces a distinct derived capability", () => {
  const source={
    headline:"One idea",
    postType:"text_post",
    typeLayouts:{text_post:{roles:{hero:{x:0.1,y:0.2,w:0.8,h:0.2}}}},
    typeLayoutsByDim:{story:{text_post:{roles:{hero:{x:0.12,y:0.3,w:0.76,h:0.18}}}}},
  };
  const master=deriveLayoutCapability(source,"ig_square");
  const story=deriveLayoutCapability(source,"story");
  assert.deepEqual(master.zones.find(zone=>zone.id==="content:hero").geometry.rect,{x:0.1,y:0.2,w:0.8,h:0.2});
  assert.deepEqual(story.zones.find(zone=>zone.id==="content:hero").geometry.rect,{x:0.12,y:0.3,w:0.76,h:0.18});
});

test("layout validation rejects missing relation targets and out-of-bounds zones", () => {
  const invalid=createLayoutCapability({
    dimensionId:"story",
    zones:[{id:"content:hero",kind:"content",geometry:{type:"rect",rect:{x:0.9,y:0.1,w:0.3,h:0.2}}}],
    relations:[{id:"broken",type:"clears",from:"content:hero",to:"mark:missing"}],
  });
  const result=validateLayoutCapability(invalid);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(error=>error.includes("outside normalized bounds")));
  assert.ok(result.errors.some(error=>error.includes("missing zone")));
});

test("platform action bands become protected zones with explicit avoidance", () => {
  const capability=deriveLayoutCapability({
    headline:"Story headline",
    selectedLogoId:"p1-green",
    postType:"photo_logo",
    typeLayouts:{photo_logo:{roles:{hero:{x:0.1,y:0.2,w:0.8,h:0.2}}}},
  },"story",{platformSafeByDimension:{story:{top:0.12,bottom:0.18}}});
  const top=capability.zones.find(zone=>zone.id==="protected:platform-top");
  const bottom=capability.zones.find(zone=>zone.id==="protected:platform-bottom");
  assert.equal(top.kind,LAYOUT_ZONE_KINDS.PROTECTED);
  assert.deepEqual(bottom.geometry.rect,{x:0,y:0.82,w:1,h:0.18});
  assert.ok(capability.relations.some(relation=>relation.type===LAYOUT_RELATION_TYPES.AVOIDS&&relation.from==="content:hero"&&relation.to===top.id));
  assert.ok(capability.relations.some(relation=>relation.type===LAYOUT_RELATION_TYPES.AVOIDS&&relation.from==="mark:primary"&&relation.to===bottom.id));
  assert.equal(validateLayoutCapability(capability).valid,true);
});

test("content without stored layout geometry still receives measurable semantic zones", () => {
  const capability=deriveLayoutCapability({
    headline:"A live-rendered headline",
    subtext:"Supporting copy",
    selectedLogoId:"p1-green",
    postType:"photo_logo",
  },"story",{platformSafeByDimension:{story:{top:0.13,bottom:0.13}}});
  const hero=capability.zones.find(zone=>zone.id==="content:hero");
  const support=capability.zones.find(zone=>zone.id==="content:support");
  assert.equal(hero.geometry.type,"unconstrained");
  assert.equal(support.geometry.type,"unconstrained");
  assert.ok(capability.relations.some(relation=>relation.from==="mark:primary"&&relation.to==="content:hero"));
  assert.ok(capability.relations.some(relation=>relation.from==="content:hero"&&relation.to==="protected:platform-top"));
});

test("media and structural shapes create subject and surface-boundary contracts", () => {
  const capability=deriveLayoutCapability({
    headline:"Protect the subject",
    image:"/photo.jpg",
    selectedLogoId:"p1-green",
    overlayLayers:[
      {uid:"frame-a",assetId:"shape-1",mode:"frame",master:{x:0.5,y:0.5,scale:0.7}},
      {uid:"panel-a",assetId:"shape-2",mode:"overlay",origin:"layout",role:"content-panel",structural:true,master:{x:0.2,y:0.5,scale:0.3}},
    ],
    postType:"photo_logo",
  },"ig_square");
  assert.ok(capability.zones.some(zone=>zone.id==="protected:media-subject"&&zone.surface==="media"));
  assert.ok(capability.zones.some(zone=>zone.id==="structural:panel-a"));
  assert.ok(capability.relations.some(relation=>relation.type===LAYOUT_RELATION_TYPES.DOES_NOT_STRADDLE));
  assert.ok(capability.relations.some(relation=>relation.from==="mark:primary"&&relation.to==="protected:media-subject"));
});

test("shape-framed media emits one structural seam relation per source", () => {
  const capability=deriveLayoutCapability({
    headline:"One seam rule",
    image:"/photo.jpg",
    overlayLayers:[{uid:"frame-a",assetId:"shape-1",mode:"frame",master:{x:0.5,y:0.5,scale:0.7}}],
    postType:"photo_logo",
  },"ig_square");
  const heroSeams=capability.relations.filter(relation=>
    relation.type===LAYOUT_RELATION_TYPES.DOES_NOT_STRADDLE&&relation.from==="content:hero"
  );
  assert.equal(heroSeams.length,1);
  assert.equal(heroSeams[0].to,"structural:frame-a");
});

test("non-structural shapes become decoration zones that yield to meaning", () => {
  const capability=deriveLayoutCapability({
    headline:"Keep this readable",image:"/photo.jpg",selectedLogoId:"p1-green",postType:"photo_logo",
    overlayLayers:[{uid:"arrow-a",assetId:"acc-arrow",mode:"overlay",role:"icon",master:{x:0.5,y:0.5,scale:0.2}}],
  },"ig_square");
  assert.ok(capability.zones.some(zone=>zone.id==="decoration:arrow-a"&&zone.kind===LAYOUT_ZONE_KINDS.DECORATION));
  assert.ok(capability.relations.some(relation=>relation.from==="decoration:arrow-a"&&relation.to==="content:hero"));
  assert.ok(capability.relations.some(relation=>relation.from==="decoration:arrow-a"&&relation.to==="mark:primary"));
  assert.ok(capability.relations.some(relation=>relation.from==="decoration:arrow-a"&&relation.to==="protected:media-subject"));
});
