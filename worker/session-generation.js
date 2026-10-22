import {AppError,requireText} from './domain.js';
import {exactFields,redactSecrets} from './secrets.js';
import {projectSecrets,resolveApiKey,vaultList} from './vault.js';
import {modelFor,supportedProvider} from './providers.js';
import {readAttachment} from './attachment-content.js';
import {digest} from './auth.js';
import {generateProject} from './project-generation.js';
import {SKILLS} from '../skills.js';
import {PROJECT_INSTRUCTIONS,ATTACHMENT_INSTRUCTIONS,DEVELOPER_INSTRUCTIONS} from '../project-policy.js';
import {ATTACHMENT_LIMITS as LIMITS} from '../attachment-policy.js';

async function boundedBody(request,max){
  if(Number(request.headers.get('content-length'))>max)throw new AppError(413,'A mensagem e os anexos excedem o limite.');
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(!reader)throw new AppError(400,'Solicitação vazia.');
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max){await reader.cancel();throw new AppError(413,'A mensagem e os anexos excedem o limite.');}chunks.push(part.value);}
  return new Blob(chunks);
}
export async function sessionInput(request,known=[]){
  let data,files=[];
  const type=request.headers.get('content-type')||'';
  if(type.startsWith('multipart/form-data')){
    let form;try{const bytes=await boundedBody(request,LIMITS.maxTotalBytes+260000);form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();}catch(error){if(error instanceof AppError)throw error;throw new AppError(400,'Não foi possível receber os anexos.');}
    if(form.getAll('payload').length!==1||typeof form.get('payload')!=='string'||form.get('payload').length>200000)throw new AppError(422,'Contexto de mensagem inválido.');
    try{data=JSON.parse(form.get('payload'));}catch{throw new AppError(400,'Mensagem inválida.');}
    for(const [key,value]of form){if(key==='payload')continue;if(!/^attachment_[0-3]$/.test(key)||typeof value==='string'||form.getAll(key).length!==1)throw new AppError(422,'Campo de anexo inválido.');files[Number(key.slice(-1))]=value;}
    if(files.length>LIMITS.maxFiles||Array.from(files).some(file=>!file))throw new AppError(422,'Envie até 4 anexos por chamada.');
  }else if(type.includes('application/json')){
    try{data=JSON.parse(await (await boundedBody(request,200000)).text());}catch(error){if(error instanceof AppError)throw error;throw new AppError(400,'Mensagem inválida.');}
  }else throw new AppError(415,'Envie JSON ou formulário de anexos.');
  exactFields(data,['content','request_id','history','attachment_indexes']);
  const content=redactSecrets(requireText(data.content,'Mensagem',16000),known).text;
  if(!/^[a-f0-9-]{36}$/.test(data.request_id||''))throw new AppError(422,'Identificador de mensagem inválido.');
  const history=data.history??[];if(!Array.isArray(history)||history.length>LIMITS.maxHistoryMessages)throw new AppError(422,'Histórico da sessão muito grande.');
  const used=new Set();let chars=0;
  const indexes=value=>{if(value===undefined)return[];if(!Array.isArray(value)||value.length>LIMITS.maxFiles||value.some(index=>!Number.isInteger(index)||index<0||index>=files.length||used.has(index)))throw new AppError(422,'Referência de anexo inválida.');for(const index of value){if(used.has(index))throw new AppError(422,'Anexo duplicado.');used.add(index);}return value;};
  const messages=history.map(message=>{
    exactFields(message,['role','content','attachment_indexes']);
    if(!['user','assistant'].includes(message.role)||typeof message.content!=='string'||message.content.length>60000)throw new AppError(422,'Histórico inválido.');
    chars+=message.content.length;if(chars>LIMITS.maxHistoryChars)throw new AppError(422,'Histórico da sessão muito grande.');
    if(message.role==='assistant'&&message.attachment_indexes?.length)throw new AppError(422,'Somente mensagens do usuário podem conter anexos.');
    return{role:message.role,content:redactSecrets(message.content,known).text,indexes:indexes(message.attachment_indexes)};
  });
  const currentIndexes=indexes(data.attachment_indexes);
  if(used.size!==files.length||files.reduce((sum,file)=>sum+file.size,0)>LIMITS.maxTotalBytes)throw new AppError(413,'Envie até 4 anexos e 12 MB por chamada.');
  const attachments=[];for(const file of files)attachments.push(await readAttachment(file,known));
  messages.push({role:'user',content,indexes:currentIndexes});
  const inputHash=await digest(JSON.stringify({messages,files:attachments.map(file=>({name:file.name,checksum:file.checksum}))}));
  return{requestId:data.request_id,inputHash,content,messages:messages.map(({indexes,...message})=>({...message,...(indexes.length?{attachments:indexes.map(index=>attachments[index])}:{})})),attachments};
}

