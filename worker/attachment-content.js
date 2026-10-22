import {unzipSync} from 'fflate';
import {XMLParser} from 'fast-xml-parser';
import {AppError} from './domain.js';
import {redactSecrets,rejectSecrets} from './secrets.js';
import {ATTACHMENT_LIMITS as LIMITS} from '../attachment-policy.js';

const decoder=new TextDecoder('utf-8',{fatal:true});
const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const textExtensions=new Set('csv tsv txt md json log js jsx ts tsx css html py sql yaml yml'.split(' '));
const list=value=>value==null?[]:Array.isArray(value)?value:[value];
const unescape=value=>String(value??'').replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[a-f\d]+);/gi,entity=>{const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[entity])return named[entity];const code=entity.startsWith('&#x')?parseInt(entity.slice(3),16):parseInt(entity.slice(2),10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';});
function xml(bytes){
  const source=decoder.decode(bytes);
  if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new AppError(422,'Documentos com entidades XML não são aceitos.');
  return new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,trimValues:false,processEntities:false,maxNestedTags:64}).parse(source,true);
}
function zipParts(bytes,extension){
  let total=0,count=0;
  const names=new Set();
  return unzipSync(bytes,{filter:file=>{
    if(++count>1000)throw new AppError(422,'O documento contém arquivos internos demais.');
    if(/(?:^|\/)\.\.(?:\/|$)|\\|^\//.test(file.name)||names.has(file.name))throw new AppError(422,'Estrutura de documento inválida.');
    names.add(file.name);
    if(/vbaProject|macros|externalLinks/i.test(file.name))throw new AppError(422,'Use uma cópia sem macros e sem links externos.');
    const selected=extension==='docx'?file.name==='word/document.xml':/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(file.name);
    if(!selected)return false;
    total+=file.originalSize;
    if(file.originalSize>2*1024*1024||total>8*1024*1024)throw new AppError(422,'O conteúdo expandido do documento excede o limite. Envie uma parte menor.');
    return true;
  }});
}
function runs(node,depth=0){
  if(depth>64)throw new AppError(422,'Documento complexo demais.');
  if(node==null)return '';
  if(typeof node==='string'||typeof node==='number')return unescape(node);
  if(Array.isArray(node))return node.map(value=>runs(value,depth+1)).join('');
  if(Object.hasOwn(node,'t'))return runs(node.t,depth+1);
  if(Object.hasOwn(node,'#text'))return runs(node['#text'],depth+1);
  return Object.entries(node).filter(([key])=>!key.startsWith('@_')&&!['rPr','pPr','tblPr'].includes(key)).map(([,value])=>runs(value,depth+1)).join('');
}
function documentText(parts){
  if(!parts['word/document.xml'])throw new AppError(422,'O arquivo DOCX não contém um documento legível.');
  const parsed=xml(parts['word/document.xml']),out=[];
  function walk(node,depth=0){
    if(depth>64)throw new AppError(422,'Documento complexo demais.');
    if(Array.isArray(node)){for(const value of node)walk(value,depth+1);return;}
    if(!node||typeof node!=='object')return;
    for(const [key,value]of Object.entries(node)){
      if(key==='p'){for(const paragraph of list(value)){const text=runs(paragraph);if(text)out.push(text);}}
      else if(!key.startsWith('@_'))walk(value,depth+1);
    }
  }
  walk(parsed);return out.join('\n');
}
function workbookText(parts){
  if(!parts['xl/workbook.xml'])throw new AppError(422,'O arquivo XLSX não contém uma planilha legível.');
  const workbook=xml(parts['xl/workbook.xml']);
  const shared=parts['xl/sharedStrings.xml']?list(xml(parts['xl/sharedStrings.xml']).sst?.si).map(value=>runs(value)):[];
  const rels=parts['xl/_rels/workbook.xml.rels']?list(xml(parts['xl/_rels/workbook.xml.rels']).Relationships?.Relationship):[];
  const names=new Map();
  for(const sheet of list(workbook.workbook?.sheets?.sheet)){
    const rel=rels.find(r=>r['@_Id']===sheet['@_id']);
    if(rel&&rel['@_TargetMode']!=='External'){const path=String(rel['@_Target']).replace(/^\//,'').replace(/^xl\//,'');names.set('xl/'+path,unescape(sheet['@_name']));}
  }
  const out=[];let cells=0;
  const sheets=Object.keys(parts).filter(path=>/^xl\/worksheets\/sheet\d+\.xml$/.test(path)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(!sheets.length||sheets.length>20)throw new AppError(422,'Envie uma planilha com 1 a 20 abas.');
  for(const path of sheets){
    out.push('ABA: '+(names.get(path)||path));
    const sheet=xml(parts[path]);
    for(const row of list(sheet.worksheet?.sheetData?.row)){
      const values=[];
      for(const cell of list(row.c)){
        if(++cells>30000)throw new AppError(422,'A planilha tem células demais. Envie um intervalo menor.');
        let value=cell['@_t']==='s'?shared[Number(cell.v)]??'':cell['@_t']==='inlineStr'?runs(cell.is):unescape(cell.v);
        if(cell.f!=null)value+=' [fórmula não executada: '+unescape(cell.f)+']';
        values.push(String(cell['@_r']||'')+': '+value.replace(/[\r\n\t]/g,' '));
      }
      if(values.length)out.push(values.join('\t'));
    }
  }
  return out.join('\n');
}
function imageSize(bytes,extension){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(extension==='png'&&bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&String.fromCharCode(...bytes.slice(12,16))==='IHDR')return[view.getUint32(16),view.getUint32(20)];
  if(['jpg','jpeg'].includes(extension)&&bytes[0]===255&&bytes[1]===216){
    let offset=2;
    while(offset+4<bytes.length){if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7)return[view.getUint16(offset+5),view.getUint16(offset+3)];offset+=length;}
  }
  if(extension==='webp'&&bytes.length>=30&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'){
    const kind=String.fromCharCode(...bytes.slice(12,16));
    if(kind==='VP8X'){if(bytes[20]&2)throw new AppError(422,'Imagens animadas não são aceitas.');return[1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)];}
    if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return[view.getUint16(26,true)&16383,view.getUint16(28,true)&16383];
    if(kind==='VP8L'&&bytes[20]===47)return[1+bytes[21]+((bytes[22]&63)<<8),1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10)];
  }
  throw new AppError(422,'Imagem inválida ou em formato incompatível. Use PNG, JPG ou WebP.');
}
export function base64(bytes){let text='';for(let offset=0;offset<bytes.length;offset+=32768)text+=String.fromCharCode(...bytes.subarray(offset,offset+32768));return btoa(text);}
export async function readAttachment(file,known=[]){
  if(!file||typeof file.arrayBuffer!=='function'||typeof file.name!=='string')throw new AppError(422,'Anexo inválido.');
  const name=file.name.normalize('NFC');
  if(!name||name.length>160||/[\x00-\x1f\x7f/\\]/.test(name)||/^\.(?:env|dev\.vars)|\.(?:pem|key|pfx|p12)$/i.test(name))throw new AppError(422,'Nome de anexo inválido. Não envie arquivos de credenciais.');
  rejectSecrets(name,known);
  if(!file.size||file.size>LIMITS.maxFileBytes)throw new AppError(413,'Cada anexo deve ter entre 1 byte e 5 MB.');
  const extension=name.split('.').pop().toLowerCase(),mime=types[extension];
  if(!mime&&!textExtensions.has(extension))throw new AppError(422,'Formato não aceito. Use imagens, PDF, DOCX, XLSX, CSV ou texto. Converta DOC/XLS antigos para DOCX/XLSX.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==file.size||bytes.length>LIMITS.maxFileBytes)throw new AppError(413,'Anexo acima do limite.');
  const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(mime?.startsWith('image/')){
    const [width,height]=imageSize(bytes,extension);
    if(!width||!height||width>8000||height>8000||width*height>20000000)throw new AppError(422,'Reduza a imagem para até 8000 pixels por lado e 20 megapixels.');
    return{name,mime,kind:'image',data:base64(bytes),size:bytes.length,checksum};
  }
  if(extension==='pdf'){
    if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new AppError(422,'O arquivo não parece ser um PDF válido.');
    if(/\/Encrypt\s+(?:\d+\s+\d+\s+R|<<)/.test(new TextDecoder().decode(bytes)))throw new AppError(422,'Envie uma cópia do PDF sem senha ou criptografia.');
    return{name,mime,kind:'pdf',data:base64(bytes),size:bytes.length,checksum};
  }
  let text;
  try{
    if(extension==='docx'||extension==='xlsx'){
      if(bytes[0]!==80||bytes[1]!==75)throw new AppError(422,'Documento Office inválido ou protegido por senha.');
      const parts=zipParts(bytes,extension);text=extension==='docx'?documentText(parts):workbookText(parts);
    }else{
      text=bytes[0]===255&&bytes[1]===254?new TextDecoder('utf-16le',{fatal:true}).decode(bytes):bytes[0]===254&&bytes[1]===255?new TextDecoder('utf-16be',{fatal:true}).decode(bytes):decoder.decode(bytes);
      if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw new AppError(422,'O arquivo de texto contém dados binários.');
    }
  }catch(error){if(error instanceof AppError)throw error;throw new AppError(422,'Não foi possível ler este documento. Verifique o formato e envie uma cópia menor, sem senha.');}
  if(!text.trim())throw new AppError(422,'Não foi encontrado texto legível. Envie PDF ou imagem para leitura visual.');
  const truncated=text.length>LIMITS.maxTextChars;
  const cleaned=redactSecrets(text.slice(0,LIMITS.maxTextChars),known);
  const extraction_note=extension==='xlsx'?'Células e valores disponíveis no arquivo; fórmulas não são executadas. Formatação, gráficos e imagens são omitidos; datas podem aparecer como números seriais.':extension==='docx'?'Texto extraído; layout, imagens e objetos incorporados são omitidos.':'';
  return{name,mime:'text/plain',kind:'text',text:cleaned.text,size:bytes.length,checksum,truncated,secrets_redacted:cleaned.count>0,extraction_note};
}
