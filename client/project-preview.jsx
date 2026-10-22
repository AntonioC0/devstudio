import React,{useEffect,useRef,useState} from 'react';
import {Lock} from 'lucide-react';
import {PREVIEW_DEVICES,viewportLayout} from './viewport-layout.js';

export function ProjectPreview({document,device,previewKey,name}){
  const ref=useRef(),[size,setSize]=useState({width:0,height:0});
  useEffect(()=>{const node=ref.current,observer=new ResizeObserver(entries=>{const rect=entries[0].contentRect;if(rect.width>0&&rect.height>0)setSize({width:rect.width,height:rect.height});});observer.observe(node);return()=>observer.disconnect();},[]);
  const layout=viewportLayout(size.width,size.height,device);
  return <div className={'preview-area '+device}><div className="preview-canvas" ref={ref}>{size.width>0&&<div className="preview-stage" style={{width:layout.stageWidth,height:layout.stageHeight}}><div className="preview-browser" style={{width:layout.width,height:layout.height,transform:`scale(${layout.scale})`}}><div className="preview-address"><div><span/><span/><span/></div><span><Lock size={10}/>{name.toLowerCase().replace(/\s+/g,'-')}.preview</span><span>{PREVIEW_DEVICES[device].label} · {layout.width}px</span></div><iframe key={previewKey} title={'Prévia do projeto — '+PREVIEW_DEVICES[device].label} sandbox="allow-scripts" srcDoc={document}/></div></div>}</div><div className="preview-size-note" aria-live="polite">{PREVIEW_DEVICES[device].label} · viewport {layout.width}px{layout.scale<1?' · visualização '+Math.round(layout.scale*100)+'%':''}</div></div>;
}