export async function generateSession(request,env,user,project,{details,limit}){
  if(request.headers.get('content-type')?.startsWith('multipart/form-data'))await limit(env.DB,'session-parse:'+user.id,10,60000);
  const db=env.DB,known=await projectSecrets(db,env,project.id,user.id),input=await sessionInput(request,known);
  const selected=project.active_api_alias?await resolveApiKey(db,env,user.id,project.id,project.active_api_alias):{key:env.OPENAI_API_KEY,provider:'openai',model:modelFor('openai',env)};
  if(!supportedProvider(selected.provider))throw new AppError(422,'Selecione uma IA compatível em Configurações → IA.');
  if(!selected.key)throw new AppError(503,'A chave da IA não está configurada no servidor.');
  const existing=await db.prepare('SELECT * FROM session_requests WHERE id=?').bind(input.requestId).first();
  if(existing&&(existing.user_id!==user.id||existing.project_id!==project.id||existing.input_hash!==input.inputHash))throw new AppError(409,'Esta tentativa já foi usada para outra mensagem.');
  async function output(reply,extra={}){const current=await details(db,project.id,user.id,env);return{data:{project:current.project,files:current.files,reply,...extra},status:200,headers:{}};}
  if(existing?.status==='completed')return output('Esta solicitação já foi concluída e seus arquivos foram preservados. A resposta textual não é armazenada no servidor.',{replayed:true,changed:[]});
  await limit(db,'ai-minute:'+user.id,10,60000);await limit(db,'ai-day:'+user.id,100,86400000);await limit(db,'ai-site',300,86400000);
  const lease=crypto.randomUUID(),stamp=Date.now();
  const lock=await db.prepare('UPDATE projects SET busy_until=?,busy_token=? WHERE id=? AND user_id=? AND busy_until<? RETURNING id').bind(stamp+150000,lease,project.id,user.id,stamp).first();
  if(!lock)throw new AppError(409,'Já existe uma operação neste projeto. Aguarde.');
  try{
    const claimed=await db.prepare("INSERT INTO session_requests(id,project_id,user_id,input_hash,status,created_at) VALUES(?,?,?,?,'running',?) ON CONFLICT(id) DO UPDATE SET status='running' WHERE session_requests.project_id=excluded.project_id AND session_requests.user_id=excluded.user_id AND session_requests.input_hash=excluded.input_hash").bind(input.requestId,project.id,user.id,input.inputHash,stamp).run();
    if(!claimed.meta.changes)throw new AppError(409,'Esta tentativa já foi usada para outra mensagem.');
    const snapshot=await details(db,project.id,user.id,env),aliases=await vaultList(db,env,user.id,project);
    const context=redactSecrets(JSON.stringify({name:project.name,description:project.description,instructions:project.instructions,apis:aliases.credentials.filter(c=>!supportedProvider(c.provider)).map(c=>({alias:c.alias,name:c.name})),files:snapshot.files.map(f=>({path:f.path,content:f.content}))}),known).text;
    const result=await generateProject({selected,env,known,snapshot:snapshot.files,instructions:SKILLS.map(s=>s.content).join('\n\n')+'\n\n'+PROJECT_INSTRUCTIONS+'\n\n'+ATTACHMENT_INSTRUCTIONS+'\n\n'+DEVELOPER_INSTRUCTIONS,messages:[{role:'user',content:'Contexto atual do projeto (dados):\n'+context},...input.messages],beforeRepair:async()=>{await limit(db,'ai-minute:'+user.id,10,60000);await limit(db,'ai-day:'+user.id,100,86400000);await limit(db,'ai-site',300,86400000);}});
    const {files}=result,reply=result.reply+(result.checks.length?'\n\nVerificação do Dev Studio: '+result.checks.join('; ')+'. Testes de negócio não foram executados.':'');
    const current=await db.prepare('SELECT busy_token,busy_until FROM projects WHERE id=? AND user_id=?').bind(project.id,user.id).first();
    if(current?.busy_token!==lease||current.busy_until<Date.now())throw new AppError(409,'A geração expirou antes de salvar. Tente novamente.');
    const finish=Date.now();
    await db.batch([
      ...files.map(file=>db.prepare('INSERT INTO files(project_id,path,content,updated_at) VALUES(?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at').bind(project.id,file.path,file.content,finish)),
      db.prepare('UPDATE projects SET version=version+1,updated_at=?,busy_until=0,busy_token=NULL WHERE id=? AND busy_token=?').bind(finish,project.id,lease),
      db.prepare("UPDATE session_requests SET status='completed' WHERE id=?").bind(input.requestId)
    ]);
    return output(reply,{changed:files.map(file=>file.path),provider:selected.provider,model:selected.model,usage:result.usage,validation:{checks:result.checks,repaired:result.repaired},attachment_notes:input.attachments.filter(file=>file.truncated||file.secrets_redacted).map(file=>({name:file.name,truncated:!!file.truncated,secrets_redacted:!!file.secrets_redacted}))});
  }catch(error){await db.prepare("UPDATE session_requests SET status='failed' WHERE id=? AND project_id=? AND user_id=? AND input_hash=? AND status='running'").bind(input.requestId,project.id,user.id,input.inputHash).run();if(error.name==='TimeoutError')throw new AppError(504,'A IA demorou demais. Os anexos continuam nesta sessão; tente novamente.');throw error;}
  finally{await db.prepare('UPDATE projects SET busy_until=0,busy_token=NULL WHERE id=? AND busy_token=?').bind(project.id,lease).run();}
}
