import {AppError} from './domain.js';

const MASK='[SEGREDO_REMOVIDO]';
const patterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:sk_live_|sk_test_|rk_live_|rk_test_|ghp_|gho_|ghu_|ghs_|github_pat_|sb_secret_)[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@[^\s'"<>]+/gi,
];
export function redactSecrets(value,known=[]){
  let text=String(value),count=0;
  for(const key of [...new Set(known.filter(k=>typeof k==='string'&&k.length>=8))].sort((a,b)=>b.length-a.length)){
    const pieces=text.split(key);if(pieces.length>1){count+=pieces.length-1;text=pieces.join(MASK);}
  }
  for(const pattern of patterns)text=text.replace(pattern,()=>{count++;return MASK;});
  text=text.replace(/(\b(?:api[_-]?key|secret[_-]?key|client[_-]?secret|service[_-]?role[_-]?key|access[_-]?token|refresh[_-]?token|password|db[_-]?password)\b\s*[:=]\s*)(["'])([^"'\r\n]{12,})\2/gi,(whole,prefix,quote,secret)=>{
    if(/^(?:\[|YOUR_|SUA_|SEU_|EXAMPLE|PLACEHOLDER|REPLACE_|process\.|import\.|<)/i.test(secret))return whole;
    count++;return `${prefix}${quote}${MASK}${quote}`;
  });
  return{text,count};
}
export function rejectSecrets(value,known=[]){if(redactSecrets(value,known).count)throw new AppError(422,'Foi identificado um possível segredo neste conteúdo. Cadastre a chave na aba APIs e use apenas seu alias no código ou no contexto.');return value;}
export function exactFields(data,allowed){
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!allowed.includes(key)))throw new AppError(422,'Solicitação contém campos não permitidos.');
  return data;
}
