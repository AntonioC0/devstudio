import {parentPort} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import * as crypto from 'node:crypto';
import {getQuickJS} from 'quickjs-emscripten';
import {createBackendContext} from '../backend-data.js';

const engine=await getQuickJS(),data=createBackendContext(DatabaseSync,crypto);
let runtime,vm,source='',deadline=0,operations=0,hashes=0;
const allowed={db:new Set(['list','get','insert','update','remove']),crypto:new Set(['hashPassword','verifyPassword','randomToken'])};
function evaluate(code){const output=vm.evalCode(code);if(output.error){const error=vm.dump(output.error);output.error.dispose();throw new Error(error.message||'Falha no backend do projeto.');}return output.value;}
function load(code){
  source='';if(vm){vm.dispose();runtime.dispose();}runtime=engine.newRuntime();runtime.setMemoryLimit(24*1024*1024);runtime.setMaxStackSize(512*1024);runtime.setInterruptHandler(()=>Date.now()>deadline);
  vm=runtime.newContext();const bridge=vm.newFunction('__data',handle=>{
    try{
      if(++operations>60)throw new Error('Limite de operações por requisição atingido.');
      const input=JSON.parse(vm.getString(handle));
      if(!allowed[input.group]?.has(input.method)||!Array.isArray(input.args)||JSON.stringify(input.args).length>16000)throw new Error('Operação de backend não permitida.');
      if(input.group==='crypto'&&input.method!=='randomToken'&&++hashes>4)throw new Error('Limite de operações de senha atingido.');
      const result=data[input.group][input.method](...input.args);
      const value=JSON.stringify({ok:true,value:result});if(value.length>600000)throw new Error('Resposta do banco muito grande.');
      return vm.newString(value);
    }catch(error){return vm.newString(JSON.stringify({ok:false,error:/SQLITE_FULL|database or disk is full/i.test(error.message)?'Limite do banco temporário atingido.':String(error.message).slice(0,300)}));}
  });
  vm.setProp(vm.global,'__data',bridge);bridge.dispose();
  evaluate(`function call(group,method,args){const result=JSON.parse(__data(JSON.stringify({group,method,args})));if(!result.ok)throw new Error(result.error);return result.value;}globalThis.ctx={db:{list:(...a)=>call('db','list',a),get:(...a)=>call('db','get',a),insert:(...a)=>call('db','insert',a),update:(...a)=>call('db','update',a),remove:(...a)=>call('db','remove',a)},crypto:{hashPassword:(...a)=>call('crypto','hashPassword',a),verifyPassword:(...a)=>call('crypto','verifyPassword',a),randomToken:(...a)=>call('crypto','randomToken',a)}};`).dispose();
  evaluate(code).dispose();evaluate(`if(typeof ProjectBackend.default!=='function')throw new Error('O backend deve exportar uma função default.');`).dispose();
  source=code;
}
parentPort.on('message',({id,code,request})=>{
  let promise;
  try{
    deadline=Date.now()+1800;operations=0;hashes=0;
    if(source!==code)load(code);
    if(!request){parentPort.postMessage({id,ok:true});return;}
    promise=evaluate(`Promise.resolve(ProjectBackend.default(${JSON.stringify(request)},ctx)).then(value=>JSON.stringify(value))`);
    let state=vm.getPromiseState(promise),jobs=0;
    while(state.type==='pending'&&runtime.hasPendingJob()&&jobs++<500){state.dispose?.();const result=runtime.executePendingJobs(1);if(result.error){const message=vm.dump(result.error).message;result.error.dispose();throw new Error(message);}state=vm.getPromiseState(promise);}
    if(state.type!=='fulfilled'){if(state.type==='rejected'){const detail=vm.dump(state.error);state.error.dispose();throw new Error(detail.message||'Erro no backend.');}throw new Error('O backend não concluiu a resposta.');}
    const text=vm.getString(state.value);state.value.dispose();
    if(text.length>600000)throw new Error('Resposta do backend muito grande.');
    parentPort.postMessage({id,ok:true,response:JSON.parse(text)});
  }catch(error){source='';parentPort.postMessage({id,ok:false,error:String(error.message).slice(0,600)});}
  finally{promise?.dispose();}
});
