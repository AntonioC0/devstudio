import {AppError,requireText} from './domain.js';
import {redactSecrets,rejectSecrets,exactFields} from './secrets.js';
import {modelFor,supportedProvider} from './providers.js';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const toHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function fromHex(hex){if(typeof hex!=='string'||hex.length%2||!/^[a-f0-9]+$/i.test(hex))throw new Error('Invalid encoding');return Uint8Array.from(hex.match(/../g),v=>parseInt(v,16));}
function context(record){return encoder.encode(JSON.stringify([record.id,record.user_id,record.project_id,record.alias]));}
async function masterKey(env){
  if(!/^[a-f0-9]{64}$/i.test(env.CREDENTIALS_ENCRYPTION_KEY||''))throw new AppError(503,'O cofre de APIs ainda não está configurado no servidor.');
  return crypto.subtle.importKey('raw',fromHex(env.CREDENTIALS_ENCRYPTION_KEY),'AES-GCM',false,['encrypt','decrypt']);
}
export async function sealSecret(secret,record,env){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await masterKey(env);const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:context(record)},key,encoder.encode(secret));return `v1:${toHex(iv)}:${toHex(new Uint8Array(ciphertext))}`;}
export async function openSecret(record,env){
  const key=await masterKey(env);
  try{const [version,iv,cipher,...extra]=record.encrypted_secret.split(':');if(version!=='v1'||extra.length)throw new Error('Invalid format');return decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromHex(iv),additionalData:context(record)},key,fromHex(cipher)));}
  catch{throw new AppError(503,'Não foi possível acessar uma credencial do cofre. Verifique a configuração de criptografia no servidor.');}
}
export async function projectSecrets(db,env,projectId,userId){
  const rows=(await db.prepare('SELECT c.* FROM api_credentials c JOIN projects p ON p.id=c.project_id WHERE c.project_id=? AND c.user_id=? AND p.user_id=?').bind(projectId,userId,userId).all()).results;
  const known=[env.OPENAI_API_KEY,...(env.PLATFORM_SECRETS||[])].filter(Boolean);
  for(const row of rows)known.push(await openSecret(row,env));
  return known;
}
export async function resolveApiKey(db,env,userId,projectId,alias){
  const row=await db.prepare('SELECT c.* FROM api_credentials c JOIN projects p ON p.id=c.project_id WHERE c.project_id=? AND c.alias=? AND c.user_id=? AND p.user_id=?').bind(projectId,alias,userId,userId).first();
  if(!row)throw new AppError(404,'API não encontrada neste projeto.');
  return{key:await openSecret(row,env),provider:row.provider,model:supportedProvider(row.provider)?modelFor(row.provider,env,row.model):null};
}
function metadata(row,env){return{id:row.id,name:row.name,alias:row.alias,provider:row.provider,model:supportedProvider(row.provider)?modelFor(row.provider,env,row.model):null,created_at:row.created_at,updated_at:row.updated_at,configured:true};}
export function auditStatement(db,userId,projectId,action,resource){return db.prepare('INSERT INTO security_events(id,project_id,user_id,action,resource,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),projectId,userId,action,resource,Date.now());}
export async function vaultList(db,env,userId,project){
  const [rows,events]=await Promise.all([db.prepare('SELECT id,name,alias,provider,model,created_at,updated_at FROM api_credentials WHERE project_id=? AND user_id=? ORDER BY created_at DESC').bind(project.id,userId).all(),db.prepare('SELECT action,resource,created_at FROM security_events WHERE project_id=? AND user_id=? ORDER BY created_at DESC LIMIT 20').bind(project.id,userId).all()]);
  const credentials=rows.results.map(row=>metadata(row,env)),active=credentials.find(c=>c.alias===project.active_api_alias);
  return{credentials,active_alias:project.active_api_alias||null,active_provider:active?.provider||'openai',active_model:active?.model||modelFor('openai',env),vault_ready:/^[a-f0-9]{64}$/i.test(env.CREDENTIALS_ENCRYPTION_KEY||''),events:events.results};
}
// Caller holds the project lease. Only current-project records are scanned and changed.
export async function cleanupProject(db,userId,projectId,known){
  const project=await db.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').bind(projectId,userId).first();
  if(!project)throw new AppError(404,'Projeto não encontrado.');
  let fields=0,occurrences=0;const changes=[];
  const clean=value=>{const result=redactSecrets(value,known);occurrences+=result.count;if(result.count)fields++;return result;};
  const name=clean(project.name),description=clean(project.description),instructions=clean(project.instructions);
  if(name.count||description.count||instructions.count)changes.push(db.prepare('UPDATE projects SET name=?,description=?,instructions=? WHERE id=? AND user_id=?').bind(name.text,description.text,instructions.text,projectId,userId));
  const files=(await db.prepare('SELECT path,content FROM files WHERE project_id=?').bind(projectId).all()).results;
  for(const file of files){const result=clean(file.content);if(result.count)changes.push(db.prepare('UPDATE files SET content=?,updated_at=? WHERE project_id=? AND path=?').bind(result.text,Date.now(),projectId,file.path));}
  const conversations=(await db.prepare('SELECT id,title FROM conversations WHERE project_id=?').bind(projectId).all()).results;
  for(const c of conversations){const result=clean(c.title);if(result.count)changes.push(db.prepare('UPDATE conversations SET title=? WHERE id=? AND project_id=?').bind(result.text,c.id,projectId));}
  for(let offset=0;;offset+=200){
    const page=(await db.prepare('SELECT m.id,m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.project_id=? ORDER BY m.id LIMIT 200 OFFSET ?').bind(projectId,offset).all()).results;
    for(const m of page){const result=clean(m.content);if(result.count)changes.push(db.prepare('UPDATE messages SET content=? WHERE id=?').bind(result.text,m.id));}
    if(page.length<200)break;
  }
  for(let start=0;start<changes.length;start+=40)await db.batch(changes.slice(start,start+40));
  if(fields)await db.prepare('UPDATE projects SET version=version+1,updated_at=? WHERE id=? AND user_id=?').bind(Date.now(),projectId,userId).run();
  return{fields,occurrences};
}
export async function vaultMutation(db,env,user,project,method,recordId,data){
  const lease=crypto.randomUUID(),stamp=Date.now();
  const lock=await db.prepare('UPDATE projects SET busy_until=?,busy_token=? WHERE id=? AND user_id=? AND busy_until<? RETURNING id').bind(stamp+120000,lease,project.id,user.id,stamp).first();
  if(!lock)throw new AppError(409,'Aguarde a operação atual do projeto terminar.');
  try{
    const known=await projectSecrets(db,env,project.id,user.id);
    if(method==='CLEAN'){
      exactFields(data,[]);const cleaned=await cleanupProject(db,user.id,project.id,known);await auditStatement(db,user.id,project.id,'secrets_cleaned',String(cleaned.fields)).run();return{cleaned};
    }
    if(method==='SELECT'){
      exactFields(data,['alias']);
      if(data.alias!==null){requireText(data.alias,'Alias',48);const selected=await resolveApiKey(db,env,user.id,project.id,data.alias);if(!supportedProvider(selected.provider))throw new AppError(422,'O assistente aceita credenciais OpenAI ou Anthropic / Claude. As demais ficam guardadas para integrações futuras.');}
      await db.batch([db.prepare('UPDATE projects SET active_api_alias=?,updated_at=? WHERE id=? AND user_id=?').bind(data.alias,stamp,project.id,user.id),auditStatement(db,user.id,project.id,'api_selected',data.alias||'workspace_default')]);return{ok:true};
    }
    if(method==='POST'){
      exactFields(data,['name','alias','provider','key','model']);data={...data,provider:data.provider??'other'};const name=requireText(data.name,'Nome da API',80),alias=requireText(data.alias,'Alias',48);
      if(!/^[A-Z][A-Z0-9_]{2,47}$/.test(alias))throw new AppError(422,'Use um alias de 3 a 48 letras maiúsculas, números e sublinhados.');
      rejectSecrets(name,known);rejectSecrets(alias,known);
      if(!['openai','anthropic','other'].includes(data.provider))throw new AppError(422,'Provedor não permitido.');
      const count=await db.prepare('SELECT COUNT(*) AS n FROM api_credentials WHERE project_id=? AND user_id=?').bind(project.id,user.id).first();if(count.n>=10)throw new AppError(422,'Cada projeto pode cadastrar até 10 APIs.');
      if(await db.prepare('SELECT id FROM api_credentials WHERE project_id=? AND alias=?').bind(project.id,alias).first())throw new AppError(409,'Este alias já existe no projeto.');
      const key=requireText(data.key,'Chave',8192,8);if(/[\r\n\x00]/.test(key))throw new AppError(422,'A chave contém caracteres não permitidos.');
      const model=supportedProvider(data.provider)?modelFor(data.provider,env,data.model):null;
      if(data.provider==='other'&&data.model)throw new AppError(422,'Este provedor não tem um modelo de assistente disponível.');
      if(model)rejectSecrets(model,[...known,key]);
      const row={id:crypto.randomUUID(),user_id:user.id,project_id:project.id,alias,name,provider:data.provider,model,created_at:stamp,updated_at:stamp};
      const ciphertext=await sealSecret(key,row,env);
      const cleaned=await cleanupProject(db,user.id,project.id,[...known,key]);
      await db.batch([db.prepare('INSERT INTO api_credentials(id,project_id,user_id,name,alias,provider,model,encrypted_secret,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(row.id,project.id,user.id,name,alias,row.provider,model,ciphertext,stamp,stamp),auditStatement(db,user.id,project.id,'api_created',alias)]);
      return{credential:metadata(row,env),cleaned};
    }
    const row=await db.prepare('SELECT * FROM api_credentials WHERE id=? AND project_id=? AND user_id=?').bind(recordId,project.id,user.id).first();if(!row)throw new AppError(404,'API não encontrada.');
    if(method==='PATCH'){
      exactFields(data,['key','model']);
      if(!Object.hasOwn(data,'key')&&!Object.hasOwn(data,'model'))throw new AppError(422,'Informe uma nova chave ou um modelo.');
      const model=Object.hasOwn(data,'model')?modelFor(row.provider,env,data.model):row.model;
      if(model)rejectSecrets(model,known);
      let ciphertext=row.encrypted_secret,cleaned={fields:0,occurrences:0};
      if(Object.hasOwn(data,'key')){const key=requireText(data.key,'Nova chave',8192,8);if(/[\r\n\x00]/.test(key))throw new AppError(422,'A chave contém caracteres não permitidos.');if(model)rejectSecrets(model,[key]);ciphertext=await sealSecret(key,row,env);cleaned=await cleanupProject(db,user.id,project.id,[...known,key]);}
      await db.batch([db.prepare('UPDATE api_credentials SET encrypted_secret=?,model=?,updated_at=? WHERE id=? AND project_id=? AND user_id=?').bind(ciphertext,model,stamp,row.id,project.id,user.id),auditStatement(db,user.id,project.id,Object.hasOwn(data,'key')?'api_rotated':'api_model_changed',row.alias)]);return{credential:metadata({...row,model,updated_at:stamp},env),cleaned};
    }
    if(method==='DELETE'){
      exactFields(data,[]);const cleaned=await cleanupProject(db,user.id,project.id,known);
      await db.batch([db.prepare('DELETE FROM api_credentials WHERE id=? AND project_id=? AND user_id=?').bind(row.id,project.id,user.id),db.prepare('UPDATE projects SET active_api_alias=NULL WHERE id=? AND user_id=? AND active_api_alias=?').bind(project.id,user.id,row.alias),auditStatement(db,user.id,project.id,'api_deleted',row.alias)]);return{ok:true,cleaned};
    }
    throw new AppError(405,'Método não permitido.');
  }finally{await db.prepare('UPDATE projects SET busy_until=0,busy_token=NULL WHERE id=? AND busy_token=?').bind(project.id,lease).run();}
}
