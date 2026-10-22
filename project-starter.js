import {BACKEND_DATA_SOURCE} from './backend-data.js';
// Runnable React + Node project. These strings are exported, never executed by the platform.
const manifest={name:'meu-projeto',version:'1.0.0',private:true,type:'module',engines:{node:'>=24 <25'},scripts:{dev:'node --watch server/index.js --dev',build:'vite build',start:'node --env-file-if-exists=.env server/index.js',test:'node --test tests/*.test.mjs'},dependencies:{express:'5.3.0',react:'19.3.1','react-dom':'19.3.1','lucide-react':'1.31.0','react-router-dom':'7.18.4'},devDependencies:{vite:'8.3.5'}};
const entries={
  'package.json':JSON.stringify(manifest,null,2)+'\n',
  'index.html':`<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meu projeto React</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
  'src/main.jsx':`import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
`,
  'src/App.jsx':`import React,{useState} from 'react';
import {ArrowRight,Layers} from 'lucide-react';
export default function App(){
  const [started,setStarted]=useState(false);
  return <main><div className="mark"><Layers size={24}/></div><span className="eyebrow">MEU NOVO PROJETO</span><h1>{started?'Vamos dar vida à sua ideia.':'Sua ideia começa aqui.'}</h1><p>Descreva o que quer construir no chat ao lado. Seu projeto terá uma interface React, adaptada a computador, tablet e celular.</p><button onClick={()=>setStarted(true)}>Vamos criar <ArrowRight size={18}/></button></main>;
}
`,
  'src/styles.css':`*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f9f5;color:#203024;font-family:system-ui,sans-serif}main{padding:clamp(24px,6vw,64px);max-width:780px}.mark{display:grid;place-items:center;width:54px;height:54px;background:#e6efdf;border-radius:16px;margin-bottom:36px}.eyebrow{font-size:11px;letter-spacing:2px;color:#637b50}h1{font-size:clamp(36px,6vw,64px);font-weight:550;letter-spacing:-2px;line-height:1.1;margin:24px 0}p{font-size:16px;line-height:1.8;color:#6d786f;max-width:550px}button{display:flex;align-items:center;gap:12px;background:#b8e68d;color:#203024;border:0;padding:15px 24px;border-radius:10px;font:inherit;cursor:pointer;margin-top:28px;min-height:48px}button:focus-visible{outline:3px solid #52723b;outline-offset:4px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`,
  'vite.config.js':`import {defineConfig} from 'vite';
export default defineConfig({build:{outDir:'dist'}});
`,
  'server/handler.js':`export default function handle(request,ctx){
  if(request.method==='GET'&&request.path==='/api/health')return{status:200,body:{status:'ok',service:'meu-projeto'}};
  return{status:404,body:{detail:'Rota não encontrada.'}};
}
`,
  'server/data.js':BACKEND_DATA_SOURCE,
  'server/app.js':`import express from 'express';
import handle from './handler.js';
import {context} from './data.js';
export function createApp(){
  const app=express();app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
      if(!req.is('application/json'))return res.status(415).json({detail:'Envie JSON.'});
      const origin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||'http://localhost:'+(process.env.PORT||3000);
      if(req.headers.origin&&req.headers.origin!==origin)return res.status(403).json({detail:'Origem não permitida.'});
    }next();
  });
  app.use(express.json({limit:'32kb'}));
  app.all('/api/{*path}',async(req,res,next)=>{
    try{const url=new URL(req.originalUrl,'http://app.local');const response=await handle({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),headers:req.headers,body:req.body??null},context);res.status(response.status||200);for(const [key,value]of Object.entries(response.headers||{}))res.setHeader(key,value);res.json(response.body??{});}catch(error){next(error);}
  });
  return app;
}
`,
  'server/index.js':`import express from 'express';
import {fileURLToPath} from 'node:url';
import {createApp} from './app.js';
const app=createApp(),port=Number(process.env.PORT||3000);
app.use('/api',(_req,res)=>res.status(404).json({detail:'Rota não encontrada.'}));
if(process.argv.includes('--dev')){
  const {createServer}=await import('vite');
  const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
  app.use(vite.middlewares);
}else{
  const directory=fileURLToPath(new URL('../dist/',import.meta.url));
  app.use(express.static(directory));
  app.get('/{*path}',(_req,res)=>res.sendFile(directory+'index.html'));
}
app.use((error,_req,res,_next)=>res.status(error.status===413?413:500).json({detail:error.status===413?'Solicitação muito grande.':'Não foi possível concluir a operação.'}));
const server=app.listen(port,'0.0.0.0',()=>console.log('Aplicativo iniciado na porta '+port));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
`,
  'tests/health.test.mjs':`import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server/app.js';
test('API responde e rejeita origem externa em escritas',async()=>{
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;
  try{assert.equal((await (await fetch(url+'/api/health')).json()).status,'ok');const denied=await fetch(url+'/api/health',{method:'POST',headers:{Origin:'https://externo.example','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);}finally{await new Promise(resolve=>server.close(resolve));}
});
`,
  '.env.example':'PORT=3000\nPUBLIC_ORIGIN=http://localhost:3000\n# Cadastre segredos apenas no servidor do ambiente de destino.\n',
  '.gitignore':'node_modules/\ndist/\n.env\n.env.*\n!.env.example\n*.db\n*.sqlite\n',
  'README.md':`# Meu projeto — React + Node.js

O Dev Studio aplica e executa os arquivos no próprio workspace. A exportação é opcional.

Frontend React/Vite; backend JavaScript em server/handler.js. O handler recebe request (method, path, query, headers, body) e ctx (db e crypto) e retorna {status, headers, body}. Ele roda isolado no modo de teste e com o mesmo contrato no servidor Node.js/Express exportado.

Banco temporário: ctx.db.list(collection,{where,limit,offset}), get(collection,id), insert(collection,data), update(collection,id,patch), remove(collection,id). Registros têm id gerado pelo servidor. Aplique validação, autorização e filtros por dono em cada rota.

Criptografia: ctx.crypto.hashPassword(password), verifyPassword(password,hash), randomToken(). Nunca retorne hashes/senhas. Login deve criar uma sessão real em coleção própria e cookie HttpOnly, Secure e SameSite. O Dev Studio mantém os cookies do aplicativo separados dos cookies da plataforma.

O modo integrado aceita JavaScript e imports locais no handler; sem npm, acesso a process, fs, rede externa ou servidor HTTP dentro do sandbox. O host Node.js gerencia as requisições e o SQLite real em memória. Dados desaparecem ao encerrar a sessão, excluir o projeto ou reiniciar o servidor. A versão exportada também usa banco em memória até você configurar persistência.

Para executar fora da plataforma, use Node.js 24 e rode npm install, npm run dev. Para produção: npm run build e npm start; configure PUBLIC_ORIGIN e NODE_ENV=production. Para instalar antes do build com NODE_ENV=production, use npm install --include=dev. npm test verifica o contrato básico da API. Compartilhamento permanente exige hospedagem e persistência apropriadas; exportar não publica automaticamente.
`
};
export const REACT_NODE_STARTER=Object.entries(entries).map(([path,content])=>({path,content}));
