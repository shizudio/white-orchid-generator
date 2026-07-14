import { memo } from "react";

function TemplateLibrary({ templates, renderCard, renderActions, onRestore, onSave, hiddenCount=0, palette, fonts }) {
  const B=palette,F=fonts.body,FU=fonts.ui;
  return <>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
      {templates.map(template=><div key={template.id} style={{position:"relative"}}>
        {renderCard(template)}
        <span style={{position:"absolute",top:7,left:7,fontSize:8,fontFamily:FU.subtitle,fontWeight:700,letterSpacing:0.6,textTransform:"uppercase",color:"#fff",background:B.jet+"d9",borderRadius:5,padding:"2px 5px",lineHeight:1.3}}>{template._source}</span>
        {template._syncBadge&&<span title={template._syncTitle} style={{position:"absolute",top:7,right:7,fontSize:8,fontFamily:F.body,color:"#fff",background:B.tangerine+"e6",borderRadius:5,padding:"2px 5px",lineHeight:1.3}}>{template._syncBadge}</span>}
        {renderActions(template)}
      </div>)}
    </div>
    {hiddenCount>0&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,fontSize:11,fontFamily:F.body,color:B.ash,lineHeight:1.4}}>
      <span style={{flex:"1 1 auto"}}>{hiddenCount} built-in template{hiddenCount>1?"s":""} hidden on this device.</span>
      <button type="button" className="wo-tpl-act" onClick={onRestore} style={{fontFamily:FU.subtitle,fontSize:10,fontWeight:600,letterSpacing:0.5,color:B.burnham,background:"transparent",border:`1px solid ${B.burnham}44`,borderRadius:999,padding:"5px 12px",cursor:"pointer"}}>Restore</button>
    </div>}
    <button onClick={onSave} style={{width:"100%",marginTop:14,padding:"10px 12px",borderRadius:999,border:`1px solid ${B.burnham}44`,background:"transparent",color:B.burnham,fontFamily:FU.subtitle,fontSize:11,fontWeight:600,letterSpacing:0.6,cursor:"pointer"}}>Save current design as a template</button>
  </>;
}

export default memo(TemplateLibrary);
