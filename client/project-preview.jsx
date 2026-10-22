import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Lock} from 'lucide-react';
import {PREVIEW_DEVICES,viewportLayout} from './viewport-layout.js';

export function ProjectPreview({document,device,previewKey,name,apiRequest}){
  const ref=useRef(),[size,setSize]=useState({width:0,height:0});
  useEffect(()=>{const node=ref.current,observer=new ResizeObserver(entries=>{const rect=entries[0].contentRect;if(rect.width>0&&rect.height>0)setSize({width:rect.width,height:rect.height});});observer.observe(node);return()=>observer.disconnect();},[]);
  const frame=useRef();
  useLayoutEffect(()=>{
    let mounted=true;
    const receive=async event=>{
      const data=event.data;if(event.source!==frame.current?.contentWindow||data?.type!=='devstudio:api-request'||!Number.isInteger(data.id)||typeof data.channel!=='string'||data.channel.length!==36)return;
      try{const response=await apiRequest(data.request);if(mounted&&event.source===frame.current?.contentWindow)event.source.postMessage({type:'devstudio:api-response',channel:data.channel,id:data.id,response},'*');}
      catch(error){if(mounted&&event.source===frame.current?.contentWindow)event.source.postMessage({type:'devstudio:api-response',channel:data.channel,id:data.id,error:error.message},'*');}
    };
    window.addEventListener('message',receive);return()=>{mounted=false;window.removeEventListener('message',receive);};
  },[apiRequest]);
  const layout=viewportLayout(size.width,size.height,device);
  return <div className={'preview-area '+device}><div className="preview-canvas" ref={ref}>{size.width>0&&<div className="preview-stage" style={{width:layout.stageWidth,height:layout.stageHeight}}><div className="preview-browser" style={{width:layout.width,height:layout.height,transform:`scale(${layout.scale})`}}><div className="preview-address"><div><span/><span/><span/></div><span><Lock size={10}/>{name.toLowerCase().replace(/\s+/g,'-')}.preview</span><span>{PREVIEW_DEVICES[device].label} · {layout.width}px</span></div><iframe ref={frame} key={previewKey} title={'Prévia do projeto — '+PREVIEW_DEVICES[device].label} sandbox="allow-scripts" srcDoc={document}/></div></div>}</div><div className="preview-size-note" aria-live="polite">{PREVIEW_DEVICES[device].label} · viewport {layout.width}px{layout.scale<1?' · visualização '+Math.round(layout.scale*100)+'%':''}</div></div>;
}
