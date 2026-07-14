import { memo } from "react";
import MidjourneyLauncher from "./MidjourneyLauncher";

const pill=(on,B)=>({padding:"8px 13px",minHeight:36,borderRadius:40,border:`1.5px solid ${on?B.burnham:B.ash+"66"}`,background:on?B.burnham:"transparent",color:on?B.whiteSmoke:B.jet,fontSize:11,fontWeight:600,cursor:"pointer"});
const quick=(B,F)=>({padding:"6px 11px",borderRadius:7,border:`1.5px solid ${B.ash}44`,background:"#fff",color:B.jet,fontFamily:F.subtitle,fontSize:11,fontWeight:600,cursor:"pointer",letterSpacing:0.3,whiteSpace:"nowrap"});

function MediaInspectorPanel({kind,onKind,onLibrary,onUpload,hasMedia,moreOpen,onToggleMore,samples,currentSource,onSource,onPhotoPatch,onPhotoSelect,palette:B,fonts:F}){
  if(kind!=="image")return <><div style={{display:"flex",gap:6,marginBottom:10}}>{["image","video"].map(value=><button key={value} aria-pressed={kind===value} onClick={()=>onKind(value)} style={{...pill(kind===value,B),fontFamily:F.subtitle}}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div><div style={{fontSize:12,color:B.jet,fontFamily:F.body,lineHeight:1.6,padding:"6px 2px"}}>Video is coming soon — you’ll be able to make short clips in the same brand style once video export is ready.</div></>;
  return <>
    <div style={{display:"flex",gap:6}}><button onClick={onLibrary} style={{flex:1,padding:"8px 12px",background:"transparent",border:`1.5px solid ${B.burnham}44`,borderRadius:8,cursor:"pointer",fontFamily:F.subtitle,fontSize:12,fontWeight:600,color:B.burnham,letterSpacing:0.5}}>📂 Library</button><button onClick={onUpload} style={{flex:1,padding:"8px 12px",background:B.burnham,border:"none",borderRadius:8,cursor:"pointer",fontFamily:F.subtitle,fontSize:12,fontWeight:700,color:"#fff",letterSpacing:0.5}}>＋ Upload</button></div>
    {hasMedia&&<div id="canvas-help" className="generator-help-text" style={{fontSize:11,color:B.ash,marginTop:8,fontFamily:F.body,lineHeight:1.5}}>Select the preview to resize, rotate, or move the image. Keyboard: arrows move, +/− zoom, and [ ] rotate.</div>}
    <button type="button" aria-expanded={moreOpen} onClick={onToggleMore} style={{marginTop:12,padding:0,border:"none",background:"transparent",fontFamily:F.subtitle,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:B.burnham,cursor:"pointer"}}>More options <span aria-hidden="true">{moreOpen?"▴":"▾"}</span></button>
    {moreOpen&&<div style={{marginTop:10}}>
      <div style={{display:"flex",gap:6,marginBottom:10}}>{["image","video"].map(value=><button key={value} aria-pressed={kind===value} onClick={()=>onKind(value)} style={{...pill(kind===value,B),fontFamily:F.subtitle}}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div>
      <div style={{fontSize:10,color:B.ash,fontFamily:F.subtitle,fontWeight:600,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Sample photos</div>
      <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:10}}>{samples.map((sample,index)=><button key={index} onClick={()=>onSource(sample.full)} style={{flexShrink:0,width:48,height:48,borderRadius:6,border:currentSource===sample.full?`2px solid ${B.burnham}`:"2px solid transparent",padding:0,cursor:"pointer",overflow:"hidden",background:"none"}} title={sample.label}><img src={sample.thumb} alt={sample.label} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",borderRadius:4}}/></button>)}</div>
      <MidjourneyLauncher/>
      {hasMedia&&<><div style={{fontSize:10,color:B.ash,fontFamily:F.subtitle,fontWeight:600,letterSpacing:1,textTransform:"uppercase",margin:"12px 0 6px"}}>Quick position</div><div style={{display:"flex",gap:5,flexWrap:"wrap"}}><button onClick={()=>{onPhotoSelect();onPhotoPatch({cx:0.5,cy:0.5});}} style={quick(B,F)}>⊕ Center</button><button onClick={()=>{onPhotoSelect();onPhotoPatch({zoom:0.5});}} style={quick(B,F)}>50%</button><button onClick={()=>{onPhotoSelect();onPhotoPatch({zoom:0.75});}} style={quick(B,F)}>75%</button><button onClick={()=>{onPhotoSelect();onPhotoPatch({zoom:1,cx:0.5,cy:0.5});}} style={quick(B,F)}>Fill</button><button onClick={()=>onPhotoPatch({rotation:0})} style={quick(B,F)}>0°</button></div></>}
    </div>}
  </>;
}

export default memo(MediaInspectorPanel);
