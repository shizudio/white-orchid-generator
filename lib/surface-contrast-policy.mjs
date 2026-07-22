export function luminanceContrast(a,b){
  const hi=Math.max(a,b),lo=Math.min(a,b);
  return (hi+0.05)/(lo+0.05);
}

export function rgbLuminance(red,green,blue){
  const channels=[red,green,blue].map(value=>{
    const normalized=Math.max(0,Math.min(255,Number(value)||0))/255;
    return normalized<=0.03928?normalized/12.92:Math.pow((normalized+0.055)/1.055,2.4);
  });
  return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];
}

export function hexLuminance(value){
  const raw=String(value||"#000000").replace("#","").trim();
  const hex=raw.length===3?raw.split("").map(part=>part+part).join(""):raw.padEnd(6,"0").slice(0,6);
  return rgbLuminance(
    parseInt(hex.slice(0,2),16)||0,
    parseInt(hex.slice(2,4),16)||0,
    parseInt(hex.slice(4,6),16)||0,
  );
}

export function summarizeLuminanceSamples(samples=[]){
  const values=Array.from(samples).filter(Number.isFinite);
  if(!values.length)return null;
  let sum=0,squareSum=0,low=1,high=0;
  for(const value of values){sum+=value;squareSum+=value*value;low=Math.min(low,value);high=Math.max(high,value);}
  const mean=sum/values.length;
  return {mean,variance:Math.max(0,squareSum/values.length-mean*mean),low,high,count:values.length};
}

export function contrastAtExtremes(surface,inkLuminance){
  if(!surface)return null;
  return Math.min(luminanceContrast(surface.low,inkLuminance),luminanceContrast(surface.high,inkLuminance));
}

export function evaluateInkLegibility(surface,inkLuminance,{minimumContrast=3,busyStdDev=0.14}={}){
  if(!surface)return {ok:true,contrast:null,busy:false,meanContrast:null,worstContrast:null};
  const standardDeviation=Math.sqrt(surface.variance||0);
  const busy=standardDeviation>busyStdDev;
  const meanContrast=luminanceContrast(surface.mean,inkLuminance);
  const low=Math.max(0,surface.mean-standardDeviation),high=Math.min(1,surface.mean+standardDeviation);
  const worstContrast=busy?Math.min(luminanceContrast(low,inkLuminance),luminanceContrast(high,inkLuminance)):meanContrast;
  const contrast=busy?Math.min(meanContrast,worstContrast):meanContrast;
  return {ok:meanContrast>=minimumContrast&&(!busy||worstContrast>=minimumContrast),contrast,busy,meanContrast,worstContrast};
}
