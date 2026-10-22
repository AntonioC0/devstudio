export const PREVIEW_DEVICES={desktop:{width:1280,label:'Computador'},tablet:{width:768,label:'Tablet'},mobile:{width:390,label:'Celular'}};
export function viewportLayout(availableWidth,availableHeight,device){
  const width=PREVIEW_DEVICES[device]?.width||1280;
  const safeWidth=Number.isFinite(availableWidth)?Math.max(1,availableWidth):width;
  const safeHeight=Number.isFinite(availableHeight)?Math.max(1,availableHeight):600;
  const scale=Math.min(1,safeWidth/width);
  const height=Math.max(1,safeHeight/scale);
  return{width,height,scale,stageWidth:width*scale,stageHeight:height*scale};
}
