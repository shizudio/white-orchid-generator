import test from "node:test";
import assert from "node:assert/strict";
import {createRenderModel,resolveRenderContentTypography,resolveRenderDecoration,resolveRenderLayout,resolveRenderMediaLogo,resolveRenderSurface} from "../../lib/render-model.mjs";
import {evaluateContentTypographyContract} from "../../lib/content-typography-contract.mjs";
import {evaluateMediaLogoContract} from "../../lib/media-logo-contract.mjs";
import {evaluateLayoutConstraints} from "../../lib/layout-constraints.mjs";
import {evaluateSurfaceContract} from "../../lib/surface-contract.mjs";
import {evaluateDecorationContract} from "../../lib/decoration-contract.mjs";

const FORMATS=["ig_square","ig_portrait","story","facebook","twitter","banner"];
const platformSafeByDimension={
  story:{top:0.13,bottom:0.13,left:0,right:0},
};
const document={
  headline:"Creative learning",
  subtext:"For curious minds aged ten and above.",
  image:"/photo.jpg",
  selectedLogoId:"p1-green",
  postType:"photo_logo",
  typeLayouts:{photo_logo:{roles:{hero:{x:0.08,y:0.20,w:0.6,h:0.14},support:{x:0.08,y:0.40,w:0.6,h:0.10}}}},
};

test("every shipped format derives the same semantic layer contract",()=>{
  const model=createRenderModel({document,dimensionId:FORMATS[0],layoutContext:{platformSafeByDimension}});
  for(const format of FORMATS){
    const layout=resolveRenderLayout(model,format);
    const typography=resolveRenderContentTypography(model,format);
    const mediaLogo=resolveRenderMediaLogo(model,format);
    const surface=resolveRenderSurface(model,format);
    const decoration=resolveRenderDecoration(model,format);
    assert.equal(layout.dimensionId,format);
    assert.equal(typography.dimensionId,format);
    assert.equal(mediaLogo.dimensionId,format);
    assert.equal(surface.dimensionId,format);
    assert.equal(decoration.dimensionId,format);
    assert.ok(layout.zones.some(zone=>zone.id==="content:hero"));
    assert.ok(layout.zones.some(zone=>zone.id==="media:primary"));
    assert.ok(layout.zones.some(zone=>zone.id==="mark:primary"));
    if(format==="story")assert.ok(layout.zones.some(zone=>zone.id==="protected:platform-top"));
  }
});

test("clean measured content passes typography and layout contracts in every format",()=>{
  const model=createRenderModel({document,dimensionId:FORMATS[0],layoutContext:{platformSafeByDimension}});
  for(const format of FORMATS){
    const layout=resolveRenderLayout(model,format);
    const typography=resolveRenderContentTypography(model,format);
    const mediaLogo=resolveRenderMediaLogo(model,format);
    const surface=resolveRenderSurface(model,format);
    const decoration=resolveRenderDecoration(model,format);
    const typeResult=evaluateContentTypographyContract(typography,{
      width:1000,height:1000,
      roleBounds:{hero:{x:80,y:200,w:600,h:140},support:{x:80,y:390,w:600,h:100}},
      textMetrics:{headline:80,subtext:70},
    });
    const layoutResult=evaluateLayoutConstraints(layout,{zoneRects:{
      "content:hero":{x:0.08,y:0.20,w:0.6,h:0.14},
      "content:support":{x:0.08,y:0.39,w:0.6,h:0.10},
      "media:primary":{x:0,y:0,w:1,h:1},
      "mark:primary":{x:0.78,y:0.74,w:0.12,h:0.08},
      "protected:media-subject":{x:0.72,y:0.2,w:0.18,h:0.24},
    }});
    const mediaLogoResult=evaluateMediaLogoContract(mediaLogo,{
      width:1000,height:1000,sourceWidth:1600,sourceHeight:900,
      photoBox:{x:0,y:0,w:1000,h:1000,eff:{zoom:1,cx:0.5,cy:0.5,rotation:0}},
      logoBox:{x:780,y:740,w:120,h:80},logoEvidence:{illegible:false},
    });
    const surfaceResult=evaluateSurfaceContract(surface,{
      resolved:{background:"#173e38",field:"#173e38",text:"#f4f2e7",backdrop:"none"},
      contrast:{min:5,mean:7},
    });
    const decorationResult=evaluateDecorationContract(decoration,{width:1000,height:1000,shapes:[]});
    assert.equal(typeResult.violations.length,0,`${format} typography`);
    assert.equal(mediaLogoResult.violations.length,0,`${format} media/logo`);
    assert.equal(surfaceResult.violations.length,0,`${format} surface`);
    assert.equal(decorationResult.violations.length,0,`${format} decoration`);
    assert.ok(!layoutResult.violations.some(item=>item.ruleId==="format.platform-occlusion"),`${format} safe area`);
  }
});
