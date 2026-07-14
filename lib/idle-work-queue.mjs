/** Schedule one expensive item per idle slice. Falls back to short timers. */
export function scheduleIdleWork(items, work, done, environment = globalThis) {
  const queue=[...(items||[])];
  let cancelled=false,handle=null;
  const hasIdle=typeof environment?.requestIdleCallback==="function";
  const schedule=()=>{
    if(cancelled)return;
    if(hasIdle) handle=environment.requestIdleCallback(run,{timeout:120});
    else handle=environment.setTimeout(run,0);
  };
  const run=(deadline)=>{
    handle=null;
    if(cancelled)return;
    do {
      const item=queue.shift();
      if(item===undefined){done?.();return;}
      work(item);
    } while(queue.length && deadline?.timeRemaining?.()>8);
    if(queue.length)schedule(); else done?.();
  };
  schedule();
  return ()=>{
    cancelled=true;
    if(handle==null)return;
    if(hasIdle)environment.cancelIdleCallback?.(handle);
    else environment.clearTimeout?.(handle);
  };
}
