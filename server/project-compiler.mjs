import {build} from 'esbuild';
import path from 'node:path';
import {builtinModules} from 'node:module';
import {validateFiles} from '../worker/domain.js';

export const PREVIEW_PACKAGES=['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','lucide-react','react-router-dom'];
const builtins=new Set(builtinModules.map(name=>name.replace(/^node:/,'')));
const directory=path.resolve(new URL('../',import.meta.url).pathname);
const extensions=['','.jsx','.js','.tsx','.ts','.json','.css','.svg','/index.jsx','/index.js','/index.tsx','/index.ts'];
class CompileError extends Error{}
const packageName=name=>name.startsWith('@')?name.split('/').slice(0,2).join('/'):name.split('/')[0];
function virtualPath(map,request,importer=''){
  const normalized=path.posix.normalize(request.startsWith('@/')?'src/'+request.slice(2):request.startsWith('/')?request.slice(1):path.posix.join(path.posix.dirname(importer),request));
  if(normalized.startsWith('../'))throw new CompileError('Import fora do projeto não permitido.');
  const resolved=extensions.map(extension=>normalized+extension).find(candidate=>map.has(candidate));
  if(!resolved)throw new CompileError('Arquivo importado não encontrado: '+normalized);
  return resolved;
}
function project(files){
  const map=new Map(validateFiles(files).map(file=>[file.path,file.content]));
  const react=[...map.keys()].some(name=>/^src\/.*\.[jt]sx$/.test(name));
  let manifest={};
  if(map.has('package.json')){try{manifest=JSON.parse(map.get('package.json'));}catch{throw new CompileError('package.json contém JSON inválido.');}}
  return{map,manifest,react};
}
function plugin(map,manifest,backend=false){
  return{name:'project-files-only',setup(builder){
    builder.onResolve({filter:/.*/},args=>args.kind==='entry-point'?{path:virtualPath(map,'/'+args.path),namespace:'project'}:undefined);
    builder.onResolve({filter:/.*/,namespace:'project'},async args=>{
      if(args.path.startsWith('data:'))return{path:args.path,external:true};
      if(args.path.startsWith('.')||args.path.startsWith('/')||args.path.startsWith('@/'))return{path:virtualPath(map,args.path,args.importer),namespace:'project'};
      if(backend==='sandbox')throw new CompileError('O handler do teste aceita somente imports locais e o SDK ctx.db/ctx.crypto, sem Node/npm ou rede: '+args.path);
      if(backend){
        const name=args.path.replace(/^node:/,'');
        if(builtins.has(name))return{path:args.path,external:true};
        if(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[a-z0-9._/-]+)?$/i.test(args.path)&&Object.hasOwn(manifest.dependencies||{},packageName(args.path)))return{path:args.path,external:true};
        // Vite is loaded only by the exported development server.
        if(args.path==='vite'&&Object.hasOwn(manifest.devDependencies||{},'vite'))return{path:args.path,external:true};
        throw new CompileError('Dependência do backend não declarada: '+args.path);
      }
      if(!PREVIEW_PACKAGES.includes(args.path))throw new CompileError('Pacote não disponível na prévia: '+args.path+'. Use React, react-router-dom, lucide-react ou componentes locais.');
      return builder.resolve(args.path,{resolveDir:directory,kind:args.kind});
    });
    builder.onResolve({filter:/.*/,namespace:'file'},args=>{
      // User files enter only through the virtual namespace; files resolved here are trusted npm packages.
      if(args.kind==='entry-point')return{path:virtualPath(map,args.path),namespace:'project'};
    });
    builder.onLoad({filter:/.*/,namespace:'project'},args=>{
      const extension=path.posix.extname(args.path).slice(1);
      return{contents:map.get(args.path),loader:extension==='svg'?'dataurl':['js','jsx','ts','tsx','json','css'].includes(extension)?extension:'text'};
    });
  }};
}
const options={absWorkingDir:directory,bundle:true,write:false,logLevel:'silent',outdir:'virtual-output',legalComments:'none',metafile:true};
function diagnostics(error){
  if(error instanceof CompileError)return[error.message];
  if(error.errors)return error.errors.slice(0,6).map(item=>{
    const location=item.location;
    return`${location?location.file.replace(/^project:/,'')+':'+location.line+': ':''}${item.text}`.slice(0,600);
  });
  return['Não foi possível compilar o projeto.'];
}
export async function compilePreview(files){
  try{
    const {map,manifest,react}=project(files);
    if(!react)return{ok:true,kind:'static',backend:false};
    const html=map.get('index.html')||'';
    const module=html.match(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1];
    if(!module)throw new CompileError('index.html deve carregar src/main.jsx como script type="module" e conter o elemento root do React.');
    const entry=virtualPath(map,module.startsWith('/')?module:'./'+module);
    if(!/^src\/.+\.[jt]sx?$/.test(entry))throw new CompileError('Use uma entrada React em src/main.jsx ou src/main.tsx.');
    const output=await build({...options,entryPoints:[{in:entry,out:'app'}],platform:'browser',format:'iife',target:'es2022',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[plugin(map,manifest)]});
    return{ok:true,kind:'react',entry,javascript:output.outputFiles.find(file=>file.path.endsWith('.js'))?.text||'',css:output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'',backend:map.has('server/index.js'),packages:PREVIEW_PACKAGES};
  }catch(error){return{ok:false,errors:diagnostics(error)};}
}
export async function checkProject(files,{requireStack=true}={}){
  const frontend=await compilePreview(files);
  if(!frontend.ok)return frontend;
  try{
    const {map,manifest}=project(files);
    if(requireStack&&(!map.has('server/index.js')||frontend.kind!=='react'||!manifest.dependencies?.react||!manifest.dependencies?.express))throw new CompileError('Mantenha o frontend React, o backend server/index.js e React/Express declarados no package.json. Migre projetos antigos para essa stack.');
    if(map.has('server/index.js'))await build({...options,entryPoints:['server/index.js'],platform:'node',format:'esm',target:'node24',plugins:[plugin(map,manifest,true)]});
    if(map.has('server/handler.js')){const backend=await compileBackend(files);if(!backend.ok)return backend;}
    return{ok:true,checks:frontend.kind==='react'?['React compilado e imports locais resolvidos',...(map.has('server/index.js')?['Backend Node.js analisado sem execução']:[])]:[]};
  }catch(error){return{ok:false,errors:diagnostics(error)};}
}

export async function compileBackend(files){
  try{const {map,manifest}=project(files);if(!map.has('server/handler.js'))throw new CompileError('Crie server/handler.js com export default function handle(request,ctx).');
    const output=await build({...options,entryPoints:['server/handler.js'],platform:'neutral',format:'iife',globalName:'ProjectBackend',target:'es2022',plugins:[plugin(map,manifest,'sandbox')]});
    return{ok:true,source:output.outputFiles.find(file=>file.path.endsWith('.js')).text};
  }catch(error){return{ok:false,errors:diagnostics(error)};}
}
