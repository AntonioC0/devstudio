import React,{useState,useEffect,useMemo,useCallback} from 'react';
import {Play,LoaderCircle,CheckCircle2,AlertCircle} from 'lucide-react';
import {previewDocument} from './preview.js';
const successful=value=>value?.status==='live';
export function useProjectExecution({project,files,call,config,refreshKey}){
  const [compiled,setCompiled]=useState(null),[compiling,setCompiling]=useState(false),[compileError,setCompileError]=useState('');
  const [runtime,setRuntime]=useState(null),[running,setRunning]=useState(false),[runError,setRunError]=useState('');
  const id=project?.id,version=project?.version,configured=!!config?.runtime?.configured;
  useEffect(()=>{
    setCompiled(null);setCompileError('');if(!id)return;
    let current=true;setCompiling(true);
    const timer=setTimeout(()=>call(`/api/projects/${id}/preview`,{method:'POST',body:JSON.stringify({version})}).then(data=>{if(current)setCompiled({...data.preview,projectId:id,version});}).catch(error=>{if(current)setCompileError(error.message);}).finally(()=>{if(current)setCompiling(false);}),150);
    return()=>{current=false;clearTimeout(timer);};
  },[id,version,refreshKey,call]);
  useEffect(()=>{setRuntime(null);setRunError('');setRunning(false);},[id]);
  useEffect(()=>{
    if(!id||!configured)return;let current=true;
    async function poll(){try{const data=await call(`/api/projects/${id}/run`);if(!current)return;setRuntime(data.runtime?{...data.runtime,projectId:id}:null);}catch(error){if(current)setRunError(error.message);}}
    poll();return()=>{current=false;};
  },[id,configured,running,version,call]);
  async function run(target=project){
    if(!target||!configured||running)return;setRunning(true);setRunError('');
    try{const data=await call(`/api/projects/${target.id}/run`,{method:'POST',body:JSON.stringify({version:target.version})});setRuntime({...data.runtime,projectId:target.id});}
    catch(error){setRunError(error.message);}finally{setRunning(false);}
  }
  useEffect(()=>{if(id&&configured&&compiled?.kind==='react'&&compiled.projectId===id&&compiled.version===version)run();},[id,version,compiled,configured]);
  const ready=runtime?.projectId===id&&runtime.source_version===version&&successful(runtime);
  const apiRequest=useCallback(async input=>{const data=await call(`/api/projects/${id}/runtime-request`,{method:'POST',body:JSON.stringify({version,request:input})});setRuntime({status:'live',source_version:version,projectId:id});return data.response;},[id,version,call]);
  const document=useMemo(()=>previewDocument(files,compiled?.projectId===id&&compiled.version===version?compiled:null),[files,compiled,id,version]);
  return{document,compiled,compiling,compileError,runtime,ready,apiRequest,running,runError,run,configured};
}
export function ExecutionStatus({execution,disabled}){
  const {compiling,compileError,runtime,ready,running,runError,run,configured}=execution;
  const building=running,failed=!!runError||!!compileError||!!runtime?.status?.endsWith('_failed')||runtime?.status==='canceled';
  return <div className={'execution-status '+(failed?'failed':'')}><div aria-live="polite">{building||compiling?<LoaderCircle size={14} className="spin"/>:failed?<AlertCircle size={14}/>:ready?<CheckCircle2 size={14}/>:<Play size={14}/>}<span>{runError||compileError||(building?'Iniciando o backend do projeto…':failed?'O backend de teste encontrou um erro.':ready?'React + backend ativos · dados temporários':'React + backend no Dev Studio')}</span></div><div><button disabled={disabled||building} onClick={()=>run()}><Play size={13}/> Reiniciar verificação</button></div></div>;
}
