import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApplication} from '../server/app.mjs';
import {MemoryDatabase,SessionDatabases} from '../server/database.mjs';

const origin='https://studio.test',accessPassword='render-test-access-password-only';
const authorization='Basic '+Buffer.from('devstudio:'+accessPassword).toString('base64');
async function running(t,options={}){
  const app=createApplication({origin,accessPassword,...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base='http://127.0.0.1:'+app.server.address().port;
  t.after(()=>new Promise(resolve=>{app.server.close(resolve);app.server.closeAllConnections();}));
  async function request(path,{method='GET',data,tab=crypto.randomUUID(),cookie,auth=true,extra={}}={}){
    return fetch(base+path,{method,headers:{...(auth?{Authorization:authorization}:{}),'X-Dev-Studio-Session':tab,'Content-Type':'application/json',...(method==='GET'?{}:{Origin:origin}),...(cookie?{Cookie:cookie}:{}),...extra},...(method==='GET'?{}:{body:JSON.stringify(data||{})})});
  }
  return{...app,request};
}
test('Render startup requires an access secret and an HTTPS production origin',()=>{
  assert.throws(()=>createApplication({origin}),/ACCESS_PASSWORD/);
  assert.throws(()=>createApplication({origin:'http://public.test',accessPassword}),/HTTPS/);
  assert.throws(()=>createApplication({origin:'https://studio.test/extra',accessPassword}),/PUBLIC_ORIGIN/);
});
test('health works without credentials; app and API require private test access',async t=>{
  const {request,databases}=await running(t);
  const health=await request('/healthz',{auth:false});assert.equal(health.status,200);
  const denied=await request('/',{auth:false});assert.equal(denied.status,401);assert.match(denied.headers.get('www-authenticate'),/Basic/);
  assert.equal(databases.sessions.size,0);
  const home=await request('/');assert.equal(home.status,200);assert.match(await home.text(),/Dev Studio/);
  const config=await request('/api/config',{auth:false});assert.equal(config.status,401);
  const badOrigin=await request('/api/auth/register',{method:'POST',extra:{Origin:'https://hostile.test'}});assert.equal(badOrigin.status,403);
  assert.equal(databases.sessions.size,0);
});
test('each browser tab has isolated ephemeral accounts and projects with independent HttpOnly cookies',async t=>{
  const {request,databases}=await running(t),a=crypto.randomUUID(),b=crypto.randomUUID();
  const register=async(tab,name)=>{
    const response=await request('/api/auth/register',{method:'POST',tab,data:{name,email:'same@example.test',password:'Render-test-password-123'}});
    assert.equal(response.status,201);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);return cookie.split(';')[0];
  };
  const cookieA=await register(a,'Alice'),cookieB=await register(b,'Bob');
  assert.notEqual(cookieA.split('=')[0],cookieB.split('=')[0]);
  const combined=cookieA+'; '+cookieB;
  assert.equal((await (await request('/api/auth/me',{tab:a,cookie:combined})).json()).user.name,'Alice');
  assert.equal((await (await request('/api/auth/me',{tab:b,cookie:combined})).json()).user.name,'Bob');
  const created=await request('/api/projects',{method:'POST',tab:a,cookie:combined,data:{name:'Só da aba A'}});assert.equal(created.status,201);
  const project=(await created.json()).project;
  const fromB=await request('/api/projects/'+project.id,{tab:b,cookie:combined});assert.equal(fromB.status,404);
  assert.equal((await (await request('/api/projects',{tab:b,cookie:combined})).json()).projects.length,0);
  for(const session of databases.sessions.values())assert.equal(session.db.native.prepare('PRAGMA database_list').get().file,'');
  const ended=await request('/api/test-session',{method:'DELETE',tab:a,cookie:combined});assert.equal(ended.status,204);assert.equal(databases.sessions.size,1);
  const next=await request('/api/auth/me',{tab:a,cookie:combined});assert.equal((await next.json()).user,null);
  const freshCookie=await register(a,'Novo teste');
  assert.equal((await (await request('/api/projects',{tab:a,cookie:freshCookie})).json()).projects.length,0);
});
test('Render logout discards the whole temporary database',async t=>{
  const {request,databases}=await running(t),tab=crypto.randomUUID();
  const signed=await request('/api/auth/register',{method:'POST',tab,data:{name:'Teste',email:'logout@example.test',password:'Logout-test-password-123'}});
  const cookie=signed.headers.get('set-cookie').split(';')[0];assert.equal(signed.status,201);
  const logout=await request('/api/auth/logout',{method:'POST',tab,cookie});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);assert.equal(databases.sessions.size,0);
  const reset=await request('/api/auth/me',{tab,cookie});assert.equal((await reset.json()).user,null);
});
test('temporary databases expire, enforce capacity and close safely after active operations release',()=>{
  let now=0;const databases=new SessionDatabases({clock:()=>now,maxSessions:1,idleMs:100,maxAgeMs:1000});
  const first=databases.acquire('one');first.release();
  assert.throws(()=>databases.acquire('two'),/SESSION_CAPACITY/);
  now=101;databases.sweep();assert.ok(first.session.db.closed);
  const active=databases.acquire('two');databases.end('two');assert.ok(active.session.abort.signal.aborted);assert.equal(active.session.db.closed,false);
  active.release();assert.ok(active.session.db.closed);databases.close();
});
test('SQLite batches preserve atomicity and do not interleave transactions',async()=>{
  const db=new MemoryDatabase();
  try{
    const insert=id=>db.prepare('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)').bind(id,id+'@example.test','Teste','synthetic-test-hash',1);
    await Promise.all([db.batch([insert('a')]),db.batch([insert('b')])]);
    await assert.rejects(db.batch([insert('c'),insert('a')]));
    assert.equal(db.native.prepare('SELECT COUNT(*) AS n FROM users').get().n,2);
  }finally{db.close();}
});

