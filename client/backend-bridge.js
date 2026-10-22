// This runs inside the opaque preview frame. The parent pins requests to its own project.
export const BACKEND_BRIDGE_SOURCE=`(()=>{
  const channel='__CHANNEL__';const pending=new Map();let sequence=0;
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.data?.type!=='devstudio:api-response'||event.data.channel!==channel)return;
    const record=pending.get(event.data.id);if(!record)return;pending.delete(event.data.id);clearTimeout(record.timer);
    if(event.data.error){record.reject(new Error(event.data.error));return;}
    const output=event.data.response;record.resolve(new Response(output.status===204||output.status===205||output.status===304?null:JSON.stringify(output.body),{status:output.status,headers:output.headers}));
  });
  window.fetch=(input,options={})=>{
    const url=typeof input==='string'?input:input.url;
    if(typeof url!=='string'||!url.startsWith('/api/'))return Promise.reject(new Error('O modo de teste aceita somente as APIs locais do projeto.'));
    return new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('O backend demorou demais.'));},15000);
      const headers=new Headers(options.headers||{});let body=null;
      try{if(options.body)body=JSON.parse(options.body);}catch{clearTimeout(timer);reject(new Error('Envie JSON nas chamadas do projeto.'));return;}
      pending.set(id,{resolve,reject,timer});parent.postMessage({type:'devstudio:api-request',channel,id,request:{method:(options.method||'GET').toUpperCase(),url,body,headers:{authorization:headers.get('authorization')||''}}},'*');
    });
  };
})();`;
