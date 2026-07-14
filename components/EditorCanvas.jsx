import { useMemo } from "react";

export function useEditorInputController({ onPointerDown,onPointerMove,onPointerUp,onPointerCancel,onKeyDown }) {
  return useMemo(()=>({onPointerDown,onPointerMove,onPointerUp,onPointerCancel,onKeyDown}),[onPointerDown,onPointerMove,onPointerUp,onPointerCancel,onKeyDown]);
}

export default function EditorCanvas({ canvasRef,width,height,canvasStyle,accent="#FF654F",scale,photo,overlay,text,textLabel,input }) {
  const handlers=useEditorInputController(input||{});
  return <>
    <canvas ref={canvasRef} width={width} height={height}
      {...handlers} tabIndex={0} role="application"
      aria-label="Interactive post preview"
      style={canvasStyle}/>
    <EditorChrome width={width} height={height} scale={scale} photo={photo} overlay={overlay} text={text} textLabel={textLabel} accent={accent}/>
  </>;
}

function EditorChrome({ width,height,scale,photo,overlay,text,textLabel="TEXT",accent }) {
  if(!photo&&!overlay&&!text)return null;
  const k=Math.max(scale||1,0.01),line=2.5/k,halo=6/k,handleR=8/k,inset=14/k;
  const clampPoint=({x,y})=>({x:Math.max(inset,Math.min(width-inset,x)),y:Math.max(inset,Math.min(height-inset,y))});
  let photoChrome=null,textChrome=null,overlayChrome=null;
  if(text)textChrome=<g>
    <rect x={text.x} y={text.y} width={text.w} height={text.h} rx={8/k} fill="none" stroke="white" strokeWidth={halo} strokeDasharray={`${10/k} ${7/k}`}/>
    <rect x={text.x} y={text.y} width={text.w} height={text.h} rx={8/k} fill="none" stroke={accent} strokeWidth={line} strokeDasharray={`${10/k} ${7/k}`}/>
    <g transform={`translate(${text.x+8/k} ${Math.max(inset,text.y-28/k)})`}><rect width={64/k} height={22/k} rx={11/k} fill={accent}/><text x={32/k} y={14.5/k} textAnchor="middle" fill="white" fontFamily="Syne, sans-serif" fontSize={9/k} fontWeight="700" letterSpacing={1/k}>{textLabel}</text></g>
  </g>;
  if(photo){
    const angle=(photo.rot||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),hw=photo.dw/2,hh=photo.dh/2;
    const rotatePoint=(x,y)=>({x:photo.cx+x*cos-y*sin,y:photo.cy+x*sin+y*cos});
    const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y])=>clampPoint(rotatePoint(x,y)));
    const topMid=clampPoint(rotatePoint(0,-hh)),knob=clampPoint(rotatePoint(0,-hh-30/k));
    photoChrome=<>
      <g transform={`translate(${photo.cx} ${photo.cy}) rotate(${photo.rot||0})`}><rect x={-hw} y={-hh} width={photo.dw} height={photo.dh} fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth={halo}/><rect x={-hw} y={-hh} width={photo.dw} height={photo.dh} fill="none" stroke={accent} strokeWidth={line}/></g>
      <line x1={topMid.x} y1={topMid.y} x2={knob.x} y2={knob.y} stroke="white" strokeWidth={halo} strokeLinecap="round"/><line x1={topMid.x} y1={topMid.y} x2={knob.x} y2={knob.y} stroke={accent} strokeWidth={line} strokeLinecap="round"/>
      {corners.map((point,i)=><g key={i}><circle cx={point.x} cy={point.y} r={handleR+2/k} fill="white"/><circle cx={point.x} cy={point.y} r={handleR} fill="white" stroke={accent} strokeWidth={3/k}/></g>)}
      <circle cx={knob.x} cy={knob.y} r={handleR+2/k} fill="white"/><circle cx={knob.x} cy={knob.y} r={handleR} fill={accent} stroke="white" strokeWidth={2/k}/>
      <g transform={`translate(${inset} ${inset})`}><rect width={54/k} height={22/k} rx={11/k} fill={accent}/><text x={27/k} y={14.5/k} textAnchor="middle" fill="white" fontFamily="Syne, sans-serif" fontSize={9/k} fontWeight="700" letterSpacing={1/k}>IMAGE</text></g>
    </>;
  }
  if(overlay){const t=overlay.transform,ow=(t.scale??0.2)*width,oh=ow/overlay.ratio;overlayChrome=<g transform={`translate(${(t.x??0.5)*width} ${(t.y??0.5)*height}) rotate(${t.rotation||0})`}><rect x={-ow/2} y={-oh/2} width={ow} height={oh} fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth={halo} strokeDasharray={`${10/k} ${7/k}`}/><rect x={-ow/2} y={-oh/2} width={ow} height={oh} fill="none" stroke={accent} strokeWidth={line} strokeDasharray={`${10/k} ${7/k}`}/></g>;}
  return <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"hidden",pointerEvents:"none",zIndex:10,filter:"drop-shadow(0 1px 1px rgba(40,43,40,0.16))"}}>{overlayChrome}{photoChrome}{textChrome}</svg>;
}

