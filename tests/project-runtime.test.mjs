import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REACT_NODE_STARTER} from '../project-starter.js';
import {compilePreview,checkProject,compileBackend} from '../server/project-compiler.mjs';
import {ProjectSandboxPool} from '../server/project-sandbox.mjs';
import {generateProject} from '../worker/project-generation.js';

const source=handler=>REACT_NODE_STARTER.map(file=>file.path==='server/handler.js'?{...file,content:handler}:file);
const project=()=>({id:crypto.randomUUID(),version:0});
const handler=`export default async function handle(req,ctx){
  if(req.path==='/api/register'){
    const user=ctx.db.insert('users',{email:req.body.email,passwordHash:ctx.crypto.hashPassword(req.body.password)});
    const token=ctx.crypto.randomToken();ctx.db.insert('sessions',{token,userId:user.id});
    return{status:201,headers:{'Set-Cookie':'app_session='+token+'; HttpOnly; Secure; SameSite=Strict; Max-Age=3600'},body:{id:user.id}};
  }
  if(req.path==='/api/check')return{status:200,body:{valid:ctx.crypto.verifyPassword(req.body.password,ctx.db.list('users')[0].passwordHash)}};
  if(req.path==='/api/me'){
    const token=(req.headers.cookie||'').split('app_session=')[1]?.split(';')[0];
    const session=ctx.db.list('sessions',{where:{token:token||''}})[0];return{status:session?200:401,body:{userId:session?.userId||null}};
  }
  if(req.path==='/api/items'){
    if(req.method==='POST')return{status:201,body:ctx.db.insert('items',{name:req.body.name})};
    return{status:200,body:ctx.db.list('items')};
  }
  let filesystem=false;try{const module='node:'+'fs';require(module);filesystem=true;}catch{}return{status:200,body:{host:typeof process,filesystem,network:typeof fetch}};
}`;
test('React JSX, local components, CSS and backend compile; unsupported modules cannot read host files',async()=>{
  const compiled=await compilePreview(REACT_NODE_STARTER);assert.equal(compiled.ok,true);assert.equal(compiled.kind,'react');assert.ok(compiled.javascript.length>1000);assert.match(compiled.css,/box-sizing/);
  assert.equal((await checkProject(REACT_NODE_STARTER)).ok,true);
  for(const name of ['node:fs','/etc/passwd','../../etc/passwd','https://outside.test/code.js']){
    const compiled=await compileBackend(source(`import value from '${name}';export default function handler(){return value;}`));assert.equal(compiled.ok,false,name);
  }
  const missing=REACT_NODE_STARTER.map(file=>file.path==='src/App.jsx'?{...file,content:"import Missing from './Missing.jsx';export default Missing;"}:file);
  assert.equal((await compilePreview(missing)).ok,false);
});
test('embedded backend runs real CRUD and password hashing, keeps cookies private and isolates sessions/projects',async t=>{
  const pool=new ProjectSandboxPool({maxProjects:3}),a=project(),b=project(),files=source(handler);t.after(()=>pool.close());
  const call=(session,project,url,method='GET',body)=>pool.execute(session,{project,files,request:{url,method,body}});
  assert.equal((await call('one',a,'/api/items','POST',{name:'Tarefa real'})).status,201);
  assert.equal((await call('one',a,'/api/items')).body[0].name,'Tarefa real');
  assert.equal((await call('one',b,'/api/items')).body.length,0);
  assert.equal((await call('two',a,'/api/items')).body.length,0);
  const account=await call('one',a,'/api/register','POST',{email:'test@example.test',password:'Example-password-123'});
  assert.equal(account.status,201);assert.equal(account.headers['set-cookie'],undefined);
  assert.equal((await call('one',a,'/api/me')).status,200);assert.equal((await call('two',a,'/api/me')).status,401);
  assert.equal((await call('one',a,'/api/check','POST',{password:'Example-password-123'})).body.valid,true);
  assert.equal((await call('one',a,'/api/check','POST',{password:'Wrong-password-123'})).body.valid,false);
  assert.deepEqual((await call('one',a,'/api/isolation')).body,{host:'undefined',filesystem:false,network:'undefined'});
  a.version++;
  const revised=source(handler.replace("name:req.body.name","name:req.body.name.toUpperCase()"));
  assert.equal((await pool.execute('one',{project:a,files:revised,request:{url:'/api/items',method:'POST',body:{name:'nova'}}})).body.name,'NOVA');
  assert.equal((await call('one',a,'/api/items')).body.length,2,'database survives code changes');
  pool.closeSession('one');assert.equal(pool.slots.size,1);assert.equal((await call('one',a,'/api/items')).body.length,0,'session ending discards its database');
});
test('infinite loops are interrupted, unsupported targets blocked and project capacity enforced',async t=>{
  const pool=new ProjectSandboxPool({maxProjects:1}),a=project();t.after(()=>pool.close());
  await assert.rejects(pool.execute('one',{project:a,files:source('export default function(){while(true){}}'),request:{method:'GET',url:'/api/loop'}}),/interrupted|tempo|backend/i);
  await assert.rejects(pool.execute('one',{project:a,files:REACT_NODE_STARTER,request:{method:'GET',url:'https://outside.test'}}),/inválida/);
  await assert.rejects(pool.prepare('two',{project:project(),files:REACT_NODE_STARTER}),/Limite/);
  pool.closeSession('one');assert.equal(pool.slots.size,0);
});
test('compiler feedback causes one correction and preserves all valid edits; repeated errors apply nothing',async()=>{
  const previous=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url,options)=>{
    const input=JSON.parse(options.body);calls++;
    if(calls===2)assert.match(JSON.stringify(input.input),/Arquivo importado/);
    const update={message:'Interface atualizada no projeto.',files:[{path:'src/App.jsx',content:calls===1?"import Bad from './Missing.jsx';export default Bad;":"export default function App(){return <h1>Pedido implementado</h1>}"},...(calls===1?[{path:'src/extra.css',content:'.extra{color:green}'}]:[])]};
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(update)}]}],usage:{input_tokens:1,output_tokens:2,total_tokens:3}});
  };
  try{
    const result=await generateProject({selected:{provider:'openai',key:'synthetic-provider-credential',model:'gpt-4.1'},instructions:'React',messages:[{role:'user',content:'Crie o sistema.'}],snapshot:REACT_NODE_STARTER,known:[],env:{CHECK_PROJECT:checkProject}});
    assert.equal(result.repaired,true);assert.equal(calls,2);assert.ok(result.files.some(file=>file.path==='src/extra.css'));assert.equal(result.usage.total_tokens,6);
    calls=0;
    await assert.rejects(generateProject({selected:{provider:'openai',key:'synthetic-provider-credential',model:'gpt-4.1'},instructions:'React',messages:[],snapshot:REACT_NODE_STARTER,known:[],env:{CHECK_PROJECT:async()=>({ok:false,errors:['Arquivo importado ausente']})}}),/arquivos anteriores foram mantidos/);
    assert.equal(calls,2);
  }finally{globalThis.fetch=previous;}
});
