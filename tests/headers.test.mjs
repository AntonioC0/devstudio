import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile('dist/server/index.js','utf8');
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('served pages use unique CSP nonces matching the document',async()=>{
  const a=await worker.fetch(new Request('https://studio.test/'),{}),b=await worker.fetch(new Request('https://studio.test/'),{});
  const html=await a.text(),nonce=html.match(/name="csp-nonce" content="([a-f0-9]+)"/)?.[1];
  assert.ok(nonce);assert.ok(a.headers.get('Content-Security-Policy').includes(`'nonce-${nonce}'`));
  assert.ok(!b.headers.get('Content-Security-Policy').includes(nonce));
  assert.ok(!a.headers.get('Content-Security-Policy').split(';').find(v=>v.includes('script-src')).includes('unsafe-inline'));
  assert.match(a.headers.get('Permissions-Policy'),/camera=\(\)/);assert.match(a.headers.get('Strict-Transport-Security'),/max-age=/);
});
