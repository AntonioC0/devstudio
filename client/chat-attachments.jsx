import React,{useRef,useState,useEffect} from 'react';
import {Paperclip,X,FileText,Image as ImageIcon,Download} from 'lucide-react';
import {ATTACHMENT_ACCEPT,ATTACHMENT_FORMATS,ATTACHMENT_LIMITS as LIMITS} from '../attachment-policy.js';

const fileSize=size=>size<1024*1024?Math.ceil(size/1024)+' KB':(size/(1024*1024)).toFixed(1)+' MB';
function Attachment({attachment,onRemove,disabled}){
  const file=attachment.file,[url,setUrl]=useState('');
  useEffect(()=>{if(!file)return;const value=URL.createObjectURL(file);setUrl(value);return()=>URL.revokeObjectURL(value);},[file]);
  const image=/\.(png|jpe?g|webp)$/i.test(file?.name||'');
  return <div className={'chat-attachment '+(image?'is-image':'')}><span className="attachment-symbol">{image&&url?<img src={url} alt=""/>:image?<ImageIcon size={17}/>:<FileText size={17}/>}</span><span className="attachment-label"><strong>{file?.name||'Anexo'}</strong><small>{file?fileSize(file.size):''} · Nesta sessão</small></span>{onRemove?<button type="button" disabled={disabled} onClick={()=>onRemove(attachment.id)} aria-label={'Remover '+file.name}><X size={13}/></button>:url?<a href={url} download={file.name} aria-label={'Baixar '+file.name} title="Baixar arquivo"><Download size={13}/></a>:null}</div>;
}
export function AttachmentList({attachments,onRemove,disabled}){return attachments?.length?<div className="chat-attachments">{attachments.map(attachment=><Attachment key={attachment.id} attachment={attachment} onRemove={onRemove} disabled={disabled}/>)}</div>:null;}
export function AttachButton({onFiles,disabled}){
  const ref=useRef();
  return <><input ref={ref} className="attachment-input" type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={e=>{onFiles(Array.from(e.target.files||[]));e.target.value='';}} tabIndex={-1} aria-label="Selecionar anexos"/><button className="attach-button" type="button" disabled={disabled} onClick={()=>ref.current.click()} title={ATTACHMENT_FORMATS+' · até 4 arquivos, 5 MB cada'} aria-label="Anexar imagens, documentos ou planilhas"><Paperclip size={16}/><span>Anexar</span></button></>;
}
export function validatePickedFiles(files,current){
  if(files.length+current.length>LIMITS.maxFiles)throw new Error('Anexe até 4 arquivos por mensagem.');
  if(files.some(file=>!file.size||file.size>LIMITS.maxFileBytes))throw new Error('Cada anexo deve ter entre 1 byte e 5 MB.');
  if([...files,...current.map(a=>a.file)].reduce((sum,file)=>sum+file.size,0)>LIMITS.maxTotalBytes)throw new Error('O total de anexos desta mensagem deve ser de até 12 MB.');
  const extensions=new Set(ATTACHMENT_ACCEPT.split(',').map(extension=>extension.slice(1)));
  if(files.some(file=>!extensions.has(file.name.split('.').pop().toLowerCase())))throw new Error('Formato não aceito. Use '+ATTACHMENT_FORMATS+'.');
  return files.map(file=>({id:crypto.randomUUID(),file}));
}
