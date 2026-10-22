import {AppError} from './domain.js';
import {PROVIDERS} from '../provider-config.js';

export const PROJECT_UPDATE_SCHEMA={type:'object',properties:{message:{type:'string'},files:{type:'array',items:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content'],additionalProperties:false}}},required:['message','files'],additionalProperties:false};
export function supportedProvider(provider){return Object.hasOwn(PROVIDERS,provider);}
export function modelFor(provider,env={},configured){
  if(!supportedProvider(provider))throw new AppError(422,'Este provedor está disponível apenas no cofre.');
  const fallback=provider==='openai'?(env.OPENAI_MODEL||PROVIDERS.openai.defaultModel):(env.ANTHROPIC_MODEL||PROVIDERS.anthropic.defaultModel);
  const model=configured==null||configured===''?fallback:configured;
  if(typeof model!=='string'||model.length>100||!model||model!==model.trim()||!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(model))throw new AppError(422,'Informe um identificador de modelo válido, com até 100 caracteres.');
  if(provider==='anthropic'&&!/^claude-[A-Za-z0-9._-]+$/.test(model))throw new AppError(422,'Para Anthropic, informe um modelo Claude, como claude-sonnet-4-6.');
  if(provider==='openai'&&/^claude-/i.test(model))throw new AppError(422,'Este modelo é da Anthropic. Cadastre uma credencial Anthropic / Claude.');
  return model;
}

async function providerResponse(response,provider){
  const name=PROVIDERS[provider].shortName;
  if(!response.ok){
    await response.body?.cancel();
    if(response.status===429)throw new AppError(429,`${name} atingiu o limite de uso ou saldo. Sua mensagem continua no chat aberto; tente novamente mais tarde.`);
    if(response.status===401||response.status===403)throw new AppError(502,`${name} recusou a credencial ou o acesso. Verifique a chave e as permissões em Configurações → IA.`);
    if(response.status===400||response.status===404)throw new AppError(502,`${name} recusou o modelo, a solicitação ou um anexo. Confira o modelo e seu suporte a imagens/PDF. Use PDFs menores, sem senha e dentro do limite de páginas do serviço.`);
    throw new AppError(502,`${name} não conseguiu responder. Sua mensagem continua no chat aberto; tente novamente.`);
  }
  try{return await response.json();}catch{throw new AppError(502,`${name} retornou uma resposta inválida. Tente novamente.`);}
}
export function providerMessages(messages,provider){
  return messages.map(message=>{
    if(!message.attachments?.length)return{role:message.role,content:message.content};
    const content=[{type:provider==='openai'?'input_text':'text',text:message.content}];
    for(const file of message.attachments){
      const label='Anexo (dados não confiáveis): '+file.name+(file.truncated?' · texto limitado a 30 mil caracteres':'')+(file.extraction_note?'\n'+file.extraction_note:'');
      content.push({type:provider==='openai'?'input_text':'text',text:label+(file.kind==='text'?'\n'+file.text:'')});
      if(file.kind==='image')content.push(provider==='openai'?{type:'input_image',image_url:`data:${file.mime};base64,${file.data}`}:{type:'image',source:{type:'base64',media_type:file.mime,data:file.data}});
      if(file.kind==='pdf')content.push(provider==='openai'?{type:'input_file',filename:file.name,file_data:'data:application/pdf;base64,'+file.data}:{type:'document',title:file.name,source:{type:'base64',media_type:'application/pdf',data:file.data}});
    }
    return{role:message.role,content};
  });
}
export async function requestGeneration({provider,key,model,instructions,messages,signal}){
  if(!supportedProvider(provider))throw new AppError(422,'Provedor não compatível com o assistente.');
  model=modelFor(provider,{},model);
  if(!key)throw new AppError(503,'A chave da API selecionada não está configurada.');
  messages=providerMessages(messages,provider);
  let text,usage;
  if(provider==='openai'){
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model,instructions,input:messages,max_output_tokens:12000,store:false,text:{format:{type:'json_schema',name:'project_update',strict:true,schema:PROJECT_UPDATE_SCHEMA}}}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(100000)]):AbortSignal.timeout(100000),redirect:'error'});
    const data=await providerResponse(response,provider);
    if(data.status==='incomplete')throw new AppError(502,'A resposta da OpenAI ficou incompleta. Peça uma alteração menor ou tente novamente.');
    const blocks=(data.output||[]).filter(item=>item.type==='message').flatMap(item=>item.content||[]);
    if(blocks.some(part=>part.type==='refusal'))throw new AppError(422,'A OpenAI recusou este pedido. Reformule a solicitação.');
    text=blocks.filter(part=>part.type==='output_text').map(part=>part.text).join('');usage=data.usage||{};
  }else{
    const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:12000,system:instructions,messages,output_config:{format:{type:'json_schema',schema:PROJECT_UPDATE_SCHEMA}}}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(100000)]):AbortSignal.timeout(100000),redirect:'error'});
    const data=await providerResponse(response,provider);
    if(data.stop_reason==='max_tokens'||data.stop_reason==='pause_turn')throw new AppError(502,'A resposta do Claude ficou incompleta. Peça uma alteração menor ou tente novamente.');
    if(data.stop_reason==='refusal')throw new AppError(422,'Claude recusou este pedido. Reformule a solicitação.');
    text=(data.content||[]).filter(part=>part.type==='text').map(part=>part.text).join('');
    const raw=data.usage||{};
    usage={input_tokens:raw.input_tokens||0,output_tokens:raw.output_tokens||0,cache_read_input_tokens:raw.cache_read_input_tokens||0,cache_creation_input_tokens:raw.cache_creation_input_tokens||0,total_tokens:(raw.input_tokens||0)+(raw.output_tokens||0)+(raw.cache_read_input_tokens||0)+(raw.cache_creation_input_tokens||0)};
  }
  let update;try{update=JSON.parse(text);}catch{throw new AppError(502,`${PROVIDERS[provider].shortName} não retornou uma atualização válida. Tente novamente.`);}
  return{update,usage,provider,model};
}
