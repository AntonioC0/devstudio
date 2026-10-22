import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {requestGeneration,modelFor,PROJECT_UPDATE_SCHEMA} from '../worker/providers.js';
import {api} from '../worker/api.js';
import {AppError} from '../worker/domain.js';
import {SKILLS} from '../skills.js';
import {PROJECT_INSTRUCTIONS} from '../project-policy.js';

const update={message:'Projeto atualizado.',files:[{path:'index.html',content:'<h1>Atualizado</h1>'}]};
const args={key:'test-provider-secret-123456',instructions:'Skills fixas',messages:[{role:'user',content:'Crie um projeto.'}]};
const openaiOutput=()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(update)}]}],usage:{input_tokens:10,output_tokens:20,total_tokens:30}});
const claudeOutput=()=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(update)}],usage:{input_tokens:10,output_tokens:20}});
async function mockFetch(fn,work){const previous=globalThis.fetch;globalThis.fetch=fn;try{return await work();}finally{globalThis.fetch=previous;}}
test('OpenAI adapter uses Responses auth and schema',async()=>mockFetch(async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer '+args.key);assert.equal(options.headers['x-api-key'],undefined);assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.instructions,args.instructions);assert.deepEqual(body.text.format.schema,PROJECT_UPDATE_SCHEMA);assert.ok(!options.body.includes(args.key));return openaiOutput();
},async()=>{const response=await requestGeneration({...args,provider:'openai',model:'gpt-4.1'});assert.deepEqual(response.update,update);assert.equal(response.usage.total_tokens,30);}));
test('Claude adapter uses Anthropic native headers, system instructions and JSON schema',async()=>mockFetch(async(url,options)=>{
  assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.headers['x-api-key'],args.key);assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['anthropic-version'],'2023-06-01');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.equal(body.system,args.instructions);assert.deepEqual(body.messages,args.messages);assert.deepEqual(body.output_config.format.schema,PROJECT_UPDATE_SCHEMA);assert.equal(body.store,undefined);assert.ok(!options.body.includes(args.key));return claudeOutput();
},async()=>{const response=await requestGeneration({...args,provider:'anthropic',model:'claude-sonnet-4-6'});assert.deepEqual(response.update,update);assert.equal(response.usage.total_tokens,30);assert.equal(response.provider,'anthropic');}));
test('models are validated against provider and cannot contain URLs or headers',()=>{
  assert.equal(modelFor('anthropic'), 'claude-sonnet-4-6');assert.equal(modelFor('openai',{OPENAI_MODEL:'gpt-4.1-mini'}),'gpt-4.1-mini');
  for(const [provider,model]of[['anthropic','gpt-4.1'],['openai','claude-sonnet-4-6'],['anthropic','https://private.test'],['openai','gpt\r\nHeader: injected']])assert.throws(()=>modelFor(provider,{},model),e=>e.status===422);
});
test('provider errors are sanitized and do not trigger another provider',async()=>{
  for(const provider of ['openai','anthropic'])for(const status of [400,401,403,404,429,500,529]){let calls=0;await mockFetch(async()=>{calls++;return new Response('upstream-sensitive-key-and-body',{status});},async()=>{await assert.rejects(requestGeneration({...args,provider,model:modelFor(provider)}),e=>{assert.ok(e instanceof AppError);assert.ok(!e.message.includes('upstream'));return e.status===(status===429?429:502);});});assert.equal(calls,1);}
});
test('Claude truncation, refusal and invalid JSON cannot apply project changes',async()=>{
  for(const response of [()=>Response.json({stop_reason:'max_tokens',content:[{type:'text',text:JSON.stringify(update)}]}),()=>Response.json({stop_reason:'refusal',content:[]}),()=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:'not-json'}]})])await mockFetch(async()=>response(),async()=>assert.rejects(requestGeneration({...args,provider:'anthropic',model:'claude-sonnet-4-6'}),e=>e instanceof AppError));
});
class Database{constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');}prepare(sql){const stmt=this.db.prepare(sql);let values=[];return{bind(...args){values=args;return this;},async first(){return stmt.get(...values)||null;},async all(){return{results:stmt.all(...values)};},async run(){const r=stmt.run(...values);return{meta:{changes:r.changes}};}};}async batch(items){this.db.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}}
let env,cookie,projectId,conversationId,gptId,claudeId;
const origin='https://studio.test',gptKey='gpt-private-opaque-key-123',claudeKey='claude-private-opaque-key-456';
async function call(path,method='GET',body){return api(new Request(origin+path,{method,headers:{'Content-Type':'application/json',...(method==='GET'?{}:{Origin:origin}),...(cookie?{Cookie:cookie}:{})},...(method==='GET'?{}:{body:JSON.stringify(body||{})})}),env);}
before(async()=>{const db=new Database();for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())db.db.exec(await readFile('drizzle/'+f,'utf8'));env={DB:db,CREDENTIALS_ENCRYPTION_KEY:'c1'.repeat(32),OPENAI_API_KEY:'workspace-test-private-key',OPENAI_MODEL:'gpt-4.1'};const account=await call('/api/auth/register','POST',{name:'Provider Tester',email:'providers@example.test',password:'Providers-password-123'});cookie=account.headers['Set-Cookie'].split(';')[0];const created=await call('/api/projects','POST',{name:'Multi-provider project'});projectId=created.data.project.id;conversationId=created.data.conversations[0].id;});
test('both API keys can coexist encrypted with independent models',async()=>{
  const gpt=await call(`/api/projects/${projectId}/apis`,'POST',{name:'Meu GPT',alias:'MEU_GPT',provider:'openai',key:gptKey,model:'gpt-4.1'});gptId=gpt.data.credential.id;
  const claude=await call(`/api/projects/${projectId}/apis`,'POST',{name:'Meu Claude',alias:'MEU_CLAUDE',provider:'anthropic',key:claudeKey,model:'claude-sonnet-4-6'});claudeId=claude.data.credential.id;
  const list=await call(`/api/projects/${projectId}/apis`);assert.equal(list.data.credentials.length,2);assert.ok(!JSON.stringify(list).includes(gptKey));assert.ok(!JSON.stringify(list).includes(claudeKey));assert.equal(list.data.credentials.find(c=>c.id===claudeId).model,'claude-sonnet-4-6');
});
test('corporate API credentials need no provider and cannot become an assistant',async()=>{
  const key='corporate-private-credential-for-tests';
  const created=await call(`/api/projects/${projectId}/apis`,'POST',{name:'ERP da empresa',alias:'ERP_EMPRESA',key});
  assert.equal(created.data.credential.provider,'other');assert.equal(created.data.credential.model,null);
  assert.ok(!JSON.stringify(created).includes(key));
  const stored=env.DB.db.prepare('SELECT encrypted_secret FROM api_credentials WHERE id=?').get(created.data.credential.id);
  assert.ok(!stored.encrypted_secret.includes(key));
  await assert.rejects(call(`/api/projects/${projectId}/api-selection`,'PUT',{alias:'ERP_EMPRESA'}),e=>e.status===422);
});
test('switching providers routes one request and preserves conversation and file state',async()=>{
  await call(`/api/projects/${projectId}/api-selection`,'PUT',{alias:'MEU_GPT'});
  await mockFetch(async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer '+gptKey);const instructions=JSON.parse(options.body).instructions;assert.ok(instructions.includes(PROJECT_INSTRUCTIONS));assert.match(instructions,/responsiva por padrão/);for(const skill of SKILLS)assert.ok(instructions.includes(skill.content));const context=JSON.parse(JSON.parse(options.body).input[0].content.split('\n').slice(1).join('\n'));assert.deepEqual(context.apis,[{alias:'ERP_EMPRESA',name:'ERP da empresa'}]);assert.ok(!options.body.includes('corporate-private-credential-for-tests'));return openaiOutput();},async()=>{const generated=await call(`/api/conversations/${conversationId}/generate`,'POST',{content:'Construir com GPT',request_id:crypto.randomUUID()});assert.equal(generated.data.messages.at(-1).provider,'openai');});
  await call(`/api/projects/${projectId}/api-selection`,'PUT',{alias:'MEU_CLAUDE'});
  const p=await call(`/api/projects/${projectId}`);assert.equal(p.data.project.assistant.provider,'anthropic');assert.equal(p.data.project.assistant.model,'claude-sonnet-4-6');
  await mockFetch(async(url,options)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.headers['x-api-key'],claudeKey);assert.ok(!options.body.includes(gptKey));assert.ok(!options.body.includes(claudeKey));const instructions=JSON.parse(options.body).system;assert.ok(instructions.includes(PROJECT_INSTRUCTIONS));assert.match(instructions,/responsiva por padrão/);for(const skill of SKILLS)assert.ok(instructions.includes(skill.content));const context=JSON.parse(JSON.parse(options.body).messages[0].content.split('\n').slice(1).join('\n'));assert.deepEqual(context.apis,[{alias:'ERP_EMPRESA',name:'ERP da empresa'}]);assert.match(options.body,/Construir com GPT/);return claudeOutput();},async()=>{const generated=await call(`/api/conversations/${conversationId}/generate`,'POST',{content:'Continuar com Claude',request_id:crypto.randomUUID()});assert.equal(generated.data.messages.length,4);assert.equal(generated.data.messages.at(-1).provider,'anthropic');assert.equal(generated.data.messages.at(-1).model,'claude-sonnet-4-6');assert.equal(generated.data.files.find(f=>f.path==='index.html').content,'<h1>Atualizado</h1>');});
});
test('model can be edited without resending or changing its encrypted key',async()=>{
  const before=env.DB.db.prepare('SELECT encrypted_secret FROM api_credentials WHERE id=?').get(claudeId).encrypted_secret;
  await call(`/api/projects/${projectId}/apis/${claudeId}`,'PATCH',{model:'claude-opus-4-6'});
  assert.equal(env.DB.db.prepare('SELECT encrypted_secret FROM api_credentials WHERE id=?').get(claudeId).encrypted_secret,before);
  assert.equal((await call(`/api/projects/${projectId}`)).data.project.assistant.model,'claude-opus-4-6');
  await assert.rejects(call(`/api/projects/${projectId}/apis/${claudeId}`,'PATCH',{model:'gpt-4.1'}),e=>e.status===422);
  await assert.rejects(call(`/api/projects/${projectId}/apis/${gptId}`,'PATCH',{model:gptKey}),e=>e.status===422);
});
test('Claude failure preserves chosen provider and never falls back to managed GPT',async()=>{
  let calls=0;await mockFetch(async url=>{calls++;assert.equal(url,'https://api.anthropic.com/v1/messages');return new Response('{}',{status:429});},async()=>assert.rejects(call(`/api/conversations/${conversationId}/generate`,'POST',{content:'Sem fallback',request_id:crypto.randomUUID()}),e=>e.status===429));assert.equal(calls,1);assert.equal((await call(`/api/projects/${projectId}`)).data.project.assistant.provider,'anthropic');
});