test('authenticated project preview and embedded API work over HTTP and cannot cross tabs',async t=>{
  const {request,sandboxes}=await running(t),tab=crypto.randomUUID(),other=crypto.randomUUID();
  async function register(id,email){const response=await request('/api/auth/register',{method:'POST',tab:id,data:{name:'React Tester',email,password:'React-test-password-123'}});assert.equal(response.status,201);return response.headers.get('set-cookie').split(';')[0];}
  const cookie=await register(tab,'react@example.test'),otherCookie=await register(other,'other@example.test');
  const created=await request('/api/projects',{method:'POST',tab,cookie,data:{name:'React integrado'}});const project=(await created.json()).project;
  const endpoint='/api/projects/'+project.id;
  const preview=await request(endpoint+'/preview',{method:'POST',tab,cookie,data:{version:project.version}});assert.equal(preview.status,200);assert.equal((await preview.json()).preview.kind,'react');
  const started=await request(endpoint+'/run',{method:'POST',tab,cookie,data:{version:project.version}});assert.equal(started.status,200);assert.equal((await started.json()).runtime.mode,'embedded');
  const api=await request(endpoint+'/runtime-request',{method:'POST',tab,cookie,data:{version:project.version,request:{method:'GET',url:'/api/health'}}});assert.equal(api.status,200);assert.equal((await api.json()).response.body.status,'ok');
  assert.equal((await request(endpoint+'/runtime-request',{method:'POST',tab:other,cookie:otherCookie,data:{version:0,request:{method:'GET',url:'/api/health'}}})).status,404);
  assert.equal((await request(endpoint+'/preview',{method:'POST',tab,cookie,data:{version:999}})).status,409);
  const config=await (await request('/api/config',{tab,cookie})).json();assert.deepEqual(config.runtime,{configured:true,mode:'embedded',temporary:true});
  assert.equal(sandboxes.slots.size,1);
  await request('/api/test-session',{method:'DELETE',tab,cookie});assert.equal(sandboxes.slots.size,0);
});

test('chat generation applies React and handler files then serves their real backend inside the same application',async t=>{
  const {request}=await running(t,{openaiKey:'synthetic-chat-provider-credential'}),tab=crypto.randomUUID();
  const registered=await request('/api/auth/register',{method:'POST',tab,data:{name:'Chat Tester',email:'chat-runtime@example.test',password:'Chat-test-password-123'}});
  const cookie=registered.headers.get('set-cookie').split(';')[0];
  const created=await request('/api/projects',{method:'POST',tab,cookie,data:{name:'Tarefas pelo chat'}});const initial=(await created.json()).project;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    if(url!=='https://api.openai.com/v1/responses')return originalFetch(url,options);
    const body=JSON.parse(options.body);assert.match(body.instructions,/Não coloque nele árvores de pastas/);assert.match(body.instructions,/ctx.db.insert/);
    const update={message:'Seu gerenciador de tarefas está pronto para testar aqui.',files:[{path:'src/App.jsx',content:"import React from 'react';export default function App(){return <h1>Minhas tarefas</h1>}"},{path:'server/handler.js',content:"export default function handler(req,ctx){if(req.method==='POST')return{status:201,body:ctx.db.insert('tasks',{title:req.body.title})};return{status:200,body:ctx.db.list('tasks')};}"}]};
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(update)}]}]});
  };
  try{
    const response=await request('/api/projects/'+initial.id+'/generate-session',{method:'POST',tab,cookie,data:{content:'Crie meu gerenciador de tarefas.',request_id:crypto.randomUUID(),history:[]}});
    const generated=await response.json();assert.equal(response.status,200,generated.detail);assert.equal(generated.changed.length,2);assert.ok(generated.validation.checks.length>0);assert.match(generated.reply,/pronto para testar aqui/);
    const run=(method,body)=>request('/api/projects/'+initial.id+'/runtime-request',{method:'POST',tab,cookie,data:{version:generated.project.version,request:{method,url:'/api/tasks',body}}});
    assert.equal((await (await run('POST',{title:'Criado no backend'})).json()).response.status,201);
    assert.equal((await (await run('GET')).json()).response.body[0].title,'Criado no backend');
  }finally{globalThis.fetch=originalFetch;}
});
