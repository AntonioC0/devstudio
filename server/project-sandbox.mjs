import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {compileBackend} from './project-compiler.mjs';
class SandboxError extends Error{constructor(message){super(message);this.publicMessage=message;}}
const fail=message=>{throw new SandboxError(message);};
export class ProjectSandboxPool{
  constructor({maxProjects=3,timeoutMs=6000}={}){this.slots=new Map();this.maxProjects=maxProjects;this.timeoutMs=timeoutMs;}
  key(session,project){return session+':'+project.id;}
  slot(session,project){
    const key=this.key(session,project);let slot=this.slots.get(key);if(slot)return slot;
    if(this.slots.size>=this.maxProjects)fail('Limite de '+this.maxProjects+' backends de teste ativos. Exclua um projeto de teste ou encerre uma sessão para liberar espaço.');
    const worker=new Worker(new URL('./sandbox-worker.mjs',import.meta.url),{env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:48,maxYoungGenerationSizeMb:8}});
    worker.unref();slot={worker,session,projectId:project.id,cookies:new Map(),pending:new Map(),sequence:0,queue:Promise.resolve(),source:null,hash:null,version:project.version};this.slots.set(key,slot);
    worker.on('message',message=>{const pending=slot.pending.get(message.id);if(!pending)return;slot.pending.delete(message.id);clearTimeout(pending.timer);message.ok?pending.resolve(message):pending.reject(new SandboxError('Erro no backend: '+message.error));});
    const closed=()=>{if(this.slots.get(key)===slot)this.slots.delete(key);for(const pending of slot.pending.values()){clearTimeout(pending.timer);pending.reject(new SandboxError('O backend de teste foi encerrado. Tente novamente.'));}slot.pending.clear();};
    worker.on('error',closed);worker.on('exit',closed);return slot;
  }
  async send(slot,payload){
    const execute=()=>new Promise((resolve,reject)=>{
      const id=++slot.sequence,timer=setTimeout(()=>{slot.pending.delete(id);reject(new SandboxError('O backend excedeu o tempo do teste e foi reiniciado.'));slot.worker.terminate();},this.timeoutMs);
      slot.pending.set(id,{resolve,reject,timer});slot.worker.postMessage({id,...payload});
    });
    const next=slot.queue.then(execute,execute);slot.queue=next.catch(()=>{});return next;
  }
  async compile(session,{project,files}){
    const slot=this.slot(session,project),hash=createHash('sha256').update(JSON.stringify(files.map(file=>[file.path,file.content]))).digest('hex');
    if(slot.hash===hash)return{slot,source:slot.source,hash};
    const result=await compileBackend(files);if(!result.ok){if(!slot.source)this.closeProject(session,project.id);fail(result.errors.join('\n'));}return{slot,source:result.source,hash};
  }
  async prepare(session,{project,files}){
    const {slot,source,hash}=await this.compile(session,{project,files});
    await this.send(slot,{code:source});slot.source=source;slot.hash=hash;slot.version=project.version;
    return{status:'live',mode:'embedded',source_version:project.version,temporary:true};
  }
  status(session,{project}){const slot=this.slots.get(this.key(session,project));return slot?.source?{status:'live',mode:'embedded',source_version:slot.version,temporary:true}:null;}
  async execute(session,{project,files,request}){
    if(!request||typeof request!=='object'||!['GET','POST','PUT','PATCH','DELETE'].includes(request.method)||typeof request.url!=='string'||request.url.length>2000||!request.url.startsWith('/api/'))fail('Requisição do aplicativo inválida.');
    const url=new URL(request.url,'https://app.test');if(url.origin!=='https://app.test'||!url.pathname.startsWith('/api/'))fail('Destino do aplicativo inválido.');
    if(JSON.stringify(request.body??null).length>32000)fail('Corpo da requisição do aplicativo muito grande.');
    const headers={'content-type':'application/json'};
    if(request.headers?.authorization){if(typeof request.headers.authorization!=='string'||request.headers.authorization.length>1000)fail('Cabeçalho inválido.');headers.authorization=request.headers.authorization;}
    const {slot,source,hash}=await this.compile(session,{project,files});
    for(const [key,value]of slot.cookies)if(value.expiresAt<Date.now())slot.cookies.delete(key);
    headers.cookie=[...slot.cookies].map(([key,value])=>key+'='+value.token).join('; ');
    const result=await this.send(slot,{code:source,request:{method:request.method,path:url.pathname,query:Object.fromEntries(url.searchParams),headers,body:request.body??null}});
    slot.source=source;slot.hash=hash;slot.version=project.version;
    const response=result.response;if(!response||!Number.isInteger(response.status)||response.status<200||response.status>599)fail('O backend deve responder com {status, headers, body}.');
    for(const [name,value]of Object.entries(response.headers||{})){
      if(name.toLowerCase()!=='set-cookie')continue;
      for(const cookie of Array.isArray(value)?value:[value]){
        if(typeof cookie!=='string'||cookie.length>2000)fail('Cookie do aplicativo inválido.');
        const pair=cookie.split(';')[0],index=pair.indexOf('='),key=pair.slice(0,index),token=pair.slice(index+1);
        if(index<1||!/^[a-zA-Z0-9_-]{1,80}$/.test(key)||/[\r\n;]/.test(token))fail('Cookie do aplicativo inválido.');
        if(!/;\s*HttpOnly(?:;|$)/i.test(cookie)||!/;\s*Secure(?:;|$)/i.test(cookie)||!/;\s*SameSite=(?:Strict|Lax)(?:;|$)/i.test(cookie))fail('Cookies de sessão precisam de HttpOnly, Secure e SameSite.');
        if(!token||/Max-Age=0/i.test(cookie))slot.cookies.delete(key);else{if(slot.cookies.size>=10&&!slot.cookies.has(key))fail('Limite de cookies do aplicativo.');const seconds=Math.min(3600,Math.max(0,Number(cookie.match(/Max-Age=(\d+)/i)?.[1]||3600)));slot.cookies.set(key,{token,expiresAt:Date.now()+seconds*1000});}
      }
    }
    return{status:response.status,body:response.body??null,headers:{'content-type':'application/json'}};
  }
  closeProject(session,projectId){const key=session+':'+projectId,slot=this.slots.get(key);if(slot){this.slots.delete(key);slot.worker.terminate();}}
  closeSession(session){for(const slot of [...this.slots.values()])if(slot.session===session)this.closeProject(session,slot.projectId);}
  close(){for(const slot of [...this.slots.values()])this.closeProject(slot.session,slot.projectId);}
}
