import { memo, useRef, useState } from "react";

// (Half-sheet — ratified 2026-07-15, ux-architecture §2.11) On mobile the
// inspector is a CONTENT-HEIGHT bottom sheet with two detents: the default
// "half" detent caps at ~45vh so the canvas band above stays visible (the
// audit's #1/#2 fix — a fixed 72vh sheet buried the element under edit); a
// drag on the handle promotes to the "tall" detent (~78vh) for the long Text
// inspector. Dragging DOWN from tall returns to half; down from half closes
// (#18 — the expected iOS sheet gesture; the 44px ✕ is retained). The handle
// is display:none on desktop, where the inspector stays the in-flow column.
const DETENT_DRAG_PX = 40;

function ContextualInspector({ info, removeAction, onClose, elements=[], activeKey, onSelect, palette, fonts }) {
  const [tall, setTall] = useState(false);
  const handleDrag = useRef(null);
  if (!info) return null;
  const B=palette,FU=fonts;
  const onHandleDown = e => {
    handleDrag.current = { y: e.clientY, dy: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onHandleMove = e => {
    if (handleDrag.current) handleDrag.current.dy = e.clientY - handleDrag.current.y;
  };
  const onHandleUp = () => {
    const drag = handleDrag.current;
    handleDrag.current = null;
    if (!drag) return;
    if (drag.dy <= -DETENT_DRAG_PX) { if (!tall) setTall(true); }
    else if (drag.dy >= DETENT_DRAG_PX) { if (tall) setTall(false); else onClose(); }
  };
  return <div role="dialog" aria-label={`${info.title} controls`} className={`wo-inspector wo-inspector-dock${tall?" wo-sheet-tall":""}`}>
    <div className="wo-sheet-handle" role="button" tabIndex={0}
      aria-label={tall?"Sheet handle. Drag down for the smaller sheet; drag down again to close.":"Sheet handle. Drag up for a taller sheet; drag down to close."}
      onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp}
      onPointerCancel={()=>{handleDrag.current=null;}}
      onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); setTall(prev=>!prev); } if(e.key==="Escape") onClose(); }}>
      <span className="wo-sheet-handle-bar" aria-hidden="true" />
    </div>
    <div className="wo-inspector-head" style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:`1px solid ${B.ash}22`,background:"#fff",flex:"0 0 auto"}}>
      <span style={{fontSize:11,fontFamily:FU.subtitle,fontWeight:600,letterSpacing:1.6,textTransform:"uppercase",color:B.burnham,flex:"0 1 auto",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{info.title}</span>
      {removeAction && <button type="button" onClick={removeAction.act} style={{marginLeft:"auto",flex:"0 0 auto",border:"none",background:"transparent",color:B.tangerine,fontFamily:FU.subtitle,fontSize:11,fontWeight:600,letterSpacing:0.4,cursor:"pointer",padding:"6px 8px"}}>{removeAction.label}</button>}
      <button type="button" aria-label="Close inspector" className="wo-ins-close" onClick={onClose} style={{marginLeft:removeAction?0:"auto",flex:"0 0 auto",width:30,height:30,borderRadius:8,border:"none",background:`${B.ash}18`,color:B.jet,fontSize:15,lineHeight:1,cursor:"pointer",display:"grid",placeItems:"center"}}>✕</button>
    </div>
    {elements.length >= 2 && <div role="toolbar" aria-label="Elements" style={{display:"flex",flexWrap:"wrap",gap:6,padding:"10px 14px",borderBottom:`1px solid ${B.ash}22`,background:"#fff",flex:"0 0 auto"}}>
      {elements.map(el => {
        const on=activeKey===el.key;
        return <button key={el.key} type="button" className="wo-ins-pill" aria-pressed={on} title={`Edit ${el.label}`} onClick={()=>onSelect(el)} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 11px",minHeight:30,borderRadius:999,border:`1px solid ${on?B.burnham:B.ash+"33"}`,background:on?B.burnham:"transparent",color:on?"#fff":B.jet,fontFamily:FU.subtitle,fontSize:10,fontWeight:500,letterSpacing:0.4,cursor:"pointer"}}><span aria-hidden="true" style={{fontSize:11,lineHeight:1}}>{el.icon}</span>{el.label}</button>;
      })}
    </div>}
    <div className="wo-inspector-body" style={{padding:"14px 15px 18px",overflowY:"auto",flex:"1 1 auto",background:"#fff"}}>{info.body}</div>
  </div>;
}

export default memo(ContextualInspector);
