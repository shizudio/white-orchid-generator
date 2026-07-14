import { memo } from "react";

function BackgroundInspectorPanel({options,selectedId,selectedLabel,note,onSelect,opacity,opacityDisabled,onOpacity,moreOpen,onToggleMore,renderShapes,palette:B,fonts:F}){
  return <>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{options.map(option=><button key={option.id} aria-pressed={selectedId===option.id} onClick={()=>onSelect(option.id)} title={option.label} style={{width:36,height:36,borderRadius:"50%",cursor:"pointer",transition:"all 0.15s",background:option.color,transform:selectedId===option.id?"scale(1.15)":"scale(1)",border:selectedId===option.id?`3px solid ${B.burnham}`:`2px solid ${B.ash}66`,boxShadow:selectedId===option.id?"0 0 0 2px #fff inset":"none"}}/>)}</div>
    <div style={{fontSize:12,color:B.ash,marginTop:6,fontFamily:F.subtitle}}>{selectedLabel}</div>
    {note&&<div style={{fontSize:10,color:B.tangerine,marginTop:4,fontFamily:F.body,lineHeight:1.5}}>{note}</div>}
    <button type="button" aria-expanded={moreOpen} onClick={onToggleMore} style={{marginTop:12,padding:0,border:"none",background:"transparent",fontFamily:F.subtitle,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:B.burnham,cursor:"pointer"}}>More options <span aria-hidden="true">{moreOpen?"▴":"▾"}</span></button>
    {moreOpen&&<div style={{marginTop:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8,opacity:opacityDisabled?0.45:1}}><span style={{fontSize:10,color:B.ash,fontFamily:F.body,width:54}}>Opacity</span><input aria-label="Background opacity" type="range" min="0" max="1" step="0.01" value={opacity} disabled={opacityDisabled} onInput={e=>!opacityDisabled&&onOpacity(Number(e.currentTarget.value))} onChange={e=>!opacityDisabled&&onOpacity(Number(e.target.value))} style={{flex:1,accentColor:B.burnham,cursor:opacityDisabled?"not-allowed":"pointer"}}/><span style={{fontSize:10,color:B.ash,fontFamily:F.body,width:34,textAlign:"right"}}>{Math.round(opacity*100)}%</span></div>
      {opacityDisabled?<div style={{fontSize:10,color:B.ash,marginTop:4,fontFamily:F.body,lineHeight:1.5}}>The photo fills this layout, so the background sits behind it — opacity has no visible effect here.</div>:opacity<0.999&&<div style={{fontSize:10,color:B.ash,marginTop:4,fontFamily:F.body,lineHeight:1.5}}>Transparent background exports as a PNG with alpha (JPEG flattens to white).</div>}
      <div style={{height:16}}/>{renderShapes?.()}
    </div>}
  </>;
}

export default memo(BackgroundInspectorPanel);
