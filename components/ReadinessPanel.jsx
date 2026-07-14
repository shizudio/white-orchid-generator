import { memo } from "react";

function issueOkayed(acks,dimensionId,issue){
  return Object.values(acks||{}).some(a=>a&&a.dimensionId===dimensionId&&(a.issueId===issue.id||(a.category&&a.category===issue.category)));
}

function ReadinessPanel({check,expanded,setExpanded,actionsOf,onSwitchFormat,currentDim,acks,ackedOf,labels={},palette:B,fonts:F,actionStyle}){
  const formats=check?.formats||[],loading=!check,need=check?.needCount||0;
  const isOkayed=(dimensionId,issue)=>issue&&issue._audit?(typeof ackedOf==="function"&&!!ackedOf(issue)):issueOkayed(acks,dimensionId,issue);
  return <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${B.ash}22`}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}><span style={{fontSize:10,fontFamily:F.subtitle,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:B.ash}}>Ready to post</span>{!loading&&<span style={{fontSize:11,fontFamily:F.body,color:need?B.celadonDeep:B.burnham,fontWeight:600}}>{need?`${need} to review`:"All 6 formats ready"}</span>}</div>
    {loading?<p style={{fontSize:11,color:B.ash,fontFamily:F.body,margin:"4px 0"}}>Checking every format…</p>:<div style={{display:"flex",flexDirection:"column",gap:2}}>{formats.map(format=>{
      const openRow=expanded===format.dimensionId;
      const okayed=(format.issues||[]).filter(issue=>isOkayed(format.dimensionId,issue));
      const open=(format.issues||[]).filter(issue=>!isOkayed(format.dimensionId,issue));
      const allOkayed=!format.ready&&!open.length&&okayed.length>0;
      return <div key={format.dimensionId}>
        <button type="button" aria-expanded={openRow} onClick={()=>{if(format.ready&&!okayed.length)return;setExpanded(openRow?null:format.dimensionId);if(!openRow)onSwitchFormat?.(format.dimensionId);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 2px",background:"none",border:"none",borderRadius:6,cursor:format.ready&&!okayed.length?"default":"pointer",textAlign:"left",fontFamily:F.body}}>
          <span aria-hidden="true" title={format.ready?"Ready to post":allOkayed?"Ready — includes choices you okayed":"Worth a look"} style={{width:15,height:15,flexShrink:0,display:"grid",placeItems:"center",borderRadius:"50%",fontSize:10,fontWeight:700,lineHeight:1,background:format.ready?`${B.celadon}66`:allOkayed?"#fff":B.wisteria,border:allOkayed?`1.5px solid ${B.celadonDeep}`:"none",color:format.ready?B.burnham:allOkayed?B.celadonDeep:"transparent"}}>{format.ready||allOkayed?"✓":""}</span>
          <span style={{flex:1,fontSize:12,color:B.jet,fontWeight:currentDim===format.dimensionId?600:400}}>{labels[format.dimensionId]||format.dimensionId}</span>
          <span style={{fontSize:11,color:format.ready||allOkayed?B.ash:B.celadonDeep,fontFamily:F.body}}>{open.length?`${open.length} ${open.length===1?"fix":"fixes"}${openRow?" ▾":" ▸"}`:allOkayed?`your call${openRow?" ▾":" ▸"}`:"Ready"}</span>
        </button>
        {openRow&&(open.length>0||okayed.length>0)&&<div style={{padding:"2px 2px 8px 25px",display:"flex",flexDirection:"column",gap:8}}>
          {open.map((issue,index)=><div key={issue.id||index} style={{display:"flex",flexDirection:"column",gap:5}}><span style={{fontSize:11.5,color:B.jet,fontFamily:F.body,lineHeight:1.4}}>{issue.message}</span><div style={{display:"flex",gap:6,flexWrap:"wrap",alignSelf:"flex-start"}}>{(actionsOf?.(issue)||[]).map((action,i)=><button key={i} type="button" onClick={action.run} title={action.hint||undefined} style={actionStyle(action.kind)}>{action.label}</button>)}</div></div>)}
          {okayed.length>0&&<div style={{marginTop:open.length?6:0,paddingTop:open.length?8:0,borderTop:open.length?`1px solid ${B.ash}22`:"none"}}><span style={{fontSize:9.5,fontFamily:F.subtitle,fontWeight:700,letterSpacing:0.6,textTransform:"uppercase",color:B.celadonDeep}}>Notes you've okayed</span><div style={{display:"flex",flexDirection:"column",gap:5,marginTop:6}}>{okayed.map((issue,index)=><span key={issue.id||index} style={{fontSize:11,color:B.ash,fontFamily:F.body,lineHeight:1.4}}>{issue.message}</span>)}</div></div>}
        </div>}
      </div>;
    })}</div>}
  </div>;
}

export default memo(ReadinessPanel);
