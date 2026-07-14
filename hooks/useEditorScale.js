import { useLayoutEffect, useState } from "react";

export function useEditorScale(shellRef,logicalWidth){
  const [scale,setScale]=useState(1);
  useLayoutEffect(()=>{
    const shell=shellRef.current;if(!shell)return;
    const measure=()=>setScale(shell.getBoundingClientRect().width/logicalWidth||1);
    measure();const observer=new ResizeObserver(measure);observer.observe(shell);
    return()=>observer.disconnect();
  },[shellRef,logicalWidth]);
  return scale;
}
