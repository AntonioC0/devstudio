import {ASSETS} from '../.build/assets.js';
import {api} from './api.js';
import {AppError} from './domain.js';
const policy=nonce=>`default-src 'self'; script-src 'self'${nonce?` 'nonce-${nonce}'`:''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' about:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'`;
const baseHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Strict-Transport-Security':'max-age=31536000','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','Content-Security-Policy':policy()};
export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='GET'&&ASSETS[url.pathname]){const asset=ASSETS[url.pathname],nonce=crypto.randomUUID().replaceAll('-','');return new Response(url.pathname==='/'?asset.content.replace('__CSP_NONCE__',nonce):asset.encoding==='base64'?Uint8Array.from(atob(asset.content),character=>character.charCodeAt(0)):asset.content,{headers:{...baseHeaders,'Content-Security-Policy':policy(url.pathname==='/'?nonce:null),'Content-Type':asset.type}});}
    if(!url.pathname.startsWith('/api/'))return new Response('Não encontrado',{status:404,headers:baseHeaders});
    try{const output=await api(request,env);return new Response(JSON.stringify(output.data),{status:output.status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...output.headers}});}
    catch(error){const expected=error instanceof AppError;return new Response(JSON.stringify({detail:expected?error.message:'Não foi possível concluir a operação. Tente novamente.'}),{status:expected?error.status:500,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8'}});}
  }
};
