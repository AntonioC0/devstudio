import http from 'node:http';
import {Readable} from 'node:stream';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {SessionDatabases} from './database.mjs';
import worker from '../dist/server/index.js';

const hash=value=>createHash('sha256').update(value).digest();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const baseCookie='__Host-devstudio_session';
const maxBody=12*1024*1024+260000;

export function createApplication({origin,accessPassword,openaiKey='',openaiModel='gpt-4.1',databases=new SessionDatabases(),clock=Date.now}={}){
  const publicUrl=new URL(origin);
  if(!['http:','https:'].includes(publicUrl.protocol)||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash||publicUrl.username||publicUrl.password)throw new Error('PUBLIC_ORIGIN precisa conter somente a origem do site.');
  if(publicUrl.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(publicUrl.hostname))throw new Error('Use HTTPS fora do ambiente local.');
  if(typeof accessPassword!=='string'||accessPassword.length<20||accessPassword.length>256)throw new Error('Configure ACCESS_PASSWORD com 20 a 256 caracteres.');
  const expected=hash('devstudio:'+accessPassword),master=randomBytes(32).toString('hex');
  let active=0;const counters=new Map();
  function basic(request){
    const header=request.headers.authorization||'';
    if(!header.startsWith('Basic ')||header.length>2048)return false;
    try{return timingSafeEqual(hash(Buffer.from(header.slice(6),'base64').toString('utf8')),expected);}catch{return false;}
  }
  function reply(response,status,detail,extra={}){if(response.destroyed)return;response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});response.end(JSON.stringify({detail}));}
  function permit(name,max,period){const key=name+':'+Math.floor(clock()/period),entry=counters.get(key)||{hits:0,expires:clock()+period*2};entry.hits++;counters.set(key,entry);return entry.hits<=max;}
  const sweep=setInterval(()=>{databases.sweep();for(const [key,entry]of counters)if(entry.expires<clock())counters.delete(key);},60000);sweep.unref();
  const server=http.createServer(async(request,response)=>{
    let release,session,endAfter=false;
    const abort=new AbortController();
    request.on('aborted',()=>abort.abort());response.on('close',()=>{if(!response.writableEnded)abort.abort();});
    try{
      if(!request.url?.startsWith('/')||request.url.startsWith('//'))return reply(response,400,'Endereço inválido.');
      const url=new URL(publicUrl.origin+request.url);
      if(url.pathname==='/healthz'&&request.method==='GET'){response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return response.end('{"status":"ok"}');}
      if(!basic(request))return reply(response,401,'Acesso ao ambiente de teste: usuário devstudio e senha definida no Render.',{'WWW-Authenticate':'Basic realm="Dev Studio - teste privado", charset="UTF-8"'});
      const isApi=url.pathname.startsWith('/api/');
      if(isApi&&!['GET','POST','PUT','PATCH','DELETE'].includes(request.method))return reply(response,405,'Método não permitido.');
      const headers=new Headers();
      for(const [key,value]of Object.entries(request.headers))if(value!==undefined&&!['authorization','cookie','host','connection','transfer-encoding','content-length'].includes(key))headers.set(key,Array.isArray(value)?value.join(', '):value);
      const env={OPENAI_API_KEY:openaiKey,OPENAI_MODEL:openaiModel,CREDENTIALS_ENCRYPTION_KEY:master,TEMPORARY_DATA:true};
      if(isApi){
        if(request.method!=='GET'&&request.headers.origin!==publicUrl.origin)return reply(response,403,'Origem não permitida.');
        const id=request.headers['x-dev-studio-session'];
        if(typeof id!=='string'||!uuid.test(id))return reply(response,400,'Recarregue a página para iniciar uma sessão de teste.');
        if(url.pathname==='/api/test-session'&&request.method==='DELETE'){databases.end(id);response.writeHead(204,{'Cache-Control':'no-store'});return response.end();}
        if(active>=4)return reply(response,429,'O teste está ocupado. Aguarde um instante.');
        if(request.method==='POST'&&(/\/generate-session$/.test(url.pathname)||/\/generate$/.test(url.pathname))&&(!permit('ai-minute',10,60000)||!permit('ai-day',300,86400000)))return reply(response,429,'Limite de geração deste servidor de teste atingido.');
        if(Number(request.headers['content-length'])>maxBody)return reply(response,413,'O corpo da solicitação excede o limite.');
        let acquired;try{acquired=databases.acquire(id);}catch{return reply(response,503,'Limite de sessões temporárias atingido. Aguarde uma sessão expirar.');}
        session=acquired.session;release=acquired.release;active++;
        env.DB=session.db;env.REQUEST_SIGNAL=AbortSignal.any([abort.signal,session.abort.signal]);
        const scopedCookie=baseCookie+'_'+hash(id).toString('hex').slice(0,16);
        const incoming=(request.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(scopedCookie+'='));
        if(incoming)headers.set('cookie',baseCookie+'='+incoming.slice(scopedCookie.length+1));
        headers.set('cf-connecting-ip',request.socket.remoteAddress||'unknown');
        response.scopedCookie=scopedCookie;
        endAfter=url.pathname==='/api/auth/logout'&&request.method==='POST';
      }
      const method=request.method;
      let body;
      if(!['GET','HEAD'].includes(method)){
        let count=0;body=Readable.toWeb(request).pipeThrough(new TransformStream({transform(chunk,controller){count+=chunk.byteLength;if(count>maxBody){controller.error(new Error('BODY_LIMIT'));return;}controller.enqueue(chunk);}}));
      }
      const input=new Request(url,{method,headers,...(body?{body,duplex:'half'}:{}),signal:abort.signal});
      const output=await worker.fetch(input,env);
      if(response.destroyed)return;
      const outgoing=Object.fromEntries(output.headers);delete outgoing['set-cookie'];
      const cookies=output.headers.getSetCookie();
      if(cookies.length&&response.scopedCookie)outgoing['Set-Cookie']=cookies.map(cookie=>cookie.replace(baseCookie+'=',response.scopedCookie+'=').replace(/Max-Age=604800/g,'Max-Age=3600'));
      response.writeHead(output.status,outgoing);
      if(output.body){for await(const chunk of output.body){if(response.destroyed)break;if(!response.write(Buffer.from(chunk)))await new Promise(resolve=>{response.once('drain',resolve);response.once('close',resolve);});}}
      response.end();
      if(endAfter&&output.status<400)databases.end(request.headers['x-dev-studio-session']);
    }catch{
      if(!response.headersSent)reply(response,500,'Não foi possível concluir a solicitação. Recarregue o teste.');else response.destroy();
    }finally{if(release){active--;release();}}
  });
  server.requestTimeout=120000;server.headersTimeout=15000;
  server.on('close',()=>{clearInterval(sweep);databases.close();});
  return{server,databases};
}
