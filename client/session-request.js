import {ATTACHMENT_LIMITS as LIMITS} from '../attachment-policy.js';

export function prepareSessionRequest({history,content,attachments,requestId}){
  const recent=[];let length=0;
  for(const message of [...history].reverse()){
    if(recent.length>=LIMITS.maxHistoryMessages||length+message.content.length>LIMITS.maxHistoryChars-4000)break;
    recent.unshift(message);length+=message.content.length;
  }
  const files=[],indexesByMessage=new Map();let size=0;
  function add(message,required=false){
    const indexes=[];
    for(const attachment of message.attachments||[]){
      const file=attachment.file;
      if(!file)continue;
      if(file.size>LIMITS.maxFileBytes||files.length>=LIMITS.maxFiles||size+file.size>LIMITS.maxTotalBytes){if(required)throw new Error('Envie até 4 anexos, 5 MB por arquivo e 12 MB no total.');continue;}
      indexes.push(files.length);files.push(file);size+=file.size;
    }
    indexesByMessage.set(message,indexes);
  }
  const current={attachments};add(current,true);
  for(const message of [...recent].reverse())if(message.role==='user')add(message);
  return{payload:{request_id:requestId,content,attachment_indexes:indexesByMessage.get(current),history:recent.map(message=>{
    const indexes=indexesByMessage.get(message)||[],omitted=(message.attachments||[]).filter(a=>a.file).length-indexes.length;
    const note=omitted?'\n['+omitted+' anexo(s) desta mensagem não reenviado(s), por limite de contexto.]':'';
    return{role:message.role,content:message.content+note,...(indexes.length?{attachment_indexes:indexes}:{})};
  })},files};
}
export function sessionForm(prepared){const form=new FormData();form.append('payload',JSON.stringify(prepared.payload));prepared.files.forEach((file,index)=>form.append('attachment_'+index,file,file.name));return form;}
