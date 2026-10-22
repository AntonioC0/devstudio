export class AppError extends Error{constructor(status,message){super(message);this.status=status;}}
export function requireText(value,name,max=200,min=1){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new AppError(422,`${name}: informe entre ${min} e ${max} caracteres.`);return value.trim();}
export function filePath(value){
  if(typeof value==='string'&&value.split('/').some(p=>/^(?:\.env(?:\.(?!example$|sample$).*)?|\.dev\.vars.*|\.git|\.ssh|\.aws)$/i.test(p)||/\.(?:pem|p12|pfx|key)$/i.test(p)))throw new AppError(422,'Arquivos de credenciais e segredos não podem ser publicados no projeto. Use a aba APIs.');
  if(typeof value!=='string'||value.length>160||!value||value.startsWith('/')||value.includes('\\')||value.split('/').some(v=>!v||v==='.'||v==='..')||!/^[-\w./]+$/.test(value))throw new AppError(422,'Caminho de arquivo inválido.');
  return value;
}
export function validateFiles(items){
  if(!Array.isArray(items)||items.length>30)throw new AppError(422,'A geração excedeu o limite de 30 arquivos.');
  const seen=new Set();let size=0;
  return items.map(item=>{const path=filePath(item.path);if(seen.has(path)||typeof item.content!=='string'||item.content.length>120000)throw new AppError(422,'Arquivo inválido ou duplicado na resposta.');seen.add(path);size+=item.content.length;if(size>300000)throw new AppError(422,'A geração excedeu o limite de tamanho.');return{path,content:item.content};});
}
export {REACT_NODE_STARTER as STARTER} from '../project-starter.js';
