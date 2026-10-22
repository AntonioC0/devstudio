import {createApplication} from './app.mjs';
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT inválida.');
const origin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||(process.env.NODE_ENV==='production'?null:`http://localhost:${port}`);
if(!origin)throw new Error('Configure PUBLIC_ORIGIN ou RENDER_EXTERNAL_URL.');
const {server}=createApplication({origin,accessPassword:process.env.ACCESS_PASSWORD,openaiKey:process.env.OPENAI_API_KEY||'',openaiModel:process.env.OPENAI_MODEL||'gpt-4.1'});
server.listen(port,'0.0.0.0',()=>console.log('Dev Studio iniciado. Banco temporário em memória; nenhum dado de teste é salvo em disco.'));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();setTimeout(()=>process.exit(0),10000).unref();});
