import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {BACKEND_BRIDGE_SOURCE} from '../client/backend-bridge.js';

test('preview bridge sends only local project API requests and accepts replies from its parent/channel',async()=>{
  let receive,request,cleared=0;
  const parent={postMessage(message){request=message;}};
  const window={addEventListener(name,handler){assert.equal(name,'message');receive=handler;}};
  runInNewContext(BACKEND_BRIDGE_SOURCE.replace('__CHANNEL__','test-channel'),{window,parent,Map,Promise,Error,Response,Headers,JSON,setTimeout:()=>1,clearTimeout:()=>cleared++});
  await assert.rejects(window.fetch('https://outside.test/api'),/somente as APIs locais/);
  const result=window.fetch('/api/items',{method:'POST',body:JSON.stringify({name:'Novo'})});
  assert.equal(request.type,'devstudio:api-request');assert.equal(request.request.method,'POST');assert.equal(request.request.body.name,'Novo');
  const reply={type:'devstudio:api-response',id:request.id,channel:'test-channel',response:{status:201,headers:{'content-type':'application/json'},body:{id:'created'}}};
  receive({source:{},data:reply});receive({source:parent,data:{...reply,channel:'wrong'}});assert.equal(cleared,0);
  receive({source:parent,data:reply});const response=await result;assert.equal(response.status,201);assert.deepEqual(await response.json(),{id:'created'});assert.equal(cleared,1);
});
