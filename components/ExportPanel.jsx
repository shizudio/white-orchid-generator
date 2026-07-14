import { memo } from "react";

function ExportPanel({ sizeLabel, format, onFormat, onDownloadAll, onDownloadOne, formatCount, guardrail, readiness, onAudit, palette, fonts }) {
  const B=palette,F=fonts;
  return <>
    <div style={{margin:"4px 0 10px"}}>
      <div style={{fontSize:10,fontFamily:F.subtitle,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:B.burnham}}>Export</div>
      <div style={{fontSize:11,fontFamily:F.body,color:B.jet,lineHeight:1.5,marginTop:3}}>{sizeLabel}</div>
    </div>
    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10}}>
      <div style={{display:"flex",gap:6,flex:1}}>{[{id:"png",label:"PNG"},{id:"jpeg",label:"JPG"}].map(item=><button key={item.id} aria-pressed={format===item.id} onClick={()=>onFormat(item.id)} style={{flex:1,padding:8,borderRadius:8,border:`1px solid ${format===item.id?B.burnham:B.ash+"33"}`,background:format===item.id?B.burnham:"#fff",color:format===item.id?"#fff":B.jet,fontFamily:F.subtitle,fontSize:11,fontWeight:600,letterSpacing:1,cursor:"pointer"}}>{item.label}</button>)}</div>
      {guardrail}
    </div>
    <button onClick={onDownloadAll} title={`Export all ${formatCount} formats as ${format.toUpperCase()}`} style={{width:"100%",padding:"13px 40px",background:B.tangerine,color:"#fff",border:"none",borderRadius:40,fontSize:13,fontWeight:600,cursor:"pointer",letterSpacing:2,textTransform:"uppercase",fontFamily:F.subtitle}}>Download all {formatCount} formats</button>
    <button onClick={onDownloadOne} title={`Download only this format as ${format.toUpperCase()}`} style={{width:"100%",padding:"10px 40px",marginTop:8,background:"transparent",color:B.burnham,border:`1px solid ${B.burnham}44`,borderRadius:40,fontSize:11,fontWeight:600,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase",fontFamily:F.subtitle}}>Just this one</button>
    {readiness}
    <div style={{display:"flex",gap:8,marginTop:14}}><button onClick={onAudit} title="Review this design for on-brand polish" style={{flex:1,padding:"10px 8px",background:"transparent",color:B.burnham,border:`1px solid ${B.burnham}44`,borderRadius:40,fontSize:11,fontWeight:600,cursor:"pointer",letterSpacing:1.2,textTransform:"uppercase",fontFamily:F.subtitle,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><span aria-hidden="true">✓</span> AI audit</button></div>
  </>;
}

export default memo(ExportPanel);
