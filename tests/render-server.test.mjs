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
